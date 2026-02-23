#!/bin/sh
set -eu

cd /app

if [ "${NODE_ENV:-development}" = "production" ]; then
  echo "Building frontend for production..."
  npm run build
  exec npm run start -- --hostname 0.0.0.0 --port 3000
else
  echo "Syncing frontend dependencies..."
  npm install
  exec npm run dev -- --hostname 0.0.0.0 --port 3000
fi
