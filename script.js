


let questions = [];
let state = {};
let settings = {};

const STORAGE_KEYS = {
    QUESTIONS: 'quizAppQuestions',
    STATE: 'quizAppState',
    SETTINGS: 'quizAppSettings',
    CSS: 'quizAppCustomCSS'
};

// --- DOM Elements ---
const quizView = document.getElementById('quiz-view');
const settingsView = document.getElementById('settings-view');
const aiSettingsView = document.getElementById('ai-settings-view');
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

// AI Chat variables
let aiChatHistory = [];
let thinkingTimerInterval = null;
let thinkingStartTime = null;
let initialAIPrompt = '';


// --- View Management ---
function showQuizView() { quizView.style.display = 'flex'; settingsView.style.display = 'none'; aiSettingsView.style.display = 'none'; render(); }
function showSettingsView() { quizView.style.display = 'none'; settingsView.style.display = 'flex'; aiSettingsView.style.display = 'none'; }
function showAISettingsView() { settingsView.style.display = 'none'; aiSettingsView.style.display = 'flex'; }


// --- Data Persistence ---
function saveData() {
    try {
        localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(questions));
        localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(state));
    } catch (e) {
        console.error("Error saving data to localStorage", e);
    }
}

function loadDataAndInitialize() {
    const savedQuestions = localStorage.getItem(STORAGE_KEYS.QUESTIONS);
    const savedState = localStorage.getItem(STORAGE_KEYS.STATE);

    questions = savedQuestions ? JSON.parse(savedQuestions) : [{ type: 'single', question: "题库是空的哦，请在“个人界面”导入你的题库！", options: {}, answer: "", analysis: "" }];
    
    const defaultState = {
        currentView: 'main',
        main: { currentIndex: 0, userAnswers: {} },
        wrongBook: { currentIndex: 0, userAnswers: {}, wrongQuestionIndexes: [] }
    };
    state = savedState ? JSON.parse(savedState) : defaultState;

    // Ensure state compatibility
    if (!state.wrongBook) state.wrongBook = defaultState.wrongBook;
    if (!state.main) state.main = defaultState.main;
    state.currentView = 'main'; // always start at main view

    questions.forEach(q => {
        q.wrongCount = q.wrongCount || 0;
        q.correctStreak = q.correctStreak || 0;
    });

    render();
}

// --- Question I/O (TXT Parser) ---
function importQuestions() { fileImporter.click(); }

fileImporter.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const parsedQuestions = parseTxtContent(e.target.result);
            if (parsedQuestions.length > 0) {
                questions = parsedQuestions;
                resetProgressAndSave();
                alert(`✅ 成功导入 ${questions.length} 道题！`);
                showQuizView();
            } else {
                throw new Error('未解析到任何题目。');
            }
        } catch (err) {
            alert(`❌ 导入失败！请检查文件格式。\n错误: ${err.message}`);
        }
    };
    reader.readAsText(file, 'UTF-8');
});

function parseTxtContent(text) {
    const questionBlocks = text.split(/---|\n\n\n+/).filter(block => block.trim() !== '');

    return questionBlocks.map(block => {
        const lines = block.trim().split('\n');
        const questionObj = { options: {}, question: '', analysis: '' };
        let readingState = null; // null | 'question' | 'options' | 'analysis'

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;
            
            // If we are reading a multiline field, check if we should stop.
            if (readingState === 'question' || readingState === 'analysis') {
                // Stop reading if a new tag or an option list starts
                if (trimmedLine.match(/^(?:【(.+?)】|(.+?)[：:]\s?)/) || /^[A-Z]\s*[.、．]\s*/.test(trimmedLine)) {
                    readingState = null;
                }
            }

            // --- Unified Tag Matching ---
            // Matches: 【Tag】Content, Tag: Content, Tag：Content (full-width colon)
            const tagMatch = trimmedLine.match(/^(?:【(.+?)】|(.+?)[：:]\s?)(.*)/);

            if (tagMatch) {
                const tag = (tagMatch[1] || tagMatch[2] || '').trim();
                const content = (tagMatch[3] || '').trim();

                let isTagHandled = false;
                switch (tag) {
                    case '题型':
                        isTagHandled = true;
                        readingState = null;
                        if (content.includes('单选')) questionObj.type = 'single';
                        else if (content.includes('多选')) questionObj.type = 'multiple';
                        else if (content.includes('判断')) questionObj.type = 'truefalse';
                        else if (content.includes('填空')) questionObj.type = 'fill';
                        break;
                    case '问题':
                    case '题目':
                        isTagHandled = true;
                        readingState = 'question';
                        questionObj.question = content;
                        break;
                    case '答案':
                        isTagHandled = true;
                        readingState = null;
                        questionObj.answer = content;
                        break;
                    case '解析':
                        isTagHandled = true;
                        readingState = 'analysis';
                        questionObj.analysis = content;
                        break;
                    case '选项':
                        isTagHandled = true;
                        readingState = 'options';
                        break;
                }
                if (isTagHandled) continue;
            }

            // --- Content Matching ---
            // An option line
            if (/^[A-Z]\s*[.、．]\s*/.test(trimmedLine)) {
                const key = trimmedLine.charAt(0);
                const value = trimmedLine.substring(trimmedLine.search(/[.、．]/) + 1).trim();
                questionObj.options[key] = value;
                readingState = 'options';
            } 
            // A continuation line for question/analysis
            else if (readingState === 'question') {
                questionObj.question += (questionObj.question ? '\n' : '') + trimmedLine;
            } else if (readingState === 'analysis') {
                questionObj.analysis += (questionObj.analysis ? '\n' : '') + trimmedLine;
            }
        }
        
        questionObj.question = (questionObj.question || '').trim();
        questionObj.analysis = (questionObj.analysis || '').trim();

        if (questionObj.type === 'truefalse') {
            questionObj.options = {'A': '对', 'B': '错'};
            questionObj.answer = (questionObj.answer === '对' || questionObj.answer.toUpperCase() === 'A') ? 'A' : 'B';
        }
        
        if (!questionObj.type) {
            if (Object.keys(questionObj.options).length > 0) {
                 if (questionObj.answer && questionObj.answer.length > 1 && /^[A-Z]+$/.test(questionObj.answer)) {
                     questionObj.type = 'multiple';
                 } else {
                     questionObj.type = 'single';
                 }
            } else if (questionObj.question && questionObj.question.includes('[___]')) {
                questionObj.type = 'fill';
            } else {
                questionObj.type = 'single';
            }
        }
        
        if (!questionObj.question || !questionObj.answer) {
             throw new Error(`题目或答案缺失: ${block.substring(0, 30)}...`);
        }
        
        return questionObj;
    });
}

function exportQuestions() {
    const typeMap = {
        'single': '单选题', 'multiple': '多选题', 'truefalse': '判断题', 'fill': '填空题'
    };
    let textContent = questions.map(q => {
        let block = `【题型】${typeMap[q.type] || '单选题'}\n`;
        block += `【题目】\n${q.question}\n`;
        if (q.type !== 'fill' && q.type !== 'truefalse') {
            block += '【选项】\n';
            block += Object.entries(q.options).map(([key, value]) => `${key}. ${value}`).join('\n') + '\n';
        }
        let answer = q.answer;
        if (q.type === 'truefalse') {
             answer = q.answer === 'A' ? '对' : '错';
        }
        block += `【答案】${answer}\n`;
        if (q.analysis) block += `【解析】\n${q.analysis}\n`;
        return block;
    }).join('---\n\n');

    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `我的题库备份_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}


// --- App Core Logic ---
function resetProgressAndSave() {
    state = {
        currentView: 'main', 
        main: { currentIndex: 0, userAnswers: {} },
        wrongBook: { currentIndex: 0, userAnswers: {}, wrongQuestionIndexes: [] }
    };
    questions.forEach(q => {
        q.wrongCount = q.wrongCount || 0;
        q.correctStreak = q.correctStreak || 0;
    });
    saveData();
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
    
    viewState.currentIndex = Math.max(0, Math.min(viewState.currentIndex, questionPoolIndexes.length - 1));
    const originalIndex = questionPoolIndexes[viewState.currentIndex];

    if (originalIndex === undefined || questions.length === 0) {
        renderEmptyWrongBook(); return;
    }
    
    const questionData = questions[originalIndex];

    renderHeader(isMainView);
    renderStatusBar(isMainView);
    renderFooter(isMainView, viewState.currentIndex, questionPoolIndexes.length);
    
    document.getElementById('quiz-status').style.display = isMainView ? 'none' : 'block';
    if (!isMainView) updateStatusDisplay();

    document.getElementById('no-wrong-questions').style.display = 'none';
    const questionTextEl = document.getElementById('question-text');
    questionTextEl.innerHTML = questionData.question.replace(/\[___\]/g, '<input type="text" id="fill-in-blank-input" class="fill-in-blank-input">');
    questionTextEl.classList.remove('question-graduated');
    
    document.getElementById('analysis-text').textContent = questionData.analysis;
    document.getElementById('analysis-container').style.display = 'none';

    const optionsList = document.getElementById('options-list');
    optionsList.innerHTML = '';
    const inputType = questionData.type === 'multiple' ? 'checkbox' : 'radio';

    if (questionData.type !== 'fill') {
        for (const key in questionData.options) {
            const li = document.createElement('li');
            li.dataset.option = key;
            li.innerHTML = `<input type="${inputType}" name="q${originalIndex}"> <span class="option-text">${key}. ${questionData.options[key]}</span> <span class="feedback-icon"></span>`;
            optionsList.appendChild(li);
            if (questionData.type === 'single' || questionData.type === 'truefalse') {
                 li.addEventListener('click', () => handleOptionClick(li));
            }
        }
    }
    
    if (questionData.type === 'multiple' || questionData.type === 'fill') {
        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = '确认答案';
        confirmBtn.className = 'confirm-btn';
        confirmBtn.onclick = () => checkAnswer();
        optionsList.appendChild(confirmBtn);
    }
    
    if (viewState.userAnswers[originalIndex] !== undefined) {
        checkAnswer(true);
    }
}

function handleOptionClick(selectedLi) {
    const originalIndex = (state.currentView === 'main') ? state.main.currentIndex : state.wrongBook.wrongQuestionIndexes[state.wrongBook.currentIndex];
    const q = questions[originalIndex];

    if (q.type === 'single' || q.type === 'truefalse') {
        if ((state.main.userAnswers[originalIndex] !== undefined && state.currentView === 'main') || 
            (state.wrongBook.userAnswers[originalIndex] !== undefined && state.currentView === 'wrongBook')) return;
        
        const radio = selectedLi.querySelector('input');
        if (radio) radio.checked = true;
        checkAnswer();
    }
}


function checkAnswer(isRestoring = false) {
    const isMainView = state.currentView === 'main';
    const viewState = isMainView ? state.main : state.wrongBook;
    const originalIndex = isMainView ? viewState.currentIndex : state.wrongBook.wrongQuestionIndexes[viewState.currentIndex];
    
    if ((viewState.userAnswers[originalIndex] !== undefined || (questions[originalIndex] && questions[originalIndex].isGraduating)) && !isRestoring) return;

    const q = questions[originalIndex];
    let userAnswer;
    const isCorrect = () => {
        if (q.type === 'multiple') {
            return userAnswer.split('').sort().join('') === q.answer.split('').sort().join('');
        }
        return userAnswer === q.answer;
    }

    if (isRestoring) {
        userAnswer = viewState.userAnswers[originalIndex];
        if (q.type === 'single' || q.type === 'truefalse') {
             document.querySelector(`li[data-option="${userAnswer}"] input`).checked = true;
        } else if (q.type === 'multiple') {
             userAnswer.split('').forEach(opt => {
                document.querySelector(`li[data-option="${opt}"] input`).checked = true;
            });
        } else if (q.type === 'fill') {
            const inputEl = document.getElementById('fill-in-blank-input');
            if(inputEl) inputEl.value = userAnswer;
        }
    } else {
        if (q.type === 'single' || q.type === 'truefalse') {
            const selectedRadio = document.querySelector(`input[name="q${originalIndex}"]:checked`);
            if (!selectedRadio) return;
            userAnswer = selectedRadio.parentElement.dataset.option;
        } else if (q.type === 'multiple') {
            const checkedBoxes = document.querySelectorAll(`input[name="q${originalIndex}"]:checked`);
            userAnswer = Array.from(checkedBoxes).map(cb => cb.parentElement.dataset.option).sort().join('');
        } else if (q.type === 'fill') {
            const inputEl = document.getElementById('fill-in-blank-input');
            if(inputEl) userAnswer = inputEl.value.trim();
        }
        viewState.userAnswers[originalIndex] = userAnswer;
    }

    if (!isRestoring) {
        if (isCorrect()) {
            if (!isMainView) {
                q.correctStreak = (q.correctStreak || 0) + 1;
                if (q.correctStreak >= 3) {
                    q.isGraduating = true;
                    document.getElementById('question-text').classList.add('question-graduated');
                    const statusEl = document.getElementById('quiz-status');
                    statusEl.className = 'quiz-status status-correct';
                    statusEl.textContent = '🎉 恭喜！本题已掌握！';
                    
                    setTimeout(() => {
                        state.wrongBook.wrongQuestionIndexes = state.wrongBook.wrongQuestionIndexes.filter(i => i !== originalIndex);
                        delete q.isGraduating;
                        saveData();
                        render();
                    }, 1500);
                    return; // exit before showing standard feedback
                }
            }
        } else {
            q.wrongCount = (q.wrongCount || 0) + 1;
            q.correctStreak = 0;
            if (isMainView && !state.wrongBook.wrongQuestionIndexes.includes(originalIndex)) {
                state.wrongBook.wrongQuestionIndexes.push(originalIndex);
            }
        }
        saveData();
    }
    
    // Display feedback
    document.querySelectorAll('#options-list li, #options-list .confirm-btn, #fill-in-blank-input').forEach(el => el.classList.add('disabled'));
    const inputEl = document.getElementById('fill-in-blank-input');
    if (inputEl) inputEl.disabled = true;

    if(q.type !== 'fill') {
        document.querySelectorAll('#options-list li').forEach(li => {
            const optValue = li.dataset.option;
            const icon = li.querySelector('.feedback-icon');
            const answerSet = new Set(q.answer.split(''));
            const userSet = new Set((userAnswer || '').split(''));
            
            if (answerSet.has(optValue)) {
                li.classList.add('correct'); icon.classList.add('correct'); icon.textContent = '✓';
            } else if (userSet.has(optValue)) {
                li.classList.add('incorrect'); icon.classList.add('incorrect'); icon.textContent = '✗';
            }
        });
    } else { // Fill-in-the-blank feedback
        if(inputEl) {
             inputEl.classList.add(isCorrect() ? 'correct' : 'incorrect');
        }
    }

    document.getElementById('analysis-container').style.display = 'block';
    if (isMainView) renderStatusBar(true);
    else updateStatusDisplay();
}

function updateStatusDisplay() {
    if (state.currentView !== 'wrongBook' || state.wrongBook.wrongQuestionIndexes.length === 0) return;
    const originalIndex = state.wrongBook.wrongQuestionIndexes[state.wrongBook.currentIndex];
    const q = questions[originalIndex];
    const statusEl = document.getElementById('quiz-status');
    statusEl.className = 'quiz-status status-wrong';
    statusEl.textContent = `✅ ${q.correctStreak || 0} / 3`;
}

function renderHeader(isMainView) {
    const header = document.getElementById('app-header');
    header.innerHTML = isMainView ?
        `<span id="settings-icon" class="clickable">⚙️</span><span>做题</span><span></span>` :
        `<span id="back-from-wrongbook-btn" class="clickable">← 返回</span><span>错题本</span><span></span>`;
    
    if (isMainView) {
        document.getElementById('settings-icon').addEventListener('click', showSettingsView);
    } else {
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

    footer.innerHTML = `<button class="footer-btn" onclick="navigate(-1)" ${prevDisabled}>←</button>
                      <button class="footer-btn restart-btn" onclick="${restartFn}">↶ ${restartText}</button>
                      <button class="footer-btn ai-tutor-btn" onclick="openAITutorModal()" ${aiDisabled}>AI</button>
                      <button class="footer-btn" onclick="navigate(1)" ${nextDisabled}>→</button>`;
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
    saveData();
    render();
}

function restartWrongBook() {
    if (confirm("确定要重做错题本中的题目吗？")) {
        state.wrongBook.userAnswers = {};
        state.wrongBook.currentIndex = 0;
        questions.forEach(q => { q.correctStreak = 0; });
        saveData();
        render();
    }
}


// --- AI and Settings Logic ---
function applyCustomCSS() {
    const css = customCSSTextarea.value;
    customStyleEl.innerHTML = css;
    localStorage.setItem(STORAGE_KEYS.CSS, css);
    alert('新的美化样式已应用！');
}

function loadSettings() {
    const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (savedSettings) {
        settings = JSON.parse(savedSettings);
        apiPlatformSelect.value = settings.platform || 'google-gemini';
        apiUrlInput.value = settings.url || '';
        apiKeyInput.value = settings.apiKey || '';
        apiModelInput.value = settings.model || '';
        apiSystemPromptTextarea.value = settings.systemPrompt || '';
    }
    const savedCSS = localStorage.getItem(STORAGE_KEYS.CSS);
    if (savedCSS) {
        customCSSTextarea.value = savedCSS;
        customStyleEl.innerHTML = savedCSS;
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
    if (!settings.apiKey || !settings.model) {
        alert('❌ 请填写 API Key 和模型名称！');
        return;
    }
    if (settings.platform !== 'google-gemini' && !settings.url) {
        alert('❌ 请填写 API URL！');
        return;
    }
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    alert('✅ 设置已保存！');
    render();
}

function updateAPIPlaceholders() {
    const platform = apiPlatformSelect.value;
    const urlLabel = document.querySelector('label[for="api-url"]');

    if (platform === 'google-gemini') {
        apiUrlInput.style.display = 'none';
        if (urlLabel) urlLabel.style.display = 'none';
        apiModelInput.placeholder = 'gemini-2.5-flash';
    } else {
        apiUrlInput.style.display = 'block';
        if (urlLabel) urlLabel.style.display = 'block';
        if (platform === 'openai') {
            apiUrlInput.placeholder = 'https://api.openai.com/v1/chat/completions';
            apiModelInput.placeholder = 'gpt-4o';
        } else {
            apiUrlInput.placeholder = '输入你的兼容OpenAI格式的API URL';
            apiModelInput.placeholder = '输入模型名称';
        }
    }
}

async function testAPIConnection() {
    const platform = apiPlatformSelect.value;
    const url = apiUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const model = apiModelInput.value.trim();

    if (!apiKey || !model) {
        apiTestFeedback.textContent = '❌ 请填写 API Key, 和模型名称！';
        apiTestFeedback.className = 'status-wrong';
        return;
    }
    
    if (platform !== 'google-gemini' && !url) {
        apiTestFeedback.textContent = '❌ 请填写 API URL！';
        apiTestFeedback.className = 'status-wrong';
        return;
    }
    
    apiTestFeedback.textContent = '正在测试连接...';
    apiTestFeedback.className = '';

    try {
        await callAI([{role: 'user', text: 'hi'}], { platform, url, apiKey, model, systemPrompt: 'You are a helpful assistant.' });
        apiTestFeedback.textContent = '✅ 连接成功！';
        apiTestFeedback.className = 'status-correct';
    } catch (error) {
        apiTestFeedback.textContent = `❌ 连接失败: ${error.message}`;
        apiTestFeedback.className = 'status-wrong';
    }
}

async function callAI(messages, apiConfig) {
    const { platform, url, apiKey, model, systemPrompt } = apiConfig;
    let finalUrl;
    let headers = { 'Content-Type': 'application/json' };
    let body;

    if (platform === 'google-gemini') {
        finalUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const contents = messages.map(msg => ({
            role: msg.role === 'model' ? 'model' : 'user', // Gemini uses 'model' for assistant
            parts: [{ text: msg.text }]
        }));
        body = JSON.stringify({
            contents: contents,
            systemInstruction: systemPrompt ? { role: 'system', parts: [{ text: systemPrompt }] } : undefined,
        });
    } else { // OpenAI or Custom
        finalUrl = url;
        headers['Authorization'] = `Bearer ${apiKey}`;
        const openaiMessages = messages.map(msg => ({
            role: msg.role === 'model' ? 'assistant' : 'user',
            content: msg.text
        }));
        
        body = JSON.stringify({
            model: model,
            messages: [
                { role: 'system', content: systemPrompt || 'You are a helpful assistant.' },
                ...openaiMessages
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
    const q = questions[originalIndex];

    const optionsString = q.type === 'fill' ? '' : `【选项】:\n${Object.entries(q.options).map(([key, value]) => `${key}. ${value}`).join('\n')}`;
    
    initialAIPrompt = `我正在做一道题，请你以一个循循善诱的老师的身份，帮我解答疑惑。请不要直接告诉我答案，而是引导我思考。这是题目的背景信息：\n\n【题目】: ${q.question}\n${optionsString}\n【正确答案】: ${q.answer}\n【答案解析】: ${q.analysis}`;

    aiChatHistory = [{ role: 'model', text: `你好！关于这道题“${q.question.substring(0, 20)}...”，有什么我可以帮助你的吗？` }];
    renderChatHistory();

    document.getElementById('ai-user-query').value = '';
    document.getElementById('ai-tutor-modal').style.display = 'flex';
}

function closeAITutorModal() {
    document.getElementById('ai-tutor-modal').style.display = 'none';
    stopThinkingTimer();
}

async function askAI() {
    const userQuery = document.getElementById('ai-user-query').value.trim();
    if (!userQuery) return;

    const aiQueryTextarea = document.getElementById('ai-user-query');
    aiQueryTextarea.value = '';
    aiQueryTextarea.style.height = 'auto';

    aiChatHistory.push({ role: 'user', text: userQuery });
    renderChatHistory();

    const sendBtn = document.getElementById('ai-send-btn');
    sendBtn.disabled = true;
    startThinkingTimer();

    const messagesForAPI = [
        { role: 'user', text: initialAIPrompt },
        { role: 'model', text: '好的，我明白了。我会作为一名循循善诱的老师来引导用户。请问用户有什么问题？' },
        ...aiChatHistory
    ];

    try {
        const aiResponse = await callAI(messagesForAPI, settings);
        aiChatHistory.push({ role: 'model', text: aiResponse });
    } catch (error) {
        aiChatHistory.push({ role: 'model', text: `抱歉，出错了：${error.message}` });
    } finally {
        stopThinkingTimer();
        renderChatHistory();
        sendBtn.disabled = false;
    }
}

function renderChatHistory() {
    const historyContainer = document.getElementById('ai-chat-history');
    historyContainer.innerHTML = '';
    aiChatHistory.forEach(msg => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${msg.role === 'user' ? 'user-message' : 'ai-message'}`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'chat-bubble';
        contentDiv.textContent = msg.text;

        msgDiv.appendChild(contentDiv);
        historyContainer.appendChild(msgDiv);
    });
    historyContainer.scrollTop = historyContainer.scrollHeight;
}

function startThinkingTimer() {
    const timerEl = document.getElementById('ai-thinking-timer');
    const indicatorEl = document.getElementById('ai-thinking-indicator');
    indicatorEl.style.display = 'flex';
    thinkingStartTime = Date.now();
    timerEl.textContent = '思考中...';

    thinkingTimerInterval = setInterval(() => {
        const elapsed = ((Date.now() - thinkingStartTime) / 1000).toFixed(1);
        timerEl.textContent = `思考中... ${elapsed}s`;
    }, 100);
}

function stopThinkingTimer() {
    clearInterval(thinkingTimerInterval);
    thinkingTimerInterval = null;
    thinkingStartTime = null;
    document.getElementById('ai-thinking-indicator').style.display = 'none';
}
        
document.addEventListener('DOMContentLoaded', () => {
    loadDataAndInitialize();
    loadSettings();
    document.getElementById('back-to-quiz-btn').addEventListener('click', showQuizView);
    document.getElementById('back-to-settings-btn').addEventListener('click', showSettingsView);
    apiPlatformSelect.addEventListener('change', updateAPIPlaceholders);

    const aiQueryTextarea = document.getElementById('ai-user-query');
    aiQueryTextarea.addEventListener('input', () => {
        aiQueryTextarea.style.height = 'auto';
        aiQueryTextarea.style.height = (aiQueryTextarea.scrollHeight) + 'px';
    });
     aiQueryTextarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            askAI();
        }
    });
});
