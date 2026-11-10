import asyncio
import logging
import time

import httpx
from fastapi import APIRouter

import config
import core

lg = logging.getLogger("grokstash")
router = APIRouter(prefix="/api", tags=["service"])


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.get("/logstash/logs")
async def get_logstash_logs(limit: int = 100, level: str = "all"):
    result = await asyncio.to_thread(core.docker_logs_tail, limit, level, config.LOGSTASH_CONTAINER)
    if result is not None:
        return result

    fallback = await asyncio.to_thread(core.docker_logs_fallback, limit, level)
    if fallback is not None:
        return fallback

    return {"error": "No logs found", "details": "Docker CLI and file system access failed"}


@router.get("/logstash/status")
async def get_logstash_status():
    def _inspect(fmt: str) -> str:
        r = core.docker("inspect", "--format", fmt, config.LOGSTASH_CONTAINER, timeout=10)
        return r.stdout.strip() if r.returncode == 0 else "unknown"

    def _mem() -> str:
        r = core.docker("stats", "--no-stream", "--format", "{{.MemUsage}}", config.LOGSTASH_CONTAINER, timeout=10)
        return r.stdout.strip() if r.returncode == 0 else "unknown"

    try:
        status, health, started_at, memory_usage = await asyncio.gather(
            asyncio.to_thread(_inspect, "{{.State.Status}}"),
            asyncio.to_thread(_inspect, "{{.State.Health.Status}}"),
            asyncio.to_thread(_inspect, "{{.State.StartedAt}}"),
            asyncio.to_thread(_mem),
        )
        return {
            "status": status,
            "health": health,
            "started_at": started_at,
            "memory_usage": memory_usage,
            "timestamp": time.time(),
        }
    except Exception as e:
        lg.exception("Failed to get logstash status")
        return {"status": "error", "error": str(e)}


@router.get("/logstash/reload")
async def logstash_reload():
    """Последняя перезагрузка конфига: сколько удачных, сколько нет и текст ошибки."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(f"{config.LOGSTASH_API}/_node/stats/pipelines")
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        return {"ok": False, "error": str(e)}

    pipelines = data.get("pipelines") or {}
    info = pipelines.get("main") or (next(iter(pipelines.values())) if pipelines else {})
    return core.reload_state(info)


@router.post("/logstash/restart")
async def restart_logstash():
    try:
        result = await asyncio.to_thread(core.docker, "restart", config.LOGSTASH_CONTAINER)
        if result.returncode != 0:
            return {"error": "Failed to restart logstash", "details": result.stderr}
        return {"ok": True, "message": "Logstash restarted successfully"}
    except Exception as e:
        lg.exception("Failed to restart logstash")
        return {"error": str(e)}
