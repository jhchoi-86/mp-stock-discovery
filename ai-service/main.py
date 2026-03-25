import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "../.env"))

from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db, engine
from llm_router import router as llm_router
from anomaly_router import router as anomaly_router
from news_router import router as news_router

app = FastAPI(title="MP Stock AI Microservice")

app.include_router(llm_router, prefix="/api/v1")
app.include_router(anomaly_router, prefix="/api/v1")
app.include_router(news_router, prefix="/api/v1")

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "MP Stock AI Microservice"
    }

if __name__ == "__main__":
    import uvicorn
    # Red Team Action 1: 망 분리 및 포트 보안 (Localhost 바인딩 강제)
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
