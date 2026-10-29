#!/bin/sh
set -e

if [ "$ENVIRONMENT" = "development" ]; then
  echo "Starting in development mode with reload"
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --timeout-keep-alive 480
else
  echo "Running database migrations..."
  cd /app && alembic upgrade head
  echo "Starting in production mode with Gunicorn + Uvicorn workers"
  # WEB_CONCURRENCY is the standard name (Heroku/gunicorn convention).
  # GUNICORN_WORKERS is kept as a fallback for existing .env files.
  # Default 2 workers — sized for the 2 GB production host.
  if [ -n "$WEB_CONCURRENCY" ]; then
    WORKERS=$WEB_CONCURRENCY
  elif [ -n "$GUNICORN_WORKERS" ]; then
    WORKERS=$GUNICORN_WORKERS
  else
    WORKERS=2
  fi
  echo "Using $WORKERS Gunicorn workers"
  # --timeout/--keep-alive/--graceful-timeout stay at 480s to match long SSE compares.
  # --max-requests recycles workers to curb unbounded memory growth.
  exec gunicorn app.main:app \
    -k uvicorn.workers.UvicornWorker \
    --bind 0.0.0.0:8000 \
    --workers "$WORKERS" \
    --timeout 480 \
    --keep-alive 480 \
    --graceful-timeout 480 \
    --max-requests 1000 \
    --max-requests-jitter 100
fi
