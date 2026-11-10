import asyncio
from collections import deque
from typing import Dict, List, Optional

from config import HISTORY_SIZE

# Ожидающие ответа Logstash запросы: trace_id -> future
pending: Dict[str, asyncio.Future] = {}
# Счетчики perf-прогонов: run_id -> {expected, received, done}
perf_runs: Dict[str, dict] = {}
# Последние разобранные события (GET /api/trace/history)
history: deque = deque(maxlen=HISTORY_SIZE)
# Кеш имен grok-паттернов
patterns_cache: Optional[List[str]] = None
