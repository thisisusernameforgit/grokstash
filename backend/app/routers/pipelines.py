import datetime
import pathlib
from typing import List

import aiofiles
from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel

import config
from config import PIPELINE_DIR

router = APIRouter(prefix="/api/pipeline", tags=["pipelines"])


class PipelineMeta(BaseModel):
    name: str
    size: int
    mtime: datetime.datetime
    enabled: bool
    vendor: bool = False


class RenameRequest(BaseModel):
    new_name: str


def list_pipelines() -> List[PipelineMeta]:
    res: List[PipelineMeta] = []
    for p in PIPELINE_DIR.iterdir():
        if not p.is_file():
            continue

        if p.name.endswith(".conf"):
            logical = p.name
            enabled = True
        elif p.name.endswith(".conf.disabled"):
            logical = p.name[: -len(".disabled")]
            enabled = False
        else:
            continue

        st = p.stat()
        res.append(
            PipelineMeta(
                name=logical,
                size=st.st_size,
                mtime=datetime.datetime.fromtimestamp(st.st_mtime, datetime.UTC),
                enabled=enabled,
                vendor=logical in config.VENDOR_PIPELINES,
            )
        )
    return sorted(res, key=lambda x: x.name)


def pipeline_path(fname: str) -> tuple[pathlib.Path, bool]:
    """Возвращает путь к файлу пайплайна и признак «включен»."""
    path = PIPELINE_DIR / fname
    if path.exists():
        return path, True
    disabled = PIPELINE_DIR / f"{fname}.disabled"
    return disabled, False


def _safe_name(name: str) -> None:
    if "/" in name or ".." in name:
        raise HTTPException(400, "bad filename")


def _logical(name: str) -> str:
    return name[: -len(".disabled")] if name.endswith(".disabled") else name


def _assert_editable(name: str) -> None:
    """Вендорские парсеры SIEM меняются только в репозитории."""
    if _logical(name) in config.VENDOR_PIPELINES:
        raise HTTPException(403, "vendor pipeline is read-only")


@router.get("", response_model=list[PipelineMeta])
async def pipeline_list():
    return list_pipelines()


@router.post("/upload")
async def pipeline_upload(file: UploadFile = File(...)):
    if not file.filename or not file.filename.endswith(".conf"):
        raise HTTPException(400, "only .conf allowed")
    _safe_name(file.filename)
    _assert_editable(file.filename)

    dst = PIPELINE_DIR / file.filename
    tmp = dst.with_name(dst.name + ".tmp")

    async with aiofiles.open(tmp, "wb") as f:
        while chunk := await file.read(65536):
            await f.write(chunk)
    tmp.replace(dst)
    return {"ok": True, "uploaded": file.filename}


@router.get("/{fname}", response_class=PlainTextResponse)
async def pipeline_get(fname: str):
    _safe_name(fname)
    path, _ = pipeline_path(fname)
    if not path.exists():
        raise HTTPException(404, "not found")
    return path.read_text(encoding="utf-8", errors="ignore")


@router.put("/{fname}", response_class=PlainTextResponse)
async def pipeline_save(fname: str, request: Request):
    _safe_name(fname)
    if not fname.endswith(".conf"):
        raise HTTPException(400, "only .conf allowed")
    _assert_editable(fname)
    content = await request.body()
    path = PIPELINE_DIR / fname
    tmp = path.with_name(path.name + ".tmp")
    async with aiofiles.open(tmp, "wb") as f:
        await f.write(content)
    tmp.replace(path)
    return "ok"


@router.delete("/{fname}")
async def pipeline_delete(fname: str):
    _safe_name(fname)
    _assert_editable(fname)
    for real in (PIPELINE_DIR / fname, PIPELINE_DIR / f"{fname}.disabled"):
        if real.exists():
            real.unlink()
            return {"ok": True, "deleted": fname}
    raise HTTPException(404, "not found")


@router.get("/{fname}/download")
async def pipeline_download(fname: str):
    _safe_name(fname)
    path, _ = pipeline_path(fname)
    if not path.exists():
        raise HTTPException(404, "not found")
    return FileResponse(path, filename=fname, media_type="text/plain")


@router.post("/{fname}/enable")
async def pipeline_enable(fname: str):
    _safe_name(fname)
    _assert_editable(fname)
    src = PIPELINE_DIR / f"{fname}.disabled"
    dst = PIPELINE_DIR / fname
    if not src.exists():
        raise HTTPException(404, "file not disabled")
    src.replace(dst)
    return {"ok": True, "enabled": fname}


@router.post("/{fname}/disable")
async def pipeline_disable(fname: str):
    _safe_name(fname)
    _assert_editable(fname)
    src = PIPELINE_DIR / fname
    dst = PIPELINE_DIR / f"{fname}.disabled"
    if not src.exists():
        raise HTTPException(404, "file not enabled")
    src.replace(dst)
    return {"ok": True, "disabled": fname}


@router.post("/{fname}/rename")
async def pipeline_rename(fname: str, req: RenameRequest):
    _safe_name(fname)
    _safe_name(req.new_name)
    _assert_editable(fname)
    _assert_editable(req.new_name)
    if not req.new_name.endswith(".conf"):
        raise HTTPException(400, "only .conf allowed")

    # Имя приходит в логическом виде; .disabled допускаем для внешних клиентов
    if fname.endswith(".disabled"):
        fname = fname[: -len(".disabled")]

    src, enabled = pipeline_path(fname)
    if not src.exists():
        raise HTTPException(404, "not found")

    if (PIPELINE_DIR / req.new_name).exists() or (
        PIPELINE_DIR / f"{req.new_name}.disabled"
    ).exists():
        raise HTTPException(409, "target already exists")

    dst = PIPELINE_DIR / req.new_name if enabled else PIPELINE_DIR / f"{req.new_name}.disabled"
    src.replace(dst)
    return {"ok": True, "old": fname, "new": req.new_name, "enabled": enabled}
