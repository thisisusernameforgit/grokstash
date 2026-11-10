import os
import pathlib
import sys
import tempfile

TEST_PIPELINE_DIR = tempfile.mkdtemp(prefix="grokstash-tests-")
REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]

os.environ["PIPELINE_DIR"] = TEST_PIPELINE_DIR
os.environ["FIXTURE_DIR"] = tempfile.mkdtemp(prefix="grokstash-fixtures-")
os.environ["PATTERN_DIR"] = str(REPO_ROOT / "logstash" / "patterns")
os.environ["LOGSTASH_HOST"] = "127.0.0.1"
os.environ["GROKSTASH_SYSLOG_PORT"] = "15998"

sys.path.insert(0, str(REPO_ROOT / "backend" / "app"))
