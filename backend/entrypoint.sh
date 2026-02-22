#!/bin/sh
set -eu

echo "Running migrations..."
tries=0
until alembic upgrade head; do
  tries=$((tries + 1))
  if [ "$tries" -ge 30 ]; then
    echo "Migrations failed after ${tries} attempts."
    exit 1
  fi
  echo "Migration attempt ${tries} failed; waiting for database..."
  sleep 2
done

echo "Starting API..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

