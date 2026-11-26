FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DATA_STORAGE_ROOT=/var/lib/datasense/storage \
    DUCKDB_TEMP_DIRECTORY=/var/lib/datasense/storage/temp/duckdb

WORKDIR /app

# Create non-root runtime user and storage directory
RUN addgroup --system --gid 1000 datasense \
    && adduser --system --uid 1000 --ingroup datasense datasense \
    && mkdir -p /var/lib/datasense/storage/temp/duckdb \
    && chown -R datasense:datasense /var/lib/datasense

COPY services/api/pyproject.toml /app/pyproject.toml
COPY services/api/alembic.ini /app/alembic.ini
COPY services/api/alembic /app/alembic
COPY services/api/app /app/app

RUN pip install --upgrade pip \
    && pip install --no-cache-dir . \
    && chown -R datasense:datasense /app

USER datasense

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health/live', timeout=3)"

CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${WEB_CONCURRENCY:-1}"]
