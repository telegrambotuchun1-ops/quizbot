from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc, func
import random
import string
import os

from database import get_db, engine, Base
import models
import schemas

ADMIN_TELEGRAM_ID = os.getenv("ADMIN_TELEGRAM_ID", "123456789").strip()

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield

app = FastAPI(lifespan=lifespan)

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "message": "Server is running smoothly!"}

@app.post("/api/quiz")
async def create_quiz(quiz_data: schemas.QuizCreate, db: AsyncSession = Depends(get_db)):
    # Foydalanuvchini tekshirish yoki yaratish
    result = await db.execute(select(models.User).where(models.User.telegram_id == quiz_data.telegram_id))
    user = result.scalars().first()
    if not user:
        user = models.User(telegram_id=quiz_data.telegram_id)
        db.add(user)
        await db.commit()
        await db.refresh(user)

    # Noyob 6 xonali kod yaratish
    code = ''.join(random.choices(string.digits, k=6))
    while True:
        res = await db.execute(select(models.Quiz).where(models.Quiz.code == code))
        if not res.scalars().first():
            break
        code = ''.join(random.choices(string.digits, k=6))

    new_quiz = models.Quiz(
        code=code,
        creator_id=user.id,
        timer_per_question=quiz_data.timer_per_question
    )
    db.add(new_quiz)
    await db.commit()
    await db.refresh(new_quiz)

    # Savollarni qo'shish
    for q in quiz_data.questions:
        new_q = models.Question(
            quiz_id=new_quiz.id,
            text=q.text,
            option_a=q.option_a,
            option_b=q.option_b,
            option_c=q.option_c,
            option_d=q.option_d,
            correct_option=q.correct_option
        )
        db.add(new_q)
    
    await db.commit()
    return {"code": code}

@app.get("/api/quiz/{code}")
async def get_quiz(code: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Quiz).where(models.Quiz.code == code))
    quiz = result.scalars().first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz topilmadi")
    
    q_result = await db.execute(select(models.Question).where(models.Question.quiz_id == quiz.id))
    questions = q_result.scalars().all()

    return {
        "id": quiz.id,
        "code": quiz.code,
        "timer_per_question": quiz.timer_per_question,
        "questions": [
            {
                "text": q.text,
                "option_a": q.option_a,
                "option_b": q.option_b,
                "option_c": q.option_c,
                "option_d": q.option_d,
                "correct_option": q.correct_option
            } for q in questions
        ]
    }

@app.post("/api/result")
async def submit_result(res_data: schemas.SubmitResult, db: AsyncSession = Depends(get_db)):
    user_res = await db.execute(select(models.User).where(models.User.telegram_id == res_data.telegram_id))
    user = user_res.scalars().first()
    if not user:
        user = models.User(telegram_id=res_data.telegram_id)
        db.add(user)
        await db.commit()
        await db.refresh(user)
        
    quiz_res = await db.execute(select(models.Quiz).where(models.Quiz.code == res_data.quiz_code))
    quiz = quiz_res.scalars().first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz topilmadi")

    new_res = models.Result(
        user_id=user.id,
        quiz_id=quiz.id,
        chunk_range=res_data.chunk_range,
        correct_count=res_data.correct_count,
        incorrect_count=res_data.incorrect_count
    )
    db.add(new_res)
    await db.commit()
    return {"status": "success"}

@app.get("/api/results/{telegram_id}")
async def get_results(telegram_id: int, db: AsyncSession = Depends(get_db)):
    user_res = await db.execute(select(models.User).where(models.User.telegram_id == telegram_id))
    user = user_res.scalars().first()
    if not user:
        return []

    stmt = select(models.Result, models.Quiz.code).join(models.Quiz).where(models.Result.user_id == user.id).order_by(desc(models.Result.completed_at))
    res = await db.execute(stmt)
    
    data = []
    for r, code in res.all():
        data.append({
            "quiz_code": code,
            "chunk_range": r.chunk_range,
            "correct_count": r.correct_count,
            "incorrect_count": r.incorrect_count,
            "date": r.completed_at.strftime("%Y-%m-%d %H:%M")
        })
    return data

@app.get("/api/admin/check/{telegram_id}")
async def check_admin(telegram_id: str):
    is_admin = (telegram_id.strip() == ADMIN_TELEGRAM_ID)
    return {"is_admin": is_admin}

@app.get("/api/admin/quizzes")
async def get_admin_quizzes(telegram_id: str, db: AsyncSession = Depends(get_db)):
    if telegram_id.strip() != ADMIN_TELEGRAM_ID:
        raise HTTPException(status_code=403, detail="Forbidden")

    stmt = select(models.Quiz, models.User).join(models.User, models.Quiz.creator_id == models.User.id).order_by(desc(models.Quiz.created_at))
    quizzes_res = await db.execute(stmt)
    
    result_data = []
    for q, creator in quizzes_res.all():
        count_stmt = select(func.count(models.Question.id)).where(models.Question.quiz_id == q.id)
        count_res = await db.execute(count_stmt)
        total_questions = count_res.scalar()

        part_stmt = select(models.Result, models.User).join(models.User).where(models.Result.quiz_id == q.id)
        res = await db.execute(part_stmt)
        
        participants = []
        for r, u in res.all():
            participants.append({
                "first_name": u.first_name,
                "username": u.username,
                "chunk_range": r.chunk_range,
                "correct": r.correct_count,
                "incorrect": r.incorrect_count,
                "date": r.completed_at.strftime("%Y-%m-%d %H:%M")
            })
            
        result_data.append({
            "code": q.code,
            "created_at": q.created_at.strftime("%Y-%m-%d %H:%M"),
            "creator_name": creator.first_name,
            "creator_username": creator.username,
            "total_questions": total_questions,
            "participants": participants
        })
        
    return result_data

@app.delete("/api/admin/quiz/{code}")
async def delete_quiz(code: str, telegram_id: str, db: AsyncSession = Depends(get_db)):
    if telegram_id.strip() != ADMIN_TELEGRAM_ID:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    stmt = select(models.Quiz).where(models.Quiz.code == code)
    res = await db.execute(stmt)
    quiz = res.scalars().first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz topilmadi")
    
    await db.delete(quiz)
    await db.commit()
    return {"status": "success"}

# Statik fayllarni ulash
os.makedirs("static", exist_ok=True)
app.mount("/", StaticFiles(directory="static", html=True), name="static")
