import asyncio
import logging
import os
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import engine, Base, AsyncSessionLocal
import models

API_TOKEN = os.getenv('BOT_TOKEN', 'YOUR_BOT_TOKEN_HERE')
WEBAPP_URL = os.getenv('WEBAPP_URL', 'https://your-ngrok-url.ngrok.app')

logging.basicConfig(level=logging.INFO)

bot = Bot(token=API_TOKEN)
dp = Dispatcher()

async def get_or_create_user(telegram_id: int, first_name: str, username: str):
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(models.User).where(models.User.telegram_id == telegram_id))
        user = result.scalars().first()
        if not user:
            user = models.User(telegram_id=telegram_id, first_name=first_name, username=username)
            session.add(user)
            await session.commit()
        return user

@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    await get_or_create_user(message.from_user.id, message.from_user.first_name, message.from_user.username)
    
    markup = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🎓 O'quv Yordamchisi", web_app=WebAppInfo(url=WEBAPP_URL))]
    ])
    
    await message.answer(
        "Salom! Men sizning o'quv yordamchingizman.\n"
        "Quyidagi tugmani bosib tizimga kiring va test ishlashni yoki yangi test yaratishni boshlang!",
        reply_markup=markup
    )

async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
