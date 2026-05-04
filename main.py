import asyncio
import logging
import os
import uvicorn
from api import app
from bot import dp, bot, engine, Base

logging.basicConfig(level=logging.INFO)

async def run_bot():
    # Baza jadvallarini yaratish (faqat birinchi marta ishlaganda kerak)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Botni ishga tushirish
    await dp.start_polling(bot)

async def main():
    # Server portini o'qish (Railway o'zi PORT o'zgaruvchisini beradi)
    port = int(os.getenv("PORT", "8000"))
    
    # Uvicorn server konfiguratsiyasi (FastAPI uchun)
    config = uvicorn.Config("api:app", host="0.0.0.0", port=port, log_level="info")
    server = uvicorn.Server(config)
    
    # Ikkala jarayonni (Bot va Serverni) bir vaqtda ishga tushirish
    await asyncio.gather(
        server.serve(),
        run_bot()
    )

if __name__ == "__main__":
    asyncio.run(main())
