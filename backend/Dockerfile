ARG PYTHON_VERSION
FROM python:${PYTHON_VERSION}

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc build-essential curl docker-cli && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt /tmp/requirements.txt
RUN python -m pip install --upgrade pip && \
    pip install --no-cache-dir -r /tmp/requirements.txt

WORKDIR /app
COPY app /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4000"]
