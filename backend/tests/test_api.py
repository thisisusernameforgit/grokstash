import pathlib

import pytest
from fastapi.testclient import TestClient

import config
import core
import main

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def pipelines():
    d = pathlib.Path(config.PIPELINE_DIR)
    for p in d.iterdir():
        if p.is_file():
            p.unlink()
    (d / "10-a.conf").write_text("filter { }\n", encoding="utf-8")
    (d / "20-b.conf.disabled").write_text("filter { }\n", encoding="utf-8")
    yield


def test_list_shows_enabled_and_disabled():
    files = {f["name"]: f["enabled"] for f in client.get("/api/pipeline").json()}
    assert files == {"10-a.conf": True, "20-b.conf": False}


def test_get_rejects_path_traversal():
    for name in ["../etc/passwd", "..%2Fetc%2Fpasswd"]:
        r = client.get(f"/api/pipeline/{name}")
        assert r.status_code in (400, 404), name


def test_save_requires_conf_extension():
    r = client.put("/api/pipeline/30-c.txt", content=b"filter { }")
    assert r.status_code == 400


def test_disable_and_enable_roundtrip():
    assert client.post("/api/pipeline/10-a.conf/disable").status_code == 200
    assert (pathlib.Path(config.PIPELINE_DIR) / "10-a.conf.disabled").exists()
    assert client.post("/api/pipeline/10-a.conf/enable").status_code == 200
    assert (pathlib.Path(config.PIPELINE_DIR) / "10-a.conf").exists()


def test_rename_into_existing_returns_409():
    r = client.post("/api/pipeline/10-a.conf/rename", json={"new_name": "20-b.conf"})
    assert r.status_code == 409


def test_rename_keeps_disabled_state():
    r = client.post(
        "/api/pipeline/20-b.conf.disabled/rename", json={"new_name": "15-renamed.conf"}
    )
    assert r.status_code == 200
    d = pathlib.Path(config.PIPELINE_DIR)
    assert (d / "15-renamed.conf.disabled").exists()
    assert not (d / "15-renamed.conf").exists()
    assert r.json()["enabled"] is False


def test_rename_keeps_enabled_state():
    r = client.post("/api/pipeline/10-a.conf/rename", json={"new_name": "05-new.conf"})
    assert r.status_code == 200
    d = pathlib.Path(config.PIPELINE_DIR)
    assert (d / "05-new.conf").exists()
    assert not (d / "05-new.conf.disabled").exists()


def test_trace_rejects_empty_input():
    r = client.post("/api/log/trace", json={"text": "   \n  "})
    assert r.status_code == 400


def test_trace_rejects_huge_batch():
    text = "\n".join(f"line {i}" for i in range(config.MAX_BATCH + 1))
    r = client.post("/api/log/trace", json={"text": text})
    assert r.status_code == 400


def test_perf_validates_count_and_text():
    assert client.post("/api/perf", json={"text": "x", "count": 0}).status_code == 400
    assert client.post("/api/perf", json={"text": "x", "count": config.PERF_MAX + 1}).status_code == 400
    assert client.post("/api/perf", json={"text": "  ", "count": 1}).status_code == 400


def test_delete_missing_returns_404():
    assert client.delete("/api/pipeline/99-none.conf").status_code == 404


def test_health():
    assert client.get("/api/health").json() == {"status": "ok"}


def test_event_rejects_non_json():
    assert client.post("/api/event", content=b"not json").status_code == 400
    assert client.post("/api/event", json=[1, 2]).status_code == 400


def test_event_counts_perf_run():
    import state

    run = {"expected": 2, "received": 0, "done": __import__("asyncio").Event()}
    state.perf_runs["rid-test"] = run
    try:
        assert client.post("/api/event", json={"trace_id": "perf::rid-test::0"}).status_code == 204
        assert client.post("/api/event", json={"trace_id": "perf::rid-test::1"}).status_code == 204
        assert run["received"] == 2
        assert run["done"].is_set()
    finally:
        state.perf_runs.pop("rid-test", None)


def test_event_without_trace_id_is_ignored():
    assert client.post("/api/event", json={"message": "no id"}).status_code == 204


def test_flatten_nested_event():
    flat = core.flatten({"a": {"b": 1}, "c": [1, 2], "d": None, "e": []})
    assert flat == {"a.b": "1", "c": "1, 2", "d": "-", "e": "-"}


def test_fixtures_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "FIXTURE_DIR", tmp_path)
    assert client.get("/api/fixtures").json() == []

    r = client.post(
        "/api/fixtures",
        json={"name": "my case", "namespace": "demo", "log": "x", "expect": {"a.b": "1"}},
    )
    assert r.status_code == 200
    assert r.json()["file"] == "my-case.json"

    items = client.get("/api/fixtures").json()
    assert len(items) == 1
    assert items[0]["name"] == "my case"
    assert items[0]["expect"] == {"a.b": "1"}

    assert client.delete("/api/fixtures/my-case.json").status_code == 200
    assert client.get("/api/fixtures").json() == []


def test_fixture_requires_log(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "FIXTURE_DIR", tmp_path)
    assert client.post("/api/fixtures", json={"name": "x", "log": "   "}).status_code == 400


def test_fixture_delete_rejects_traversal(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "FIXTURE_DIR", tmp_path)
    for name in ["..%2Fetc.json", "x.txt"]:
        assert client.delete(f"/api/fixtures/{name}").status_code in (400, 404), name


def test_fixture_with_broken_json_is_reported(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "FIXTURE_DIR", tmp_path)
    (tmp_path / "broken.json").write_text("{ not json", encoding="utf-8")
    items = client.get("/api/fixtures").json()
    assert items[0]["file"] == "broken.json"
    assert "error" in items[0]


def test_reload_state_hides_stale_error():
    state = core.reload_state(
        {
            "reloads": {
                "successes": 5,
                "failures": 2,
                "last_error": {"message": "old failure"},
                "last_success_timestamp": "2026-11-10T09:18:29.000Z",
                "last_failure_timestamp": "2026-11-10T09:13:59.000Z",
            }
        }
    )
    assert state["last_error"] is None
    assert state["successes"] == 5


def test_reload_state_reports_fresh_error():
    state = core.reload_state(
        {
            "reloads": {
                "successes": 5,
                "failures": 3,
                "last_error": {"message": "Couldn't find plugin"},
                "last_success_timestamp": "2026-11-10T09:18:29.000Z",
                "last_failure_timestamp": "2026-11-10T09:19:00.000Z",
            }
        }
    )
    assert state["last_error"] == "Couldn't find plugin"


def test_namespaces_collected_from_pipelines(tmp_path, monkeypatch):
    own = tmp_path / "own"
    own.mkdir()
    (own / "a.conf").write_text(
        'filter { if [@metadata][namespace] == "demo" { } }', encoding="utf-8"
    )
    (own / "b.conf").write_text(
        'filter { if [@metadata][namespace] == "syslog-connector" { } }', encoding="utf-8"
    )
    monkeypatch.setattr(config, "PIPELINE_DIR", own)
    assert client.get("/api/namespaces").json() == ["demo", "syslog-connector"]


def test_vendor_pipeline_is_flagged_and_read_only(monkeypatch):
    monkeypatch.setattr(config, "VENDOR_PIPELINES", {"_cef_leef_mapping.conf"})
    d = pathlib.Path(config.PIPELINE_DIR)
    (d / "_cef_leef_mapping.conf").write_text("filter { }\n", encoding="utf-8")
    (d / "example.conf").write_text("filter { }\n", encoding="utf-8")

    items = {f["name"]: f["vendor"] for f in client.get("/api/pipeline").json()}
    assert items["_cef_leef_mapping.conf"] is True
    assert items["example.conf"] is False
    assert items["10-a.conf"] is False

    assert client.get("/api/pipeline/_cef_leef_mapping.conf").status_code == 200
    assert client.put("/api/pipeline/_cef_leef_mapping.conf", content=b"filter { }").status_code == 403
    assert client.delete("/api/pipeline/_cef_leef_mapping.conf").status_code == 403
    assert client.post("/api/pipeline/_cef_leef_mapping.conf/disable").status_code == 403
    assert client.post("/api/pipeline/_cef_leef_mapping.conf/enable").status_code == 403
    assert client.post(
        "/api/pipeline/_cef_leef_mapping.conf/rename", json={"new_name": "x.conf"}
    ).status_code == 403

    # демо-файл редактируется как обычный
    assert client.put("/api/pipeline/example.conf", content=b"filter { }").status_code == 200


def test_reload_state_without_stats():
    assert core.reload_state({}) == {
        "ok": True,
        "successes": None,
        "failures": None,
        "last_error": None,
        "last_success_timestamp": None,
        "last_failure_timestamp": None,
    }
