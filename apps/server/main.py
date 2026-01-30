from fastapi import FastAPI
try:
    from apps.server.api.routes import router as api_router
except ImportError:
    from api.routes import router as api_router

app = FastAPI()

app.include_router(api_router)

@app.get("/")
def read_root():
    return {"status": "ok", "service": "Live Translator Server"}