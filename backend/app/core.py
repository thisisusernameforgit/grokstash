import asyncio
import contextlib
import glob
import json
import logging
import os
import re
import subprocess
import time
import uuid
from typing import Dict, List, Optional

from config import (
    LOGSTASH_HOST,
    LOGSTASH_PORT,
    PATTERN_DIR,
    PERF_PREFIX,
    TRACE_TIMEOUT,
)
import config
import state

lg = logging.getLogger("grokstash")


def docker(*args: str, timeout: int = 30) -> subprocess.CompletedProcess:
    return subprocess.run(["docker", *args], capture_output=True, text=True, timeout=timeout)


def docker_logs_tail(limit: int, level: str, container: str) -> Optional[dict]:
    try:
        result = docker("logs", "--tail", str(limit), container)
        if result.returncode != 0:
            return None
        combined = (result.stdout + result.stderr).strip()
        logs = combined.split("\n") if combined else []
        if level != "all":
            logs = [l for l in logs if level.upper() in l.upper()]
        logs.reverse()
        return {"logs": logs, "count": len(logs), "level": level, "source": "docker_api"}
    except Exception as e:
        lg.warning(f"Docker CLI failed: {e}")
        return None


def docker_logs_fallback(limit: int, level: str) -> Optional[dict]:
    for pattern in [
        "/var/lib/docker/containers/*/grokstash_logstash-*/grokstash_logstash-*.log",
        "/var/log/containers/grokstash_logstash-*.log",
    ]:
        files = glob.glob(pattern)
        if not files:
            continue
        try:
            latest = max(files, key=os.path.getctime)
            with open(latest, encoding="utf-8", errors="ignore") as f:
                logs = [l.strip() for l in f.readlines()[-limit:]]
            if level != "all":
                logs = [l for l in logs if level.upper() in l.upper()]
            logs.reverse()
            return {"logs": logs, "count": len(logs), "level": level, "source": "file_system"}
        except Exception as e:
            lg.warning(f"File system access failed: {e}")
    return None


def flatten(obj, prefix: str = "") -> Dict[str, str]:
    """Плоское представление события в dot-notation, как в UI."""
    out: Dict[str, str] = {}
    if not isinstance(obj, dict):
        return out
    for key, value in obj.items():
        full = f"{prefix}.{key}" if prefix else str(key)
        if isinstance(value, dict):
            out.update(flatten(value, full))
        elif isinstance(value, list):
            if not value:
                out[full] = "-"
            else:
                out[full] = ", ".join(
                    json.dumps(v, ensure_ascii=False) if isinstance(v, dict) else str(v)
                    for v in value
                )
        elif value is None:
            out[full] = "-"
        else:
            out[full] = str(value)
    return out


def slug(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "-", name.strip()).strip("-.")
    return cleaned or "fixture"


def push_history(src: str, evt: dict) -> None:
    state.history.appendleft({"ts": time.time(), "src": src, "event": evt})


def load_patterns() -> List[str]:
    if state.patterns_cache is not None:
        return state.patterns_cache

    pats: List[str] = []
    for file in PATTERN_DIR.rglob("*"):
        if not file.is_file():
            continue
        for line in file.read_text(encoding="utf-8", errors="ignore").splitlines():
            if line.startswith("#") or not line.strip():
                continue
            name = line.split(" ", 1)[0]
            if name.isidentifier():
                pats.append(name)
    state.patterns_cache = sorted(set(pats))
    return state.patterns_cache


NAMESPACE_RE = re.compile(r'\[@metadata\]\[namespace\]\s*==\s*"([^"]+)"')


def collect_namespaces() -> List[str]:
    """Namespace, которые встречаются в условиях своих и вендорских пайплайнов."""
    found = set()
    for directory in (config.PIPELINE_DIR,):
        if not directory.is_dir():
            continue
        for path in directory.glob("*.conf"):
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            found.update(NAMESPACE_RE.findall(text))
    return sorted(found)


def reload_state(info: dict) -> dict:
    """Последняя перезагрузка конфига. Ошибка отдается, только если она свежее последнего успеха."""
    reloads = info.get("reloads") or {}

    err = reloads.get("last_error")
    if isinstance(err, dict):
        err = err.get("message") or json.dumps(err, ensure_ascii=False)

    last_ok = reloads.get("last_success_timestamp")
    last_fail = reloads.get("last_failure_timestamp")
    fresh_failure = bool(err) and (not last_ok or str(last_fail or "") > str(last_ok))

    return {
        "ok": True,
        "successes": reloads.get("successes"),
        "failures": reloads.get("failures"),
        "last_error": err if fresh_failure else None,
        "last_success_timestamp": last_ok,
        "last_failure_timestamp": last_fail,
    }


def handle_back_event(event: dict) -> None:
    """Событие от Logstash: либо perf-счетчик, либо ожидающий запрос по trace_id."""
    tid = event.pop("trace_id", None)
    if not tid:
        return

    if tid.startswith(PERF_PREFIX):
        rid = tid[len(PERF_PREFIX):].split("::", 1)[0]
        run = state.perf_runs.get(rid)
        if run is not None:
            run["received"] += 1
            if run["received"] >= run["expected"]:
                run["done"].set()
        return

    fut = state.pending.pop(tid, None)
    if fut is not None and not fut.done():
        fut.set_result(event)


async def parse_lines(lines: List[str], namespace: str) -> List[tuple]:
    """Отправляет строки в Logstash и возвращает пары (строка, событие или None)."""
    from fastapi import HTTPException

    try:
        _, writer = await asyncio.open_connection(LOGSTASH_HOST, LOGSTASH_PORT)
    except OSError as e:
        raise HTTPException(502, f"logstash недоступен: {e}")

    loop = asyncio.get_running_loop()
    futs: List[asyncio.Future] = []
    trace_ids: List[str] = []

    try:
        for line in lines:
            trace_id = uuid.uuid4().hex
            fut = loop.create_future()
            state.pending[trace_id] = fut
            trace_ids.append(trace_id)
            futs.append(fut)
            writer.write(f"{trace_id}|{namespace}|{line}\n".encode())

        try:
            await writer.drain()
        finally:
            writer.close()
            with contextlib.suppress(Exception):
                await writer.wait_closed()

        async def _wait(f: asyncio.Future):
            try:
                return await asyncio.wait_for(f, timeout=TRACE_TIMEOUT)
            except Exception:
                return None

        results = await asyncio.gather(*(_wait(f) for f in futs))
        return list(zip(lines, results))
    finally:
        for tid in trace_ids:
            state.pending.pop(tid, None)
