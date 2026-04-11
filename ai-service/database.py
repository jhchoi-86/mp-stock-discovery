import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("[AI-Service] Warning: DATABASE_URL not set. Database features will be unavailable.")
    DATABASE_URL = "postgresql://dummy:dummy@localhost/dummy"
else:
    # [TASK-P05] psycopg2 incompatibility fix: Remove 'schema' param and quotes
    DATABASE_URL = DATABASE_URL.replace('"', '').replace("'", "")
    if '?' in DATABASE_URL and 'schema=' in DATABASE_URL:
        # Prisma-style schema param is not natively supported by basic psycopg2 DSN
        base_url, query = DATABASE_URL.split('?', 1)
        params = query.split('&')
        filtered_params = [p for p in params if not p.startswith('schema=')]
        if filtered_params:
            DATABASE_URL = f"{base_url}?{'&'.join(filtered_params)}"
        else:
            DATABASE_URL = base_url
    print(f"[AI-Service] Final DATABASE_URL: {DATABASE_URL}")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
