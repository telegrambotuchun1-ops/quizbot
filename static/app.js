const tg = window.Telegram.WebApp;
tg.expand();

const app = {
    user: {
        id: tg.initDataUnsafe?.user?.id || 123456789,
        first_name: tg.initDataUnsafe?.user?.first_name || 'Mehmon',
        username: tg.initDataUnsafe?.user?.username || ''
    },
    currentQuiz: null,
    currentQuestions: [],
    currentQuestionIndex: 0,
    results: { correct: 0, incorrect: 0 },
    timerInterval: null,
    isAdmin: false,

    init() {
        document.getElementById('userName').textContent = this.user.first_name;
        document.getElementById('userAvatar').textContent = this.user.first_name[0];
        this.checkAdminStatus();
        this.showView('mainMenu');
    },

    async checkAdminStatus() {
        try {
            const res = await fetch(`/api/admin/check/${this.user.id}`);
            const data = await res.json();
            if (data.is_admin) {
                this.isAdmin = true;
                document.getElementById('adminBtn').style.display = 'flex';
            }
        } catch (e) { console.error("Admin status error:", e); }
    },

    showView(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');
        window.scrollTo(0, 0);
    },

    copyPrompt() {
        const text = document.getElementById('promptText').innerText;
        navigator.clipboard.writeText(text).then(() => {
            tg.showAlert("Prompt nusxalandi! Endi uni ChatGPT ga yuboring.");
        });
    },

    async createQuiz() {
        const fileInput = document.getElementById('quizJsonFile');
        const timerInput = document.getElementById('timerInput');

        if (!fileInput.files[0]) return tg.showAlert("Iltimos, JSON faylni yuklang!");

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const questions = JSON.parse(e.target.result);
                const response = await fetch('/api/quiz', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        telegram_id: this.user.id,
                        timer_per_question: parseInt(timerInput.value),
                        questions: questions
                    })
                });
                const data = await response.json();
                document.getElementById('generatedCode').textContent = data.code;
                this.showView('quizCreatedView');
            } catch (err) {
                tg.showAlert("Xatolik: Fayl formati noto'g'ri!");
            }
        };
        reader.readAsText(fileInput.files[0]);
    },

    async joinQuiz() {
        const code = document.getElementById('joinCodeInput').value;
        if (code.length !== 6) return tg.showAlert("6 xonali kodni kiriting!");

        try {
            const res = await fetch(`/api/quiz/${code}`);
            if (!res.ok) throw new Error();
            const data = await res.json();
            this.currentQuiz = data;

            if (data.questions.length > 25) {
                this.renderChunks(data.questions);
            } else {
                this.startQuiz(data.questions, "Barchasi");
            }
        } catch (e) {
            tg.showAlert("Quiz topilmadi!");
        }
    },

    renderChunks(allQuestions) {
        const container = document.getElementById('chunkButtonsContainer');
        container.innerHTML = '';
        const chunkSize = 25;
        
        for (let i = 0; i < allQuestions.length; i += chunkSize) {
            const end = Math.min(i + chunkSize, allQuestions.length);
            const btn = document.createElement('div');
            btn.className = 'option';
            btn.innerHTML = `<span>${i + 1} - ${end} savollar</span> <span>➡️</span>`;
            btn.onclick = () => this.startQuiz(allQuestions.slice(i, end), `${i + 1}-${end}`);
            container.appendChild(btn);
        }
        this.showView('chunkSelectionView');
    },

    startQuiz(questions, rangeName) {
        this.currentQuestions = questions;
        this.currentRange = rangeName;
        this.currentQuestionIndex = 0;
        this.results = { correct: 0, incorrect: 0 };
        this.showView('takingQuizView');
        this.renderQuestion();
    },

    renderQuestion() {
        if (this.currentQuestionIndex >= this.currentQuestions.length) {
            this.finishQuiz();
            return;
        }

        const q = this.currentQuestions[this.currentQuestionIndex];
        document.getElementById('questionCounter').textContent = `Savol: ${this.currentQuestionIndex + 1}/${this.currentQuestions.length}`;
        
        const container = document.getElementById('questionsContainer');
        container.innerHTML = `
            <div class="question-card">
                <p class="question-text">${q.text}</p>
                <div class="options-list">
                    ${['a', 'b', 'c', 'd'].map(opt => `
                        <div class="option" onclick="app.checkAnswer('${opt}', this)">
                            <span>${q['option_' + opt]}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        this.startTimer();
    },

    startTimer() {
        clearInterval(this.timerInterval);
        let timeLeft = this.currentQuiz.timer_per_question;
        const timerEl = document.getElementById('questionTimer');
        
        const updateTimer = () => {
            timerEl.textContent = `00:${timeLeft < 10 ? '0' : ''}${timeLeft}`;
            if (timeLeft <= 0) {
                clearInterval(this.timerInterval);
                this.checkAnswer(null, null);
            }
            timeLeft--;
        };
        updateTimer();
        this.timerInterval = setInterval(updateTimer, 1000);
    },

    checkAnswer(selected, element) {
        clearInterval(this.timerInterval);
        const q = this.currentQuestions[this.currentQuestionIndex];
        const options = document.querySelectorAll('.option');
        options.forEach(opt => opt.classList.add('disabled'));

        let correctOpt = q.correct_option.toLowerCase();
        
        if (selected === correctOpt) {
            this.results.correct++;
            if (element) element.classList.add('correct');
        } else {
            this.results.incorrect++;
            if (element) element.classList.add('incorrect');
            options.forEach(opt => {
                if (opt.innerText.trim() === q['option_' + correctOpt].trim()) {
                    opt.classList.add('correct');
                }
            });
        }

        setTimeout(() => {
            this.currentQuestionIndex++;
            this.renderQuestion();
        }, 400);
    },

    async finishQuiz() {
        this.showView('quizResultView');
        document.getElementById('resCorrect').textContent = this.results.correct;
        document.getElementById('resIncorrect').textContent = this.results.incorrect;

        try {
            await fetch('/api/result', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegram_id: this.user.id,
                    quiz_code: this.currentQuiz.code,
                    chunk_range: this.currentRange,
                    correct_count: this.results.correct,
                    incorrect_count: this.results.incorrect
                })
            });
        } catch (e) { console.error("Result save error:", e); }
    },

    async loadResults() {
        const container = document.getElementById('resultsContainer');
        container.innerHTML = '<p style="text-align:center;">Yuklanmoqda...</p>';
        try {
            const res = await fetch(`/api/results/${this.user.id}`);
            const data = await res.json();
            if (data.length === 0) {
                container.innerHTML = '<p style="text-align:center; color:var(--text-dim);">Hali natijalar yo\'q.</p>';
                return;
            }
            container.innerHTML = data.map(r => `
                <div class="glass-card" style="padding:16px; margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div style="font-weight:700; font-size:1.1rem; color:var(--primary);">#${r.quiz_code}</div>
                            <div style="font-size:0.75rem; color:var(--text-dim);">${r.date} | ${r.chunk_range}</div>
                        </div>
                        <div class="p-score">${r.correct_count} ✅ / ${r.incorrect_count} ❌</div>
                    </div>
                </div>
            `).join('');
        } catch (e) { container.innerHTML = '<p>Xatolik yuz berdi.</p>'; }
    },

    async loadAdminPanel() {
        const code = prompt("Admin xavfsizlik kodini kiriting:");
        if (code !== '1213') {
            tg.showAlert("Kod noto'g'ri!");
            this.showView('mainMenu');
            return;
        }

        const container = document.getElementById('adminContainer');
        container.innerHTML = '<p style="text-align:center;">Yuklanmoqda...</p>';
        try {
            const res = await fetch(`/api/admin/quizzes?telegram_id=${this.user.id}`);
            const data = await res.json();
            if (data.length === 0) {
                container.innerHTML = '<p>Testlar mavjud emas.</p>';
                return;
            }
            container.innerHTML = data.map(q => `
                <div class="admin-card">
                    <div class="admin-header">
                        <div class="quiz-meta">
                            <span class="quiz-id">#${q.code}</span>
                            <span class="quiz-creator">👤 ${q.creator_name} (@${q.creator_username})</span>
                            <span class="quiz-creator">📅 ${q.created_at} | ❓ ${q.total_questions} ta</span>
                        </div>
                        <button class="delete-icon-btn" onclick="app.deleteQuiz('${q.code}')">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                    </div>
                    <div class="participants-area">
                        <div style="font-size:0.8rem; font-weight:700; margin-bottom:8px; color:var(--text-dim);">ISHTIROKCHILAR (${q.participants.length}):</div>
                        ${q.participants.map(p => `
                            <div class="participant-item">
                                <div class="p-info">
                                    <span class="p-name">${p.first_name}</span>
                                    <span class="p-sub">${p.date} | ${p.chunk_range}</span>
                                </div>
                                <span class="p-score">${p.correct}/${p.incorrect}</span>
                            </div>
                        `).join('') || '<p style="font-size:0.8rem; color:var(--text-dim);">Hali hech kim ishlamagan.</p>'}
                    </div>
                </div>
            `).join('');
        } catch (e) { container.innerHTML = '<p>Ma\'lumotlarni yuklashda xatolik.</p>'; }
    },

    async deleteQuiz(code) {
        if (!confirm(`${code} kodli testni o'chirib tashlamoqchimisiz?`)) return;
        try {
            const res = await fetch(`/api/admin/quiz/${code}?telegram_id=${this.user.id}`, { method: 'DELETE' });
            if (res.ok) {
                tg.showAlert("O'chirildi!");
                this.loadAdminPanel();
            }
        } catch (e) { tg.showAlert("O'chirishda xatolik!"); }
    }
};

window.onload = () => app.init();
