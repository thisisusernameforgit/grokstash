import json
from typing import Dict, List

import aiofiles
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import config
import core

router = APIRouter(prefix="/api/fixtures", tags=["fixtures"])


class FixtureSave(BaseModel):
    name: str
    namespace: str | None = None
    log: str
    expect: Dict[str, str] = {}


def load_fixtures() -> List[dict]:
    items: List[dict] = []
    for path in sorted(config.FIXTURE_DIR.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception as e:
            items.append({"file": path.name, "name": path.name, "error": f"не разобран JSON: {e}"})
            continue
        if not isinstance(data, dict):
            items.append({"file": path.name, "name": path.name, "error": "ожидался объект"})
            continue
        data["file"] = path.name
        items.append(data)
    return items


@router.get("")
async def fixtures_list():
    return load_fixtures()


@router.post("")
async def fixtures_save(case: FixtureSave):
    if not case.log.strip():
        raise HTTPException(400, "empty log")
    path = config.FIXTURE_DIR / f"{core.slug(case.name)}.json"
    payload = {
        "name": case.name,
        "namespace": case.namespace,
        "log": case.log,
        "expect": case.expect,
    }
    async with aiofiles.open(path, "w", encoding="utf-8") as f:
        await f.write(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    return {"ok": True, "file": path.name}


@router.post("/run")
async def fixtures_run():
    cases = load_fixtures()
    results: List[dict] = []

    for case in cases:
        name = case.get("name") or case.get("file")
        if case.get("error"):
            results.append({"file": case["file"], "name": name, "ok": False, "error": case["error"]})
            continue

        log = case.get("log")
        if not isinstance(log, str) or not log.strip():
            results.append({"file": case["file"], "name": name, "ok": False, "error": "нет поля log"})
            continue

        pairs = await core.parse_lines([log], case.get("namespace") or "")
        _, event = pairs[0] if pairs else (log, None)
        if event is None:
            results.append({"file": case["file"], "name": name, "ok": False, "error": "Logstash не вернул событие"})
            continue

        flat = core.flatten(event)
        tags = event.get("tags") if isinstance(event.get("tags"), list) else []
        expect = case.get("expect") or {}
        diffs: List[dict] = []

        for field, want in expect.items():
            got = flat.get(field)
            if got != str(want):
                diffs.append({"field": field, "expected": str(want), "actual": got})

        if "expect" not in case or "tags" not in expect:
            bad_tags = [str(t) for t in tags if str(t).startswith("_grokparsefailure")]
            if bad_tags:
                diffs.append({"field": "tags", "expected": "без тегов ошибок", "actual": ", ".join(bad_tags)})

        results.append({"file": case["file"], "name": name, "ok": not diffs, "diffs": diffs})

    passed = sum(1 for r in results if r.get("ok"))
    return {"total": len(results), "passed": passed, "failed": len(results) - passed, "results": results}


@router.delete("/{fname}")
async def fixtures_delete(fname: str):
    if "/" in fname or ".." in fname or not fname.endswith(".json"):
        raise HTTPException(400, "bad filename")
    path = config.FIXTURE_DIR / fname
    if not path.exists():
        raise HTTPException(404, "not found")
    path.unlink()
    return {"ok": True, "deleted": fname}
