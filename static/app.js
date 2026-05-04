const tg = window.Telegram.WebApp;
tg.expand();

const API_BASE = '/api';

const app = {
    user: {
        id: 123456789,
        first_name: 'Test',
        username: 'testuser'
    },
    currentQuiz: null,
    currentQuestionIndex: 0,
    correctCount: 0,
    incorrectCount: 0,
    timerInterval: null,
    timeLeft: 0,
    currentChunkRange: "Barchasi",
    currentQuestions: [],

    init() {
        if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
            this.user = tg.initDataUnsafe.user;
        }
        
        document.getElementById('userName').textContent = this.user.first_name || 'Foydalanuvchi';
        const initial = (this.user.first_name || 'F').charAt(0).toUpperCase();
        document.getElementById('userAvatar').textContent = initial;

        tg.ready();
        this.checkAdminStatus();
    },

    async checkAdminStatus() {
        try {
            const res = await fetch(`${API_BASE}/admin/check/${this.user.id}`);
            const data = await res.json();
            if (data.is_admin) {
                document.getElementById('adminBtn').style.display = 'flex';
            }
        } catch (e) {
            console.error("Admin check failed", e);
        }
    },

    showView(viewId) {
        document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');
        
        if (viewId === 'mainMenu') {
            tg.BackButton.hide();
        } else {
            tg.BackButton.show();
            tg.BackButton.onClick(() => this.showView('mainMenu'));
        }
    },

    async copyPrompt() {
        const text = document.getElementById('promptText').innerText;
        try {
            await navigator.clipboard.writeText(text);
            tg.showAlert("Prompt nusxalandi! ChatGPT ga yuboring.");
        } catch (err) {
            tg.showAlert("Nusxa olishda xatolik yuz berdi.");
        }
    },

    async createQuiz() {
        const timer = parseInt(document.getElementById('timerInput').value) || 30;
        const jsonStr = document.getElementById('jsonInput').value;

        if (!jsonStr) {
            return tg.showAlert("Iltimos, JSON matnini kiriting!");
        }

        let questions;
        try {
            questions = JSON.parse(jsonStr);
            if (!Array.isArray(questions)) throw new Error("Not an array");
        } catch (e) {
            return tg.showAlert("JSON formati xato! Iltimos, tekshiring.");
        }

        tg.MainButton.showProgress();
        
        try {
            const res = await fetch(`${API_BASE}/quiz`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    timer_per_question: timer,
                    questions: questions,
                    telegram_id: this.user.id
                })
            });

            const data = await res.json();
            if (res.ok) {
                document.getElementById('generatedCode').textContent = data.code;
                this.showView('quizCreatedView');
                document.getElementById('jsonInput').value = '';
            } else {
                tg.showAlert("Xatolik: " + (data.detail || 'Noma\'lum xato'));
            }
        } catch (err) {
            tg.showAlert("Tarmoq xatosi yuz berdi.");
        } finally {
            tg.MainButton.hideProgress();
        }
    },

    async joinQuiz() {
        const code = document.getElementById('joinCodeInput').value.trim();
        if (code.length !== 6) {
            return tg.showAlert("Kodni to'g'ri kiriting (6 xonali)!");
        }

        try {
            const res = await fetch(`${API_BASE}/quiz/${code}`);
            if (!res.ok) {
                return tg.showAlert("Bunday kodli quiz topilmadi!");
            }
            
            this.currentQuiz = await res.json();
            
            if (this.currentQuiz.questions.length > 25) {
                this.renderChunkSelection();
            } else {
                this.currentChunkRange = "1-" + this.currentQuiz.questions.length;
                this.currentQuestions = this.currentQuiz.questions;
                this.startQuiz();
            }
        } catch (err) {
            tg.showAlert("Tarmoq xatosi yuz berdi.");
        }
    },

    renderChunkSelection() {
        const container = document.getElementById('chunkButtonsContainer');
        container.innerHTML = '';
        
        const total = this.currentQuiz.questions.length;
        const chunkSize = 25;
        let html = '';
        
        for (let i = 0; i < total; i += chunkSize) {
            const end = Math.min(i + chunkSize, total);
            const rangeStr = `${i + 1}-${end}`;
            html += `<button class="btn outline-btn" onclick="app.selectChunk(${i}, ${end}, '${rangeStr}')">${rangeStr} - savollar</button>`;
        }
        
        container.innerHTML = html;
        this.showView('chunkSelectionView');
    },

    selectChunk(startIndex, endIndex, rangeStr) {
        this.currentChunkRange = rangeStr;
        this.currentQuestions = this.currentQuiz.questions.slice(startIndex, endIndex);
        this.startQuiz();
    },

    startQuiz() {
        this.currentQuestionIndex = 0;
        this.correctCount = 0;
        this.incorrectCount = 0;
        document.getElementById('questionsContainer').innerHTML = '';
        this.showView('takingQuizView');
        this.renderNextQuestion();
    },

    renderNextQuestion() {
        if (this.currentQuestionIndex >= this.currentQuestions.length) {
            this.finishQuiz();
            return;
        }

        const q = this.currentQuestions[this.currentQuestionIndex];
        const container = document.getElementById('questionsContainer');
        
        document.getElementById('questionCounter').textContent = `Savol: ${this.currentQuestionIndex + 1}/${this.currentQuestions.length}`;
        
        const qCard = document.createElement('div');
        qCard.className = 'question-card';
        qCard.id = `qCard_${this.currentQuestionIndex}`;
        
        const optionsHtml = ['A', 'B', 'C', 'D'].map(opt => `
            <div class="option" id="opt_${this.currentQuestionIndex}_${opt}" onclick="app.selectOption('${opt}')">
                <span>${opt}) ${q[`option_${opt.toLowerCase()}`]}</span>
                <span class="icon-status" id="icon_${this.currentQuestionIndex}_${opt}"></span>
            </div>
        `).join('');

        qCard.innerHTML = `
            <div class="question-text">${this.currentQuestionIndex + 1}. ${q.text}</div>
            <div class="options">
                ${optionsHtml}
            </div>
        `;
        
        container.appendChild(qCard);
        
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });

        this.startTimer();
    },

    startTimer() {
        clearInterval(this.timerInterval);
        this.timeLeft = this.currentQuiz.timer_per_question;
        this.updateTimerDisplay();

        this.timerInterval = setInterval(() => {
            this.timeLeft--;
            this.updateTimerDisplay();
            
            if (this.timeLeft <= 0) {
                clearInterval(this.timerInterval);
                this.handleTimeout();
            }
        }, 1000);
    },

    updateTimerDisplay() {
        const mins = Math.floor(this.timeLeft / 60).toString().padStart(2, '0');
        const secs = (this.timeLeft % 60).toString().padStart(2, '0');
        document.getElementById('questionTimer').textContent = `${mins}:${secs}`;
    },

    handleTimeout() {
        this.selectOption(null);
    },

    selectOption(selectedOpt) {
        clearInterval(this.timerInterval);
        
        const q = this.currentQuestions[this.currentQuestionIndex];
        const correctOpt = q.correct_option.toUpperCase();
        
        ['A', 'B', 'C', 'D'].forEach(opt => {
            const el = document.getElementById(`opt_${this.currentQuestionIndex}_${opt}`);
            el.classList.add('disabled');
            
            if (opt === correctOpt) {
                el.classList.add('correct');
                document.getElementById(`icon_${this.currentQuestionIndex}_${opt}`).textContent = '✅';
            } else if (opt === selectedOpt && selectedOpt !== correctOpt) {
                el.classList.add('incorrect-selected');
                document.getElementById(`icon_${this.currentQuestionIndex}_${opt}`).textContent = '❌';
            } else {
                el.classList.add('incorrect');
                document.getElementById(`icon_${this.currentQuestionIndex}_${opt}`).textContent = '❌';
            }
        });

        if (selectedOpt === correctOpt) {
            this.correctCount++;
        } else {
            this.incorrectCount++;
        }

        this.currentQuestionIndex++;
        
        setTimeout(() => {
            this.renderNextQuestion();
        }, 1500);
    },

    async finishQuiz() {
        clearInterval(this.timerInterval);
        
        try {
            await fetch(`${API_BASE}/result`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegram_id: this.user.id,
                    quiz_code: this.currentQuiz.code,
                    chunk_range: this.currentChunkRange,
                    correct_count: this.correctCount,
                    incorrect_count: this.incorrectCount
                })
            });
        } catch (e) {
            console.error("Result save failed", e);
        }

        document.getElementById('resCorrect').textContent = this.correctCount;
        document.getElementById('resIncorrect').textContent = this.incorrectCount;
        
        this.showView('quizResultView');
    },

    async loadResults() {
        const container = document.getElementById('resultsContainer');
        container.innerHTML = '<p style="text-align:center;">Yuklanmoqda...</p>';
        
        try {
            const res = await fetch(`${API_BASE}/results/${this.user.id}`);
            const data = await res.json();
            
            if (data.length === 0) {
                container.innerHTML = '<p style="text-align:center; color:#94a3b8;">Hali natijalar yo\'q.</p>';
                return;
            }
            
            container.innerHTML = data.map(r => `
                <div class="result-item">
                    <div class="result-item-info">
                        <span class="result-code">Quiz: #${r.quiz_code} (${r.chunk_range})</span>
                        <span class="result-date">${r.date}</span>
                    </div>
                    <div class="result-score">
                        <span style="color:var(--success)">${r.correct_count}✅</span>
                        <span style="color:var(--danger)">${r.incorrect_count}❌</span>
                    </div>
                </div>
            `).join('');
            
        } catch (err) {
            container.innerHTML = '<p style="text-align:center; color:var(--danger);">Xatolik yuz berdi.</p>';
        }
    },

    async loadAdminPanel() {
        const container = document.getElementById('adminContainer');
        container.innerHTML = '<p style="text-align:center;">Ma\'lumotlar yuklanmoqda...</p>';
        
        try {
            const res = await fetch(`${API_BASE}/admin/quizzes?telegram_id=${this.user.id}`);
            if (!res.ok) {
                container.innerHTML = '<p style="text-align:center; color:var(--danger);">Sizda huquq yo\'q yoki xato.</p>';
                return;
            }
            const data = await res.json();
            
            if (data.length === 0) {
                container.innerHTML = '<p style="text-align:center; color:#94a3b8;">Hali testlar yo\'q.</p>';
                return;
            }
            
            container.innerHTML = data.map(q => `
                <div class="admin-card">
                    <div class="admin-quiz-header">
                        <span class="result-code">Quiz #${q.code}</span>
                        <span class="result-date">${q.created_at}</span>
                    </div>
                    <div class="participants">
                        ${q.participants.length === 0 ? '<p style="font-size:0.8rem; color:#94a3b8;">Hali hech kim ishlamagan</p>' : ''}
                        ${q.participants.map(p => `
                            <div class="participant-item">
                                <span class="p-name">${p.first_name} ${p.username ? '(@' + p.username + ')' : ''} <span style="font-size:0.8rem; color:#cbd5e1;">[${p.chunk_range}]</span></span>
                                <span class="p-score">
                                    <span style="color:var(--success)">${p.correct}✅</span>
                                    <span style="color:var(--danger)">${p.incorrect}❌</span>
                                </span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('');
            
        } catch (err) {
            container.innerHTML = '<p style="text-align:center; color:var(--danger);">Xatolik yuz berdi.</p>';
        }
    }
};

window.onload = () => {
    app.init();
};
