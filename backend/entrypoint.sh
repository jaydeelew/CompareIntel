#!/bin/sh
set -e

if [ "$ENVIRONMENT" = "development" ]; then
  echo "Starting in development mode with reload"
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --timeout-keep-alive 480
else
  echo "Running database migrations..."
  cd /app && alembic upgrade head
  echo "Starting in production mode with Gunicorn + Uvicorn workers"
  # GUNICORN_WORKERS env var allows customization; defaults to 4 if unset
  WORKERS=${GUNICORN_WORKERS:-4}
  echo "Using $WORKERS Gunicorn workers"
  exec gunicorn app.main:app -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 --workers $WORKERS --timeout 480 --keep-alive 480
fi
