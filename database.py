import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base

DB_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./quiz_bot.db")

if DB_URL.startswith("sqlite"):
    engine = create_async_engine(DB_URL, echo=False)
else:
    # PostgreSQL kabi haqiqiy serverlar uchun ulanishlar hovuzi (Connection Pooling)
    engine = create_async_engine(DB_URL, echo=False, pool_size=50, max_overflow=20)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
