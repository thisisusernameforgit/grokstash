import logging

from fastapi import FastAPI
from pythonjsonlogger import jsonlogger

from routers import events, fixtures, pipelines, service, trace

lg = logging.getLogger("grokstash")
lg.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(jsonlogger.JsonFormatter())
lg.addHandler(handler)

app = FastAPI(title="Grokstash API", version="0.5.0")
app.include_router(events.router)
app.include_router(pipelines.router)
app.include_router(fixtures.router)
app.include_router(trace.router)
app.include_router(service.router)
