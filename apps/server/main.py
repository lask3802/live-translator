from fastapi import FastAPI
import logging
from dotenv import load_dotenv
try:
    from apps.server.api.routes import router as api_router
except ImportError:
    from api.routes import router as api_router

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)

app = FastAPI()

app.include_router(api_router)

@app.get("/")
def read_root():
    return {"status": "ok", "service": "Live Translator Server"}