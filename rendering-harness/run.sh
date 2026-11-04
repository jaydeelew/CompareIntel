#!/bin/bash
# Helper script to run the harness with Vite dev server

set -e

echo "Starting Vite dev server..."
npm run dev &
VITE_PID=$!

# Wait for Vite to be ready
echo "Waiting for Vite to start..."
sleep 5

# Trap to kill Vite on exit
trap "kill $VITE_PID 2>/dev/null || true" EXIT

# Run the harness
echo "Running harness..."
npm run harness "$@"

echo "Harness complete!"
