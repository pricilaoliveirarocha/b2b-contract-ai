from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings

app = FastAPI(title="b2b-contract-ai", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[get_settings().frontend_origin],
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
