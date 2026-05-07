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
    adminData: [], // Store admin data for easy rendering

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

    async copyCode(code) {
        try {
            await navigator.clipboard.writeText(code);
            tg.showAlert(`Kod nusxalandi: ${code}`);
        } catch (err) {
            tg.showAlert("Nusxa olishda xatolik.");
        }
    },

    async copyPrompt() {
        const text = document.getElementById('promptText').innerText;
        try {
            await navigator.clipboard.writeText(text);
            tg.showAlert("Prompt nusxalandi! ChatGPT ga yuboring.");
        } catch (err) {
            tg.showAlert("Nusxa olishda xatolik.");
        }
    },

    async createQuiz() {
        const timer = document.getElementById('timerInput').value;
        const fileInput = document.getElementById('quizJsonFile');
        
        if (!fileInput.files || fileInput.files.length === 0) {
            tg.showAlert("Iltimos, ChatGPT bergan .json faylni tanlang!");
            return;
        }

        const file = fileInput.files[0];
        const reader = new FileReader();

        reader.onload = async (e) => {
            const jsonText = e.target.result;
            let questions = [];
            
            try {
                questions = JSON.parse(jsonText);
                if (!Array.isArray(questions) || questions.length === 0) {
                    throw new Error("Fayl ichida savollar ro'yxati yo'q");
                }
            } catch (err) {
                tg.showAlert("Xatolik: Fayl formati noto'g'ri yoki buzilgan JSON!");
                return;
            }

            try {
                const res = await fetch(`${API_BASE}/quiz`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        telegram_id: this.user.id,
                        timer_per_question: parseInt(timer),
                        questions: questions
                    })
                });

                if (res.ok) {
                    const data = await res.json();
                    document.getElementById('generatedCode').textContent = data.code;
                    this.showView('quizCreatedView');
                } else {
                    tg.showAlert("Server xatosi yuz berdi.");
                }
            } catch (err) {
                tg.showAlert("Tarmoq xatosi yuz berdi.");
            }
        };

        reader.readAsText(file);
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
        
        const keys = ['A', 'B', 'C', 'D'].sort(() => Math.random() - 0.5);
        const visualLabels = ['A', 'B', 'C', 'D'];

        const optionsHtml = keys.map((opt, idx) => `
            <div class="option" id="opt_${this.currentQuestionIndex}_${opt}" onclick="app.selectOption('${opt}')">
                <span>${visualLabels[idx]}) ${q[`option_${opt.toLowerCase()}`]}</span>
                <div class="status-indicator" id="icon_${this.currentQuestionIndex}_${opt}"></div>
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
            const icon = document.getElementById(`icon_${this.currentQuestionIndex}_${opt}`);
            el.classList.add('disabled');
            
            if (opt === correctOpt) {
                el.classList.add('correct');
                icon.classList.add('status-success');
                icon.innerHTML = '✓';
            } else if (opt === selectedOpt && selectedOpt !== correctOpt) {
                el.classList.add('incorrect-selected');
                icon.classList.add('status-error');
                icon.innerHTML = '✕';
            } else {
                el.classList.add('incorrect');
            }
        });

        if (selectedOpt === correctOpt) {
            this.correctCount++;
        } else {
            this.incorrectCount++;
        }

        this.currentQuestionIndex++;
        
        // Speed increased: 400ms instead of 1500ms
        setTimeout(() => {
            this.renderNextQuestion();
        }, 400);
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
        container.innerHTML = '<p style="text-align:center;">Yuklanmoqda...</p>';
        
        try {
            const res = await fetch(`${API_BASE}/admin/quizzes?telegram_id=${this.user.id}`);
            if (!res.ok) {
                container.innerHTML = '<p style="text-align:center; color:var(--danger);">Sizda huquq yo\'q.</p>';
                return;
            }
            this.adminData = await res.json();
            this.renderAdminQuizzes();
        } catch (err) {
            container.innerHTML = '<p style="text-align:center; color:var(--danger);">Xatolik.</p>';
        }
    },

    renderAdminQuizzes() {
        const container = document.getElementById('adminContainer');
        if (this.adminData.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#94a3b8;">Testlar yo\'q.</p>';
            return;
        }

        container.innerHTML = this.adminData.map(q => `
            <div class="admin-quiz-card" id="quiz_card_${q.code}">
                <div class="admin-quiz-info" onclick="app.toggleAdminParticipants('${q.code}')">
                    <div class="admin-code-wrapper">
                        <span class="admin-code">#${q.code}</span>
                        <span class="copy-badge" onclick="event.stopPropagation(); app.copyCode('${q.code}')">NUSXA</span>
                    </div>
                    <div class="admin-creator">
                        <span>Yaratuvchi: ${q.creator_name}</span>
                        <span style="font-size:0.75rem; opacity:0.7;">@${q.creator_username || 'noma\'lum'} • ${q.created_at}</span>
                    </div>
                </div>
                <button class="delete-btn" onclick="app.deleteQuiz('${q.code}')">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
                <div id="participants_${q.code}" class="participants-list" style="display:none;"></div>
            </div>
        `).join('');
    },

    toggleAdminParticipants(code) {
        const listDiv = document.getElementById(`participants_${code}`);
        if (listDiv.style.display === 'block') {
            listDiv.style.display = 'none';
            return;
        }

        // Security code check
        const pass = prompt("Xonaga kirish uchun kodni kiriting (key: 1213):");
        if (pass !== "1213") {
            return tg.showAlert("Noto'g'ri kod!");
        }

        const quiz = this.adminData.find(q => q.code === code);
        if (!quiz || quiz.participants.length === 0) {
            listDiv.innerHTML = '<p style="font-size:0.8rem; color:#94a3b8; text-align:center;">Hali hech kim ishlamagan</p>';
        } else {
            listDiv.innerHTML = quiz.participants.map(p => `
                <div class="participant-row">
                    <div class="p-details">
                        <span class="p-name">${p.first_name}</span>
                        <span class="p-meta">@${p.username || 'n/a'} • ${p.chunk_range}</span>
                    </div>
                    <div class="p-score-box">
                        ${p.correct} / ${p.incorrect} / ${quiz.total_questions}
                    </div>
                </div>
            `).join('');
        }
        listDiv.style.display = 'block';
    },

    async deleteQuiz(code) {
        if (!confirm(`Haqiqatdan ham #${code} quizni o'chirmoqchimisiz?`)) return;

        try {
            const res = await fetch(`${API_BASE}/admin/quiz/${code}?telegram_id=${this.user.id}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                this.adminData = this.adminData.filter(q => q.code !== code);
                this.renderAdminQuizzes();
            } else {
                tg.showAlert("O'chirishda xatolik.");
            }
        } catch (err) {
            tg.showAlert("Tarmoq xatosi.");
        }
    }
};

window.onload = () => {
    app.init();
};
