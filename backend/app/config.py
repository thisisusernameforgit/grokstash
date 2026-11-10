import os
import pathlib

PIPELINE_DIR = pathlib.Path(os.getenv("PIPELINE_DIR", "/pipeline"))
PIPELINE_DIR.mkdir(parents=True, exist_ok=True)

FIXTURE_DIR = pathlib.Path(os.getenv("FIXTURE_DIR", "/fixtures"))
FIXTURE_DIR.mkdir(parents=True, exist_ok=True)

PATTERN_DIR = pathlib.Path(os.getenv("PATTERN_DIR", "/usr/share/logstash/patterns"))

# Вендорские парсеры SIEM: лежат в общем каталоге (Logstash читает один glob),
# но помечаются в API и защищены от правки из UI
VENDOR_PIPELINES = {
    name.strip()
    for name in os.getenv(
        "VENDOR_PIPELINES",
        "02-fix_timestamp.conf,05-normalize_filters.conf,___connectors_mapping.conf,"
        "___grokstash_ns_override.conf,__syslog_parser.conf,_cef_leef_mapping.conf,"
        "_custom-syslog.conf",
    ).split(",")
    if name.strip()
}

LOGSTASH_HOST = os.getenv("LOGSTASH_HOST", "logstash")
LOGSTASH_PORT = int(os.getenv("GROKSTASH_SYSLOG_PORT", 1514))
LOGSTASH_API = os.getenv("LOGSTASH_API", f"http://{LOGSTASH_HOST}:9600")
LOGSTASH_CONTAINER = os.getenv("LOGSTASH_CONTAINER", "grokstash_logstash")

TRACE_TIMEOUT = float(os.getenv("TRACE_TIMEOUT", 5))
MAX_BATCH = 5000
PERF_MAX = 20000
PERF_PREFIX = "perf::"
HISTORY_SIZE = 100
