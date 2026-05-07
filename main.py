import asyncio
import logging
import os
import uvicorn
from api import app
from bot import dp, bot, engine, Base

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def run_bot():
    # Ma'lumotlar bazasini tekshirish/yaratish
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    logger.info("Bot polling rejimi boshlanmoqda...")
    await dp.start_polling(bot)

async def main():
    # Railway taqdim etadigan PORT
    port = int(os.getenv("PORT", "8000"))
    
    # Uvicorn server konfiguratsiyasi
    config = uvicorn.Config(
        app, 
        host="0.0.0.0", 
        port=port, 
        log_level="info",
        proxy_headers=True,
        forwarded_allow_ips="*"
    )
    server = uvicorn.Server(config)
    
    logger.info(f"Server {port}-portda ishga tushmoqda...")
    
    # Ikkala jarayonni parallel yurgizish
    await asyncio.gather(
        server.serve(),
        run_bot()
    )

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Dastur to'xtatildi.")
