#!/bin/sh
set -e

if [ "$ENVIRONMENT" = "development" ]; then
  echo "Starting in development mode with reload"
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --timeout-keep-alive 480
else
  echo "Running database migrations..."
  cd /app && alembic upgrade head
  echo "Starting in production mode with Gunicorn + Uvicorn workers"
  exec gunicorn app.main:app -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 --workers 4 --timeout 480 --keep-alive 480
fi
