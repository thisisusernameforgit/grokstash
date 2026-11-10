import asyncio
import contextlib
import time
import uuid
from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import config
import core
import state

router = APIRouter(prefix="/api", tags=["trace"])


class TraceRequest(BaseModel):
    text: str
    namespace: str | None = None


class PerfRequest(BaseModel):
    text: str
    count: int = 1000


@router.post("/log/trace")
async def log_trace(req: TraceRequest):
    lines = [l for l in req.text.splitlines() if l.strip()]
    if not lines:
        raise HTTPException(400, "empty")
    if len(lines) > config.MAX_BATCH:
        raise HTTPException(400, f"too many lines, max {config.MAX_BATCH}")

    pairs = await core.parse_lines(lines, req.namespace or "")

    events: List[dict] = []
    failed: List[dict] = []
    for idx, (src, ev) in enumerate(pairs):
        if ev is None:
            failed.append({"index": idx, "line": src[:300]})
            continue
        events.append(ev)
        core.push_history(src, ev)

    return {"ok": True, "events": events, "failed": failed}


@router.post("/perf")
async def perf_test(p: PerfRequest):
    if not p.text.strip():
        raise HTTPException(400, "empty")
    if not 1 <= p.count <= config.PERF_MAX:
        raise HTTPException(400, f"count должен быть от 1 до {config.PERF_MAX}")

    rid = uuid.uuid4().hex
    run = {"expected": p.count, "received": 0, "done": asyncio.Event()}
    state.perf_runs[rid] = run
    prefix = f"{config.PERF_PREFIX}{rid}::"

    start = time.perf_counter()
    try:
        try:
            _, writer = await asyncio.open_connection(config.LOGSTASH_HOST, config.LOGSTASH_PORT)
        except OSError as e:
            raise HTTPException(502, f"logstash недоступен: {e}")

        for i in range(p.count):
            writer.write(f"{prefix}{i}||{p.text}\n".encode())

        try:
            await writer.drain()
        finally:
            writer.close()
            with contextlib.suppress(Exception):
                await writer.wait_closed()

        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(run["done"].wait(), timeout=max(10.0, p.count / 200.0))
    finally:
        state.perf_runs.pop(rid, None)

    dur = time.perf_counter() - start
    received = run["received"]
    return {
        "sent": p.count,
        "received": received,
        "seconds": round(dur, 3),
        "eps": int(received / dur) if dur > 0 else 0,
        "complete": received >= p.count,
    }


@router.get("/trace/history")
async def trace_history(limit: int = 20):
    return list(state.history)[:limit]


@router.get("/patterns")
async def patterns():
    return core.load_patterns()


@router.get("/namespaces")
async def namespaces():
    return core.collect_namespaces()
