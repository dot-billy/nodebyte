#!/bin/sh
set -eu

cd /app

echo "Syncing frontend dependencies..."
npm install

exec npm run dev -- --hostname 0.0.0.0 --port 3000
