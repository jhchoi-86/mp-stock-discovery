import os
from pathlib import Path
from uuid import uuid4
from dotenv import load_dotenv

# [TASK-P01] .env 절대경로 로딩 보장
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR.parent / ".env")

from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db, engine
from llm_router import router as llm_router
from anomaly_router import router as anomaly_router
from news_router import router as news_router

from starlette.requests import Request as StarletteRequest
from starlette.responses import JSONResponse
import logging

# [TASK-CC01] 내부 API 보안을 위한 인증 종속성
from fastapi import Header

async def verify_internal_key(x_internal_api_key: str = Header(None)):
    secret = os.getenv("INTERNAL_API_SECRET", "fallback_secret")
    if not x_internal_api_key or x_internal_api_key != secret:
        logger.warning(f"❌ [Auth] Unauthorized internal API access attempt.")
        raise HTTPException(status_code=403, detail="Forbidden: Invalid internal API key")
    return x_internal_api_key

# Configure root logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("uvicorn.error")

app = FastAPI(title="MP Stock AI Microservice")

@app.exception_handler(Exception)
async def global_exception_handler(request: StarletteRequest, exc: Exception):
    # [TASK-P02] 민감 정보 마스킹 및 Error ID 부여
    error_id = str(uuid4())
    logger.error(f"GLOBAL CRITICAL ERROR [{error_id}]: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal Server Error", 
            "error_id": error_id,
            "message": "상세 에러는 관리자에게 문의하세요."
        },
    )

app.include_router(llm_router, prefix="/api/v1", dependencies=[Depends(verify_internal_key)])
app.include_router(anomaly_router, prefix="/api/v1")
app.include_router(news_router, prefix="/api/v1")

@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    # [TASK-P05] DB 연결 상태 포함
    try:
        db.execute(text("SELECT 1"))
        return {
            "status": "ok",
            "db": "connected",
            "service": "MP Stock AI Microservice"
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=503, detail="Database connection failed")

if __name__ == "__main__":
    import uvicorn
    # [TASK-P03] Concurrency 개선 (워커 증설)
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False, workers=2)
