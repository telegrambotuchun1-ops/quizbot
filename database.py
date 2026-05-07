import os
from sqlalchemy.orm import declarative_base
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

# Railway Volume yoki Mahalliy bazani tanlash
db_path = "./quiz_bot.db"
if os.path.exists("/data"):
    db_path = "/data/quiz_bot.db"

DB_URL = os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")

# Engine konfiguratsiyasi
if DB_URL.startswith("sqlite"):
    engine = create_async_engine(DB_URL, echo=False)
else:
    engine = create_async_engine(DB_URL, echo=False, pool_size=20, max_overflow=10)

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)
Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
