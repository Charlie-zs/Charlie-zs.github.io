let questions = [
    { question: "题库是空的哦，请在“个人界面”导入你的题库！", options: {}, answer: "", analysis: "" }
];
let state = {};
let settings = {};

const quizView = document.getElementById('quiz-view');
const settingsView = document.getElementById('settings-view');
const fileImporter = document.getElementById('file-importer');
const customCSSTextarea = document.getElementById('custom-css-textarea');
const customStyleEl = document.createElement('style');
document.head.appendChild(customStyleEl);

// AI Settings Elements
const apiPlatformSelect = document.getElementById('api-platform');
const apiUrlInput = document.getElementById('api-url');
const apiKeyInput = document.getElementById('api-key');
const apiModelInput = document.getElementById('api-model');
const apiSystemPromptTextarea = document.getElementById('api-system-prompt');
const apiTestFeedback = document.getElementById('api-test-feedback');

function showQuizView() { quizView.style.display = 'flex'; settingsView.style.display = 'none'; render(); }
function showSettingsView() { quizView.style.display = 'none'; settingsView.style.display = 'flex'; }

function importQuestions() { fileImporter.click(); }

fileImporter.addEventListener('change', (event) => {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedData = JSON.parse(e.target.result);
            if (Array.isArray(importedData) && importedData.length > 0) {
                questions = importedData;
                initializeApp();
                alert(`✅ 成功导入 ${questions.length} 道题！`);
            } else { throw new Error('JSON数据不是数组或为空。'); }
        } catch (err) { alert('❌ 导入失败！请确保文件是UTF-8编码的、格式正确的题库文件。'); }
    };
    reader.readAsText(file, 'UTF-8');
});

function exportQuestions() {
    questions.forEach(q => { delete q.isGraduating; });
    const dataStr = JSON.stringify(questions, null, 2);
    const dataBlob = new Blob([dataStr], {type: "text/plain"});
    const url = window.URL.createObjectURL(dataBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `我的题库备份_${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    window.URL.revokeObjectURL(url);
}

function applyCustomCSS() {
    customStyleEl.innerHTML = customCSSTextarea.value;
    alert('新的美化样式已应用！');
}

function initializeApp() {
    state = {
        currentView: 'main', 
        main: { currentIndex: 0, userAnswers: {} },
        wrongBook: { currentIndex: 0, userAnswers: {}, wrongQuestionIndexes: [] }
    };
    questions.forEach(q => {
        q.wrongCount = q.wrongCount || 0;
        q.correctStreak = q.correctStreak || 0;
    });
    render();
}

function render() {
    const isMainView = state.currentView === 'main';
    const viewState = isMainView ? state.main : state.wrongBook;
    const questionPoolIndexes = isMainView ? [...Array(questions.length).keys()] : state.wrongBook.wrongQuestionIndexes;

    if (!isMainView && questionPoolIndexes.length === 0) {
        renderEmptyWrongBook();
        return;
    }
    viewState.currentIndex = Math.min(viewState.currentIndex, questionPoolIndexes.length - 1);
    if(viewState.currentIndex < 0) viewState.currentIndex = 0;
    
    const currentIndex = viewState.currentIndex;
    const originalIndex = questionPoolIndexes[currentIndex];

    if(originalIndex === undefined) { 
        renderEmptyWrongBook(); 
        return; 
    }
    
    const questionData = questions[originalIndex];

    renderHeader(isMainView);
    renderStatusBar(isMainView);
    renderFooter(isMainView, currentIndex, questionPoolIndexes.length);
    
    const statusEl = document.getElementById('quiz-status');
    statusEl.style.display = isMainView ? 'none' : 'block';
    if (!isMainView) updateStatusDisplay();

    document.getElementById('no-wrong-questions').style.display = 'none';
    const questionTextEl = document.getElementById('question-text');
    questionTextEl.textContent = questionData.question;
    questionTextEl.classList.remove('question-graduated');
    
    document.getElementById('analysis-text').textContent = questionData.analysis;
    document.getElementById('analysis-container').style.display = 'none';

    const optionsList = document.getElementById('options-list');
    optionsList.innerHTML = '';
    for (const key in questionData.options) {
        const li = document.createElement('li');
        li.dataset.option = key;
        li.innerHTML = `<input type="radio" name="q${originalIndex}"> <span class="option-text">${key}. ${questionData.options[key]}</span> <span class="feedback-icon"></span>`;
        optionsList.appendChild(li);
        li.addEventListener('click', () => handleOptionClick(li));
    }

    if (viewState.userAnswers[originalIndex] !== undefined) {
        handleOptionClick(document.querySelector(`li[data-option="${viewState.userAnswers[originalIndex]}"]`), true);
    }
}

function handleOptionClick(selectedLi, isRestoring = false) {
    const isMainView = state.currentView === 'main';
    const viewState = isMainView ? state.main : state.wrongBook;
    const originalIndex = isMainView ? viewState.currentIndex : state.wrongBook.wrongQuestionIndexes[viewState.currentIndex];

    if ((viewState.userAnswers[originalIndex] !== undefined || (questions[originalIndex] && questions[originalIndex].isGraduating)) && !isRestoring) return;
    if (!isRestoring) { viewState.userAnswers[originalIndex] = selectedLi.dataset.option; }
    
    const q = questions[originalIndex];
    const selectedOption = selectedLi.dataset.option;
    
    if (selectedOption === q.answer) {
        if (!isRestoring && !isMainView) {
            q.correctStreak++;
            if (q.correctStreak >= 3) {
                q.isGraduating = true;
                const questionTextEl = document.getElementById('question-text');
                questionTextEl.classList.add('question-graduated');
                const statusEl = document.getElementById('quiz-status');
                statusEl.className = 'quiz-status status-correct';
                statusEl.textContent = '🎉 恭喜！本题已掌握！';
                
                setTimeout(() => {
                    state.wrongBook.wrongQuestionIndexes = state.wrongBook.wrongQuestionIndexes.filter(i => i !== originalIndex);
                    delete q.isGraduating;
                    render();
                }, 1500);
                return;
            }
        }
    } else {
        if (!isRestoring) {
            q.wrongCount++;
            q.correctStreak = 0;
            if (isMainView && !state.wrongBook.wrongQuestionIndexes.includes(originalIndex)) {
                state.wrongBook.wrongQuestionIndexes.push(originalIndex);
            }
        }
    }

    document.querySelectorAll('#options-list li').forEach(li => {
        li.classList.add('disabled');
        const optValue = li.dataset.option;
        const icon = li.querySelector('.feedback-icon');
        if (optValue === q.answer) {
            li.classList.add('correct'); icon.classList.add('correct'); icon.textContent = '✓';
        } else if (optValue === selectedOption) {
            li.classList.add('incorrect'); icon.classList.add('incorrect'); icon.textContent = '✗';
        }
    });

    document.getElementById('analysis-container').style.display = 'block';
    if (isMainView) { renderStatusBar(true); } 
    else { updateStatusDisplay(); }
}

function updateStatusDisplay() {
    if (state.currentView !== 'wrongBook' || state.wrongBook.wrongQuestionIndexes.length === 0) return;
    const originalIndex = state.wrongBook.wrongQuestionIndexes[state.wrongBook.currentIndex];
    const q = questions[originalIndex];
    const statusEl = document.getElementById('quiz-status');
    statusEl.className = 'quiz-status status-wrong';
    statusEl.textContent = `✅ ${q.correctStreak} / 3`;
}

function renderHeader(isMainView) {
    const header = document.getElementById('app-header');
    if (isMainView) { 
        header.innerHTML = `<span id="settings-icon" class="clickable">⚙️</span><span>做题</span><span></span>`;
        document.getElementById('settings-icon').addEventListener('click', showSettingsView);
    } else { 
        header.innerHTML = `<span id="back-from-wrongbook-btn" class="clickable">← 返回</span><span>错题本</span><span></span>`;
        document.getElementById('back-from-wrongbook-btn').addEventListener('click', switchToMainView);
    }
}

function renderStatusBar(isMainView) {
    const statusBar = document.getElementById('status-bar');
    if (isMainView) {
        const index = state.main.currentIndex;
        const total = questions.length;
        const jumpOptions = questions.map((_, i) => `<option value="${i}">${i + 1}</option>`).join('');
        statusBar.innerHTML = `
            <span>题目: ${index + 1} / ${total}</span>
            <div class="quiz-jump-menu">
                <select id="jump-to-question" onchange="jumpToQuestion()">${jumpOptions}</select>
            </div>
            <button class="wrong-book-btn" onclick="switchToWrongBook()">错题本 (${state.wrongBook.wrongQuestionIndexes.length})</button>
        `;
        document.getElementById('jump-to-question').value = index;
    } else {
        const index = state.wrongBook.currentIndex;
        const total = state.wrongBook.wrongQuestionIndexes.length;
        statusBar.innerHTML = `<span>进度: ${index + 1} / ${total}</span>`;
    }
}

function renderFooter(isMainView, index, total) {
    const footer = document.getElementById('app-footer');
    const prevDisabled = index === 0 ? 'disabled' : '';
    const nextDisabled = index === total - 1 ? 'disabled' : '';
    const restartFn = isMainView ? 'restartQuiz()' : 'restartWrongBook()';
    const restartText = isMainView ? '重做' : '重做错题';
    const aiDisabled = !settings.apiKey ? 'disabled' : '';

    footer.innerHTML = `<button class="footer-btn" onclick="navigate(-1)" ${prevDisabled}>⬅️ 上一题</button>
                      <button class="footer-btn" onclick="${restartFn}">🔁 ${restartText}</button>
                      <button class="footer-btn ai-tutor-btn" onclick="openAITutorModal()" ${aiDisabled}>🤖 AI 答疑</button>
                      <button class="footer-btn" onclick="navigate(1)" ${nextDisabled}>下一题 ➡️</button>`;
}

function renderEmptyWrongBook() {
    renderHeader(false);
    document.getElementById('status-bar').innerHTML = '';
    document.getElementById('quiz-status').style.display = 'none';
    document.getElementById('question-text').textContent = '';
    document.getElementById('options-list').innerHTML = '';
    document.getElementById('analysis-container').style.display = 'none';
    document.getElementById('no-wrong-questions').style.display = 'block';
    document.getElementById('app-footer').innerHTML = '';
}

function navigate(direction) {
    const viewState = state.currentView === 'main' ? state.main : state.wrongBook;
    const poolSize = state.currentView === 'main' ? questions.length : state.wrongBook.wrongQuestionIndexes.length;
    const newIndex = viewState.currentIndex + direction;
    if (newIndex >= 0 && newIndex < poolSize) { viewState.currentIndex = newIndex; render(); }
}

function jumpToQuestion() {
    const selectedIndex = document.getElementById('jump-to-question').value;
    state.main.currentIndex = parseInt(selectedIndex);
    render();
}

function switchToWrongBook() { state.currentView = 'wrongBook'; state.wrongBook.currentIndex = 0; render(); }
function switchToMainView() { state.currentView = 'main'; render(); }

function restartQuiz(confirmFirst = true) {
    if (confirmFirst && !confirm("确定要重新开始本轮练习吗？（错题记录会保留）")) return;
    state.main.userAnswers = {};
    state.main.currentIndex = 0;
    render();
}

function restartWrongBook() {
    if (confirm("确定要重做错题本中的题目吗？")) {
        state.wrongBook.userAnswers = {};
        state.wrongBook.currentIndex = 0;
        render();
    }
}

// --- AI and Settings Logic ---

function loadSettings() {
    const savedSettings = localStorage.getItem('quizAppSettings');
    if (savedSettings) {
        settings = JSON.parse(savedSettings);
        apiPlatformSelect.value = settings.platform || 'google-gemini';
        apiUrlInput.value = settings.url || '';
        apiKeyInput.value = settings.apiKey || '';
        apiModelInput.value = settings.model || '';
        apiSystemPromptTextarea.value = settings.systemPrompt || '';
    }
    updateAPIPlaceholders();
}

function saveSettings() {
    settings = {
        platform: apiPlatformSelect.value,
        url: apiUrlInput.value.trim(),
        apiKey: apiKeyInput.value.trim(),
        model: apiModelInput.value.trim(),
        systemPrompt: apiSystemPromptTextarea.value.trim(),
    };
    if (!settings.apiKey || !settings.url || !settings.model) {
        alert('❌ 请填写 API URL, API Key, 和模型名称！');
        return;
    }
    localStorage.setItem('quizAppSettings', JSON.stringify(settings));
    alert('✅ 设置已保存！');
    render(); // Re-render to enable/disable AI button
}

function updateAPIPlaceholders() {
    const platform = apiPlatformSelect.value;
    if (platform === 'google-gemini') {
        apiUrlInput.placeholder = 'https://generativelanguage.googleapis.com/...';
        apiModelInput.placeholder = 'gemini-1.5-flash';
    } else if (platform === 'openai') {
        apiUrlInput.placeholder = 'https://api.openai.com/v1/chat/completions';
        apiModelInput.placeholder = 'gpt-4o';
    } else {
        apiUrlInput.placeholder = '输入你的兼容OpenAI格式的API URL';
        apiModelInput.placeholder = '输入模型名称';
    }
}

async function testAPIConnection() {
    const platform = apiPlatformSelect.value;
    const url = apiUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const model = apiModelInput.value.trim();

    if (!apiKey || !url || !model) {
        apiTestFeedback.textContent = '❌ 请填写 API URL, API Key, 和模型名称！';
        apiTestFeedback.className = 'status-wrong';
        return;
    }
    
    apiTestFeedback.textContent = '正在测试连接...';
    apiTestFeedback.className = '';

    try {
        await callAI('hi', { platform, url, apiKey, model, systemPrompt: 'test' });
        apiTestFeedback.textContent = '✅ 连接成功！';
        apiTestFeedback.className = 'status-correct';
    } catch (error) {
        apiTestFeedback.textContent = `❌ 连接失败: ${error.message}`;
        apiTestFeedback.className = 'status-wrong';
    }
}

async function callAI(userPrompt, apiConfig) {
    const { platform, url, apiKey, model, systemPrompt } = apiConfig;
    let finalUrl = url;
    let headers = { 'Content-Type': 'application/json' };
    let body;

    if (platform === 'google-gemini') {
        finalUrl = `${url.replace(/\/$/, '')}/${model}:generateContent?key=${apiKey}`;
        body = JSON.stringify({
            contents: [{ parts: [{ text: userPrompt }] }],
            systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
        });
    } else { // OpenAI or Custom
        headers['Authorization'] = `Bearer ${apiKey}`;
        body = JSON.stringify({
            model: model,
            messages: [
                { role: 'system', content: systemPrompt || 'You are a helpful assistant.' },
                { role: 'user', content: userPrompt }
            ]
        });
    }

    const response = await fetch(finalUrl, {
        method: 'POST',
        headers: headers,
        body: body,
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`API请求失败 (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    if (platform === 'google-gemini') {
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '未能获取回复。';
    } else {
        return data.choices?.[0]?.message?.content || '未能获取回复。';
    }
}

function openAITutorModal() {
    const isMainView = state.currentView === 'main';
    const viewState = isMainView ? state.main : state.wrongBook;
    const questionPoolIndexes = isMainView ? [...Array(questions.length).keys()] : state.wrongBook.wrongQuestionIndexes;
    const originalIndex = questionPoolIndexes[viewState.currentIndex];
    
    if (originalIndex === undefined) return;
    const questionData = questions[originalIndex];

    document.getElementById('modal-question-text').textContent = questionData.question;
    document.getElementById('ai-user-query').value = '';
    document.getElementById('ai-response-text').textContent = '';
    document.getElementById('ai-tutor-modal').style.display = 'flex';
}

function closeAITutorModal() {
    document.getElementById('ai-tutor-modal').style.display = 'none';
}

async function askAI() {
    const userQuery = document.getElementById('ai-user-query').value.trim();
    if (!userQuery) {
        alert('请输入你的问题！');
        return;
    }

    const sendBtn = document.getElementById('ai-send-btn');
    const loader = document.getElementById('ai-response-loader');
    const responseText = document.getElementById('ai-response-text');

    sendBtn.disabled = true;
    loader.style.display = 'block';
    responseText.textContent = '';

    const isMainView = state.currentView === 'main';
    const viewState = isMainView ? state.main : state.wrongBook;
    const questionPoolIndexes = isMainView ? [...Array(questions.length).keys()] : state.wrongBook.wrongQuestionIndexes;
    const originalIndex = questionPoolIndexes[viewState.currentIndex];
    const q = questions[originalIndex];

    const optionsString = Object.entries(q.options).map(([key, value]) => `${key}. ${value}`).join('\n');
    const fullPrompt = `
        我正在做一道选择题，需要你的帮助。
        
        【题目】: ${q.question}
        【选项】:
        ${optionsString}
        【正确答案】: ${q.answer}
        【答案解析】: ${q.analysis}

        我的问题是：${userQuery}
    `;

    try {
        const aiResponse = await callAI(fullPrompt, settings);
        responseText.textContent = aiResponse;
    } catch (error) {
        responseText.textContent = `出错了：${error.message}`;
    } finally {
        sendBtn.disabled = false;
        loader.style.display = 'none';
    }
}
        
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    loadSettings();
    document.getElementById('back-to-quiz-btn').addEventListener('click', showQuizView);
    apiPlatformSelect.addEventListener('change', updateAPIPlaceholders);

});
