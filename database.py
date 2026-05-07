import os
from sqlalchemy.orm import declarative_base
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
db_path = "./quiz_bot.db"
if os.path.exists("/data"):
    db_path = "/data/quiz_bot.db"

DB_URL = os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")

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
