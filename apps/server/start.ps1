# Start the Live Translator Server using uv
# Usage: .\start.ps1 [port]

param(
    [int]$Port = 8001
)

Write-Host "Starting Live Translator Server on port $Port..." -ForegroundColor Cyan

uv run uvicorn main:app --host 0.0.0.0 --port $Port --reload
