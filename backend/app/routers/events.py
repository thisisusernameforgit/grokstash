from fastapi import APIRouter, HTTPException, Request, Response

import core

router = APIRouter(prefix="/api", tags=["events"])


@router.post("/event")
async def receive_event(request: Request):
    """Обратный канал: Logstash отдает сюда каждое разобранное событие."""
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(400, "bad json")
    if not isinstance(payload, dict):
        raise HTTPException(400, "expected object")

    core.handle_back_event(payload)
    return Response(status_code=204)
