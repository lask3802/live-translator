#!/bin/bash
# Start the Live Translator Server using uv
# Usage: ./start.sh [port]

PORT=${1:-8001}

echo "Starting Live Translator Server on port $PORT..."

uv run uvicorn main:app --host 0.0.0.0 --port $PORT --reload
