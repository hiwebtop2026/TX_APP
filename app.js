// ========== 错误处理包装 ==========
window.addEventListener('error', function(e) {
    console.error('Global error:', e.error);
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('Unhandled promise rejection:', e.reason);
});

// ========== 数据 ==========
const chineseFull = [{word:"一",pinyin:"yī",meaning:"数字1"},{word:"二",pinyin:"èr",meaning:"数字2"},{word:"三",pinyin:"sān",meaning:"数字3"},{word:"四",pinyin:"sì",meaning:"数字4"},{word:"五",pinyin:"wǔ",meaning:"数字5"},{word:"六",pinyin:"liù",meaning:"数字6"},{word:"七",pinyin:"qī",meaning:"数字7"},{word:"八",pinyin:"bā",meaning:"数字8"},{word:"九",pinyin:"jiǔ",meaning:"数字9"},{word:"十",pinyin:"shí",meaning:"数字10"},{word:"人",pinyin:"rén",meaning:"人类"},{word:"口",pinyin:"kǒu",meaning:"嘴巴"},{word:"手",pinyin:"shǒu",meaning:"手"},{word:"水",pinyin:"shuǐ",meaning:"液体"},{word:"火",pinyin:"huǒ",meaning:"燃烧"},{word:"山",pinyin:"shān",meaning:"高山"},{word:"云",pinyin:"yún",meaning:"云朵"},{word:"风",pinyin:"fēng",meaning:"空气流动"},{word:"雨",pinyin:"yǔ",meaning:"雨水"},{word:"天",pinyin:"tiān",meaning:"天空"},{word:"地",pinyin:"dì",meaning:"大地"},{word:"爸",pinyin:"bà",meaning:"父亲"},{word:"妈",pinyin:"mā",meaning:"母亲"},{word:"爱",pinyin:"ài",meaning:"喜爱"},{word:"学",pinyin:"xué",meaning:"学习"},{word:"快乐",pinyin:"kuài lè",meaning:"开心"}];
const englishFull = [{word:"apple",phonetic:"/ˈæpl/",meaning:"苹果"},{word:"banana",phonetic:"/bəˈnɑːnə/",meaning:"香蕉"},{word:"cat",phonetic:"/kæt/",meaning:"猫"},{word:"dog",phonetic:"/dɔːɡ/",meaning:"狗"},{word:"sun",phonetic:"/sʌn/",meaning:"太阳"},{word:"moon",phonetic:"/muːn/",meaning:"月亮"},{word:"happy",phonetic:"/ˈhæpi/",meaning:"快乐"},{word:"big",phonetic:"/bɪɡ/",meaning:"大"},{word:"small",phonetic:"/smɔːl/",meaning:"小"},{word:"red",phonetic:"/red/",meaning:"红色"},{word:"blue",phonetic:"/bluː/",meaning:"蓝色"},{word:"teacher",phonetic:"/ˈtiːtʃər/",meaning:"老师"},{word:"school",phonetic:"/skuːl/",meaning:"学校"},{word:"book",phonetic:"/bʊk/",meaning:"书"},{word:"friend",phonetic:"/frend/",meaning:"朋友"}];
let customSets = [], currentCustomSetId = null;
let dictationState = { active: false, wordList: [], wordDetailsMap: new Map(), currentIndex: 0, savedCount: 0, type: "custom", waitingForInput: false, inputTimer: null, listeningOnly: false, isReviewMode: false, reviewLang: null, isSubmitting: false, useTianZiGe: true };
let appSettings = { playCount: 3, intervalSec: 3, rate: 1.0, voiceGender: "female", dictationMode: "auto", autoWaitSec: 2, listeningOnly: false };
let currentRecord = [];
let sessionId = Date.now();

// ========== 夜间模式 ==========
function initThemeToggle() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
    }
    
    const toggleBtn = document.getElementById('themeToggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            toggleBtn.textContent = isDark ? '☀️' : '🌙';
        });
        
        // 初始化按钮图标
        const isDark = document.body.classList.contains('dark-mode');
        toggleBtn.textContent = isDark ? '☀️' : '🌙';
    }
}

// ========== 辅助函数 ==========
function escapeHtml(str) { if(!str) return ''; return str.replace(/[&<>]/g, function(m) { if(m === '&') return '&amp;'; if(m === '<') return '&lt;'; if(m === '>') return '&gt;'; return m; }); }
function saveCustomSets() { localStorage.setItem("customWordSets", JSON.stringify(customSets)); }
function saveSettingsToLocal() { localStorage.setItem("dictationSettings", JSON.stringify(appSettings)); }

// ========== 记录保存与加载 ==========
function saveCurrentRecord() {
    localStorage.setItem(`dictation_record_${sessionId}`, JSON.stringify(currentRecord));
    localStorage.setItem('last_record_session', sessionId);
}
function loadRecordBySession(sid) {
    const data = localStorage.getItem(`dictation_record_${sid}`);
    if(data) return JSON.parse(data);
    return [];
}
function clearCurrentRecord() {
    currentRecord = [];
    localStorage.removeItem(`dictation_record_${sessionId}`);
    renderRecordList();
}

// ========== 语音合成优化模块 ==========
let speechCancelFlag = false;
let speechTimeoutId = null;
let cachedVoices = [];
let voicesLoaded = false;
let voiceMapByURI = new Map(); // voiceURI -> voice object

async function loadVoices() {
    return new Promise((resolve) => {
        const voices = speechSynthesis.getVoices();
        console.log('Initial voices count:', voices.length);
        if (voices.length) {
            cachedVoices = voices;
            // Build voiceMapByURI for precise matching
            voices.forEach(v => {
                voiceMapByURI.set(v.voiceURI, v);
            });
            voicesLoaded = true;
            console.log('Voices loaded immediately:', voices.map(v => v.name));
            return resolve(voices);
        }
        
        let resolved = false;
        const doResolve = (vs) => {
            if (resolved) return;
            resolved = true;
            cachedVoices = vs;
            vs.forEach(v => {
                voiceMapByURI.set(v.voiceURI, v);
            });
            voicesLoaded = true;
            console.log('Voices loaded:', vs.length, vs.map(v => `${v.name}(${v.lang})`));
            resolve(vs);
        };
        
        if (speechSynthesis.onvoiceschanged !== null) {
            speechSynthesis.onvoiceschanged = () => {
                const vs = speechSynthesis.getVoices();
                console.log('voiceschanged event, count:', vs.length);
                if (vs.length) doResolve(vs);
            };
        }
        
        let retry = 0;
        const timer = setInterval(() => {
            const vs = speechSynthesis.getVoices();
            if (vs.length || ++retry > 60) {
                clearInterval(timer);
                doResolve(vs);
            }
        }, 100);
        
        setTimeout(() => {
            const vs = speechSynthesis.getVoices();
            doResolve(vs);
        }, 5000);
    });
}

function preprocessText(text) {
    if (!text) return text;
    text = text.replace(/(\d+)℃/g, (_, num) => `${convertNumberToChinese(num)}摄氏度`);
    text = text.replace(/(\d+)%/g, (_, num) => `${convertNumberToChinese(num)}百分之`);
    text = text.replace(/(\d+)倍/g, (_, num) => `${convertNumberToChinese(num)}倍`);
    text = text.replace(/(\d+)/g, (_, num) => {
        if (num.length <= 4 && !/^\d+$/.test(text)) {
            return convertNumberToChinese(num);
        }
        return num;
    });
    return text;
}

function convertNumberToChinese(num) {
    const chars = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    const units = ['', '十', '百', '千', '万', '亿'];
    let result = '';
    let str = String(num);
    let len = str.length;
    for (let i = 0; i < len; i++) {
        const digit = parseInt(str[i]);
        const unit = units[len - 1 - i];
        if (digit === 0) {
            if (result && !result.endsWith('零')) result += '零';
        } else {
            result += chars[digit] + unit;
        }
    }
    result = result.replace(/零+$/, '');
    if (result.startsWith('一十')) result = result.slice(1);
    return result || '零';
}

function isFemaleVoice(voice) {
    const nameLower = voice.name.toLowerCase();
    if (isMaleVoice(voice)) return false;
    
    const femalePatterns = [
        /^.*female.*$/i, /^.*woman.*$/i, /^.*girl.*$/i,
        /xiaoxiao/i, /xiaoyi/i, /xiaoxuan/i, /yaoyao/i, /huihui/i,
        /zira/i, /samantha/i, /luna/i, /zhiyu/i, /yundai/i, /xiaoyan/i,
        /jenny/i, /aria/i, /nanami/i,
        /ting-ting/i, /yu-shu/i, /tian-tian/i, /mei-jia/i,
        /siri声音2/i, /声音2/i, /siri.*女/i, /语舒/i, /婷婷/i
    ];
    return femalePatterns.some(p => p.test(nameLower));
}

function isMaleVoice(voice) {
    const nameLower = voice.name.toLowerCase();
    const vlang = (voice.lang || '').toLowerCase();
    
    const isZh = vlang.startsWith('zh') || vlang.includes('cn');
    
    const malePatterns = [
        /^.*male.*$/i, /^.*man.*$/i, /^.*boy.*$/i,
        /yunyang/i, /yunxi/i, /yunjian/i, /yunxia/i, /kangkang/i,
        /david/i, /alex/i, /guy/i, /daniel/i, /james/i, /john/i, /tom/i,
        /xiaojun/i, /xiaokang/i, /xiaoyong/i, /xiaowei/i, /jiawei/i,
        /li-mu/i, /limu/i, /ji-hong/i, /jihong/i,
        /siri.*1$/i, /siri声音1/i, /声音1/i, /siri.*男/i
    ];
    
    if (isZh) {
        if (/声音1/i.test(voice.name) || 
            /siri.*1/i.test(voice.name) ||
            /siri.*male/i.test(voice.name.toLowerCase())) {
            return true;
        }
    }
    
    return malePatterns.some(p => p.test(nameLower));
}

function getBestVoice(lang, gender) {
    const isChinese = lang === 'zh-CN' || lang.startsWith('zh');
    const langPatterns = isChinese 
        ? ['zh-CN', 'zh_CN', 'zh-Hans', 'zh-hans', 'zh-Hans-CN', 'zh-Hant', 'zh-TW', 'zh'] 
        : ['en-US', 'en_US', 'en-GB', 'en'];
    
    let langVoices = cachedVoices.filter(v => {
        const vlang = (v.lang || '').toLowerCase();
        return langPatterns.some(p => vlang.startsWith(p.toLowerCase()));
    });
    
    if (!langVoices.length) {
        langVoices = cachedVoices.filter(v => /zh|chinese|siri/i.test(v.name + ' ' + v.lang));
    }
    
    if (!langVoices.length) {
        console.warn('No voices found for lang:', lang);
        return cachedVoices.length > 0 ? cachedVoices[0] : null;
    }

    const preferredMaleNames = ['Siri声音1', 'Siri 声音1', 'Siri 男声', 'Siri Male',
        'Siri Voice 1', 'Voice 1', 'Siri_1', '声音1',
        'YunyangNeural', 'Yunyang', 'Yunxi', 'Kangkang', 'KangkangNeural',
        'Li-mu', 'Li-mu-compact', 'Ji-hong', 'Limu', 'Jihong',
        'David', 'Microsoft David', 'Alex', 'Google UK English Male', 'Guy', 'Daniel'];

    const preferredFemaleNames = ['Siri声音2', 'Siri 声音2', 'Siri 女声', 'Siri Female',
        'Siri Voice 2', 'Voice 2', 'Siri_2', '声音2',
        'XiaoxiaoNeural', 'Xiaoxiao', 'Xiaoyi', 'XiaoyiNeural', 'Yaoyao', 'YaoyaoNeural',
        'Huihui', 'HuihuiNeural', 'Zhiyu', 'Ting-Ting', 'Yu-shu', 'Tian-Tian', 'Mei-Jia',
        'Samantha', 'Microsoft Zira', 'Zira', 'Jenny', 'Aria', 'Nanami'];

    const targetNames = gender === 'male' ? preferredMaleNames : preferredFemaleNames;
    
    for (const name of targetNames) {
        const voice = langVoices.find(v => v.name.toLowerCase().includes(name.toLowerCase()));
        if (voice) {
            console.log('Voice selected (preferred):', voice.name, 'for gender:', gender);
            return voice;
        }
    }

    const voicesByGender = langVoices.filter(v => {
        return gender === 'male' ? isMaleVoice(v) : isFemaleVoice(v);
    });

    if (voicesByGender.length) {
        console.log('Voice selected (gender):', voicesByGender[0].name, 'for gender:', gender);
        return voicesByGender[0];
    }

    const defaultVoice = langVoices.find(v => v.default);
    if (defaultVoice) {
        console.log('Voice selected (default):', defaultVoice.name, 'for gender:', gender);
        return defaultVoice;
    }
    
    console.log('Voice selected (first):', langVoices[0].name, 'for gender:', gender);
    return langVoices[0];
}

// 使用 voiceURI 精确匹配语音
function getVoiceByURI(voiceURI) {
    if (!voiceURI) return null;
    return voiceMapByURI.get(voiceURI) || null;
}

function getOptimalRate(lang) {
    if (lang === 'zh-CN') {
        return Math.min(Math.max(appSettings.rate * 0.9, 0.6), 1.2);
    }
    return appSettings.rate;
}

function getOptimalPitch(lang) {
    if (lang === 'zh-CN') {
        return 1.0;
    }
    return 1.0;
}

async function speakText(text) {
    if (!text) return;
    cancelSpeech();
    speechCancelFlag = false;
    
    if (!voicesLoaded) {
        await loadVoices();
    }

    const processedText = preprocessText(text);
    const isChinese = /[\u4e00-\u9fa5]/.test(text);
    const lang = isChinese ? "zh-CN" : "en-US";
    
    await new Promise(r => setTimeout(r, 60));
    
    const voiceSelector = document.getElementById("voiceSelector");
    const customVoiceName = voiceSelector?.value;
    const savedVoiceURI = localStorage.getItem('selectedVoiceURI');
    
    let selectedVoice = null;
    
    // 优先使用 voiceURI 精确匹配
    if (savedVoiceURI) {
        selectedVoice = getVoiceByURI(savedVoiceURI);
        console.log('Voice matched by URI:', savedVoiceURI, selectedVoice ? selectedVoice.name : 'not found');
    }
    
    // 其次使用 voice 名称匹配
    if (!selectedVoice && customVoiceName) {
        selectedVoice = cachedVoices.find(v => v.name === customVoiceName);
    }
    
    // 最后使用性别选择
    if (!selectedVoice) {
        selectedVoice = getBestVoice(lang, appSettings.voiceGender);
    }
    
    for (let i = 0; i < appSettings.playCount; i++) {
        if (speechCancelFlag || !dictationState.active) break;
        
        await new Promise(resolve => {
            const utter = new SpeechSynthesisUtterance(processedText);
            utter.lang = lang;
            utter.rate = getOptimalRate(lang);
            utter.pitch = getOptimalPitch(lang);
            utter.volume = 1.0;
            
            if (selectedVoice) {
                utter.voice = selectedVoice;
            }
            
            utter.onend = () => resolve();
            utter.onerror = () => resolve();
            utter.onboundary = () => {
                if (speechCancelFlag || !dictationState.active) {
                    speechSynthesis.cancel();
                }
            };
            
            speechSynthesis.speak(utter);
        });
        
        if (i !== appSettings.playCount - 1 && !speechCancelFlag && dictationState.active) {
            await new Promise(r => {
                speechTimeoutId = setTimeout(r, appSettings.intervalSec * 1000);
            });
        }
    }
}

function cancelSpeech() { 
    speechCancelFlag = true; 
    speechSynthesis.cancel();
    if (speechTimeoutId) {
        clearTimeout(speechTimeoutId);
        speechTimeoutId = null;
    }
}

// ========== Canvas 手写板绘图 ==========
let drawing = false;
let currentCanvas = null;
let currentCtx = null;

function initCanvasHandwriting(canvas, color = '#2c6288', lineWidth = 6) {
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    function getCanvasCoords(e, canvas) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        let clientX, clientY;
        if (e.touches) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        let x = (clientX - rect.left) * scaleX;
        let y = (clientY - rect.top) * scaleY;
        x = Math.min(Math.max(0, x), canvas.width);
        y = Math.min(Math.max(0, y), canvas.height);
        return { x, y };
    }

    function startDraw(e) {
        e.preventDefault();
        drawing = true;
        currentCanvas = canvas;
        currentCtx = ctx;
        const { x, y } = getCanvasCoords(e, canvas);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y);
        ctx.stroke();
    }

    function draw(e) {
        if (!drawing || currentCanvas !== canvas) return;
        e.preventDefault();
        const { x, y } = getCanvasCoords(e, canvas);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
    }

    function endDraw() {
        drawing = false;
        currentCanvas = null;
        currentCtx = null;
    }

    canvas.addEventListener('touchstart', startDraw);
    canvas.addEventListener('touchmove', draw);
    canvas.addEventListener('touchend', endDraw);
    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', endDraw);
}

function clearCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function clearAllCanvases() {
    document.querySelectorAll('.handwrite-canvas').forEach(canvas => clearCanvas(canvas));
}

function captureCurrentData() {
    if (dictationState.useTianZiGe) {
        const canvases = document.querySelectorAll('.handwrite-canvas');
        const images = [];
        canvases.forEach(canvas => images.push(canvas.toDataURL()));
        return { type: 'image', data: images };
    } else {
        const input = document.getElementById('normalAnswerInput');
        const text = input ? input.value.trim() : '';
        return { type: 'text', data: text };
    }
}

function renderInputArea() {
    const container = document.getElementById("dynamicInputArea");
    if(!container) return;
    if(dictationState.listeningOnly) {
        container.innerHTML = '<div style="padding:20px;color:#888;text-align:center;">🎧 纯听模式，无需书写</div>';
        return;
    }
    if(dictationState.useTianZiGe) {
        const currentWord = dictationState.wordList[dictationState.currentIndex];
        let chars = Array.from(currentWord);
        let gridCount = chars.length;
        if(gridCount > 4) gridCount = 4;
        if(gridCount < 1) gridCount = 1;
        let html = `<div class="tian-grid-container"><div class="tian-grid" id="tianGridWrapper">`;
        for(let i=0; i<gridCount; i++) {
            html += `<div class="tian-cell" data-grid-index="${i}"><canvas class="handwrite-canvas" width="100%" height="100%" style="width:100%;height:100%;"></canvas></div>`;
        }
        html += `</div><div class="handwrite-tip">✍️ 直接在米字格内手写，提交后笔迹自动保存</div>`;
        if(currentWord.length > gridCount) html += `<div style="font-size:11px;color:#b45309;margin-top:6px;">⚠️ 词语较长，请在前${gridCount}格书写</div>`;
        html += `</div>`;
        container.innerHTML = html;
        const canvases = container.querySelectorAll('.handwrite-canvas');
        canvases.forEach(canvas => {
            const rect = canvas.parentElement.getBoundingClientRect();
            canvas.width = rect.width;
            canvas.height = rect.height;
            initCanvasHandwriting(canvas, '#2c6288', 6);
        });
    } else {
        container.innerHTML = `<input type="text" id="normalAnswerInput" class="normal-input" placeholder="✍️ 在这里输入答案" autocomplete="off" inputmode="text">`;
        setTimeout(() => { const inp = document.getElementById("normalAnswerInput"); if(inp) inp.focus(); }, 50);
    }
}

function clearCurrentInput() {
    if(dictationState.useTianZiGe) {
        clearAllCanvases();
    } else {
        const inp = document.getElementById("normalAnswerInput");
        if(inp) inp.value = '';
    }
}

function shouldUseTianZiGe(wordList, sourceType) {
    if(sourceType === 'english') return false;
    if(sourceType === 'chinese') return true;
    for(let w of wordList) {
        if(/[\u4e00-\u9fa5]/.test(w)) return true;
    }
    return false;
}

async function saveAndNext() {
    if(!dictationState.active || dictationState.listeningOnly || dictationState.isSubmitting) return;
    dictationState.isSubmitting = true;
    if(dictationState.waitingForInput) { cancelDictTimers(); dictationState.waitingForInput = false; }
    
    const currentWord = dictationState.wordList[dictationState.currentIndex];
    const captured = captureCurrentData();
    currentRecord.push({ 
        word: currentWord, 
        data: captured.data, 
        isImage: (captured.type === 'image')
    });
    saveCurrentRecord();
    dictationState.savedCount++;
    document.getElementById("sessionCorrect").innerText = dictationState.savedCount;
    document.getElementById("sessionRemain").innerText = dictationState.wordList.length - dictationState.currentIndex - 1;
    
    const today = new Date().toLocaleDateString();
    let records = JSON.parse(localStorage.getItem('dictationRecords') || '{}');
    if(!records[today]) records[today] = {total:0};
    records[today].total++;
    localStorage.setItem('dictationRecords', JSON.stringify(records));
    refreshHomeStats();
    
    if(appSettings.dictationMode === "auto") {
        if(dictationState.currentIndex + 1 >= dictationState.wordList.length) {
            finishDictation();
            dictationState.isSubmitting = false;
            return;
        }
        dictationState.currentIndex++;
        refreshDictationUI();
        setTimeout(() => { playCurrentWord(); dictationState.isSubmitting = false; }, 250);
    } else {
        dictationState.isSubmitting = false;
    }
}

function refreshDictationUI() {
    document.getElementById("curIdx").innerText = dictationState.currentIndex+1;
    document.getElementById("sessionRemain").innerText = dictationState.wordList.length - dictationState.currentIndex;
    document.getElementById("dictResultArea").innerHTML = "";
    document.getElementById("hintArea").style.display = "none";
    renderInputArea();
}

function nextWordManual() {
    if(!dictationState.active) return;
    if(dictationState.listeningOnly) {
        if(dictationState.currentIndex+1 >= dictationState.wordList.length) finishDictation();
        else { dictationState.currentIndex++; refreshDictationUI(); playCurrentWord(); }
        return;
    }
    if(!dictationState.listeningOnly && appSettings.dictationMode === "manual") {
        if(!dictationState.isSubmitting) {
            saveAndNext();
        }
    }
}

function skipWord() {
    if(!dictationState.active || dictationState.listeningOnly) return;
    cancelDictTimers();
    if(dictationState.currentIndex+1 >= dictationState.wordList.length) finishDictation();
    else { 
        dictationState.currentIndex++; 
        refreshDictationUI(); 
        playCurrentWord(); 
    }
}

function finishDictation() {
    if(dictationState.active) {
        cancelDictTimers(); cancelSpeech();
        alert(`🎉 完成听写！共保存 ${currentRecord.length} 个词语的记录，可在"听写记录"中查看。`);
        exitDictation();
    }
}

function exitDictation() {
    cancelDictTimers(); cancelSpeech();
    dictationState.active = false;
    showPage("pageHome");
}

function startDictationWithWords(wordsArray, title, sourceType, detailsMap, isReview = false, reviewLang = null) {
    if(!wordsArray.length) { alert("词库为空，请先添加词语"); return false; }
    if(dictationState.active) exitDictation();
    cancelDictTimers(); cancelSpeech();
    sessionId = Date.now();
    currentRecord = [];
    dictationState.active = true;
    dictationState.wordList = [...wordsArray];
    dictationState.wordDetailsMap = detailsMap ? new Map(detailsMap) : new Map();
    dictationState.currentIndex = 0;
    dictationState.savedCount = 0;
    dictationState.type = sourceType;
    dictationState.waitingForInput = false;
    dictationState.isReviewMode = isReview;
    dictationState.reviewLang = reviewLang;
    dictationState.isSubmitting = false;
    dictationState.listeningOnly = appSettings.listeningOnly;
    dictationState.useTianZiGe = !dictationState.listeningOnly && shouldUseTianZiGe(wordsArray, sourceType);
    
    document.getElementById("dictTitle").innerText = title;
    document.getElementById("sessionCorrect").innerText = "0";
    document.getElementById("sessionRemain").innerText = wordsArray.length;
    document.getElementById("dictResultArea").innerHTML = "";
    document.getElementById("hintArea").style.display = "none";
    document.getElementById("wordDisplayHint").innerHTML = "🎧 准备就绪";
    document.getElementById("curIdx").innerText = "1";
    document.getElementById("totalWords").innerText = wordsArray.length;
    
    const normalBtnRow = document.getElementById("normalBtnRow");
    const pureListenBtnRow = document.getElementById("pureListenBtnRow");
    const actionBtnRow = document.getElementById("actionBtnRow");
    const submitBtn = document.getElementById("submitBtn");
    const nextBtn = document.getElementById("nextBtn");
    const skipBtn = document.getElementById("skipBtn");
    const clearBtn = document.getElementById("clearInputBtn");
    
    if(dictationState.listeningOnly) {
        document.getElementById("dynamicInputArea").style.display = "none";
        if(normalBtnRow) normalBtnRow.style.display = "none";
        if(actionBtnRow) actionBtnRow.style.display = "none";
        if(pureListenBtnRow) pureListenBtnRow.style.display = "flex";
        if(appSettings.dictationMode === "auto") {
            document.getElementById("autoStatusTip").innerHTML = "🎧 纯听模式：自动播放下一词";
        } else {
            document.getElementById("autoStatusTip").innerHTML = "🎧 纯听模式：点击下一词切换";
        }
    } else {
        document.getElementById("dynamicInputArea").style.display = "block";
        if(normalBtnRow) normalBtnRow.style.display = "flex";
        if(pureListenBtnRow) pureListenBtnRow.style.display = "none";
        if(actionBtnRow) actionBtnRow.style.display = "flex";
        submitBtn.style.display = "inline-block";
        if(clearBtn) clearBtn.style.display = "inline-block";
        if(appSettings.dictationMode === "auto") {
            nextBtn.style.display = "none";
            skipBtn.style.display = "inline-block";
            document.getElementById("autoStatusTip").innerHTML = "✨ 自动模式：保存后自动播放下一个";
            dictationState.waitingForInput = true;
            dictationState.inputTimer = setTimeout(() => { if(dictationState.active && dictationState.waitingForInput) saveAndNext(); }, appSettings.autoWaitSec * 1000);
        } else {
            nextBtn.style.display = "inline-block";
            skipBtn.style.display = "none";
            document.getElementById("autoStatusTip").innerHTML = "🖱️ 手动模式：点击「保存并继续」或「下一词」";
        }
    }
    showPage("pageDictation");
    renderInputArea();
    playCurrentWord();
    return true;
}

async function playCurrentWord() {
    if(!dictationState.active) {
        console.log('playCurrentWord: not active, return');
        return;
    }
    
    cancelDictTimers();
    dictationState.waitingForInput = false;
    
    const word = dictationState.wordList[dictationState.currentIndex];
    console.log('playCurrentWord: index=', dictationState.currentIndex, 'word=', word, 'mode=', appSettings.dictationMode, 'listeningOnly=', dictationState.listeningOnly);
    
    if(word) await speakText(word);
    
    if(appSettings.dictationMode === "auto" && dictationState.active) {
        if(dictationState.listeningOnly) {
            dictationState.waitingForInput = true;
            const waitSec = appSettings.autoWaitSec || 3;
            document.getElementById("autoStatusTip").innerHTML = `🎧 纯听模式：${waitSec}秒后自动播放下一词`;
            console.log('Setting auto timer for next word in', waitSec, 'seconds');
            
            dictationState.inputTimer = setTimeout(() => {
                console.log('Auto timer fired, active=', dictationState.active, 'waitingForInput=', dictationState.waitingForInput);
                if(dictationState.active && dictationState.waitingForInput) {
                    dictationState.waitingForInput = false;
                    if(dictationState.currentIndex < dictationState.wordList.length - 1) {
                        dictationState.currentIndex++;
                        document.getElementById("curIdx").innerText = dictationState.currentIndex + 1;
                        document.getElementById("sessionRemain").innerText = dictationState.wordList.length - dictationState.currentIndex;
                        console.log('Jumping to next word, index=', dictationState.currentIndex);
                        playCurrentWord();
                    } else {
                        console.log('All words finished');
                        finishDictation();
                    }
                }
            }, waitSec * 1000);
        } else {
            dictationState.waitingForInput = true;
            document.getElementById("autoStatusTip").innerHTML = `✍️ 请在输入区域作答 (${appSettings.autoWaitSec}秒后自动保存)`;
            dictationState.inputTimer = setTimeout(() => { if(dictationState.active && dictationState.waitingForInput) saveAndNext(); }, appSettings.autoWaitSec * 1000);
        }
    } else {
        console.log('Not auto mode or not active, no auto jump');
    }
}

function cancelDictTimers() { if(dictationState.inputTimer) clearTimeout(dictationState.inputTimer); dictationState.inputTimer = null; }

// ========== 手写记录页面渲染 ==========
function renderRecordList() {
    const container = document.getElementById("recordList");
    if(!container) return;
    if(!currentRecord.length) {
        container.innerHTML = '<div class="no-record">暂无记录，请先完成听写。</div>';
        return;
    }
    let html = '';
    currentRecord.forEach((item, idx) => {
        html += `<div class="record-item">
                    <div class="record-word">${escapeHtml(item.word)}</div>
                    <div class="record-content">`;
        if (item.isImage) {
            item.data.forEach((imgData, i) => {
                html += `<img src="${imgData}" class="thumb-canvas" data-full="${imgData}" data-word="${escapeHtml(item.word)}" data-idx="${i}" style="cursor:pointer;">`;
            });
        } else {
            html += `<div class="record-text">${escapeHtml(item.data) || '(未填写)'}</div>`;
        }
        html += `</div></div>`;
    });
    container.innerHTML = html;
    document.querySelectorAll('.thumb-canvas').forEach(img => {
        img.addEventListener('click', (e) => {
            const fullData = img.dataset.full;
            const word = img.dataset.word;
            const win = window.open();
            win.document.write(`<html><head><title>手写笔迹 - ${word}</title><style>body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f0f0f0;} img{max-width:90vw;max-height:90vh;box-shadow:0 4px 12px rgba(0,0,0,0.2);}</style></head><body><img src="${fullData}" alt="手写笔迹"></body></html>`);
        });
    });
}

function exportRecords() {
    if(!currentRecord.length) { alert("暂无记录可导出"); return; }
    alert("可长按图片保存到本地，或使用截图工具保存。");
}

function clearRecords() {
    if(confirm("确定清空本次听写的所有记录吗？清空后不可恢复。")) {
        clearCurrentRecord();
        renderRecordList();
    }
}

// ========== 页面切换 ==========
function showPage(pageId) {
    if(dictationState.active && pageId !== "pageDictation") {
        if(confirm("听写尚未结束，离开将会丢失当前进度，是否离开？")) exitDictation();
        else return;
    }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    if(pageId === 'pageHome') refreshHomeStats();
    if(pageId === 'pageCustomManager') renderCustomList();
    if(pageId === 'pageRecords') renderRecordList();
}

function refreshHomeStats() {
    const today = new Date().toLocaleDateString();
    const records = JSON.parse(localStorage.getItem('dictationRecords') || '{}');
    const td = records[today] || {total:0};
    document.getElementById('todayCorrect').innerText = td.total;
    document.getElementById('todayRate').innerText = td.total + "词";
    document.getElementById('welcomeUser').innerHTML = `👋 ${escapeHtml(localStorage.getItem('studentName')||'同学')}，记录自动保存`;
}

// ========== 自定义词库管理 ==========
let editingSetId = null;

// ========== 词库搜索功能 ==========
function initWordSearch() {
    const searchInput = document.getElementById('wordSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            filterWordList(query);
        });
    }
}

function filterWordList(query) {
    const wordBadges = document.querySelectorAll('.word-badge');
    wordBadges.forEach(badge => {
        const word = badge.dataset.word?.toLowerCase() || '';
        if (!query || word.includes(query)) {
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    });
}

function renderCustomList() {
    const container = document.getElementById("customSetList");
    if(!container) return;
    container.innerHTML = "";
    customSets.forEach(set => {
        const div = document.createElement("div");
        div.className = "flex-row";
        div.style.justifyContent = "space-between";
        div.style.background = currentCustomSetId === set.id ? "#dbeafe" : "#f1f5f9";
        div.style.padding = "10px 14px";
        div.style.borderRadius = "50px";
        div.style.marginBottom = "8px";
        div.innerHTML = `<span><strong>${escapeHtml(set.name)}</strong> (${set.words.length}词)</span><div><button class="btn" data-select="${set.id}" style="padding:4px 10px;margin-right:4px;">选用</button><button class="btn" data-edit="${set.id}" style="padding:4px 10px;margin-right:4px;">编辑</button><button class="btn" data-del="${set.id}" style="padding:4px 10px;">删除</button></div>`;
        container.appendChild(div);
        
        // 渲染词库中的词语（带搜索功能）
        if (set.words && set.words.length) {
            const wordsDiv = document.createElement("div");
            wordsDiv.style.marginTop = "8px";
            wordsDiv.style.paddingLeft = "14px";
            
            // 添加搜索框
            const searchHtml = `<input type="text" id="wordSearchInput_${set.id}" placeholder="🔍 搜索词语..." style="width:100%;padding:6px 10px;border-radius:20px;border:1px solid #ddd;margin-bottom:8px;font-size:0.85rem;">`;
            wordsDiv.innerHTML = searchHtml;
            
            const wordListDiv = document.createElement("div");
            wordListDiv.className = "word-list";
            wordListDiv.id = `wordList_${set.id}`;
            
            let wordsHtml = '';
            set.words.forEach(w => {
                wordsHtml += `<span class="word-badge" data-word="${escapeHtml(w)}">${escapeHtml(w)}</span>`;
            });
            wordListDiv.innerHTML = wordsHtml;
            wordsDiv.appendChild(wordListDiv);
            container.appendChild(wordsDiv);
            
            // 绑定搜索事件
            const searchInput = document.getElementById(`wordSearchInput_${set.id}`);
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    const query = e.target.value.toLowerCase().trim();
                    const badges = wordListDiv.querySelectorAll('.word-badge');
                    badges.forEach(badge => {
                        const word = badge.dataset.word?.toLowerCase() || '';
                        if (!query || word.includes(query)) {
                            badge.style.display = 'inline-block';
                        } else {
                            badge.style.display = 'none';
                        }
                    });
                });
            }
        }
    });
    if(!customSets.length) container.innerHTML = "<div style='padding:12px'>暂无词库，点击新建</div>";
}

function editCustomSet(id) {
    const set = customSets.find(s => s.id === id);
    if(!set) return;
    editingSetId = id;
    document.getElementById("editSetName").value = set.name;
    document.getElementById("editSetWords").value = set.words.join('\n');
    document.getElementById("editSetModal").style.display = "flex";
}

function closeEditModal() {
    document.getElementById("editSetModal").style.display = "none";
    editingSetId = null;
    document.getElementById("editSetName").value = "";
    document.getElementById("editSetWords").value = "";
}

function saveEditSet() {
    if(!editingSetId) return;
    const name = document.getElementById("editSetName").value.trim();
    const wordsText = document.getElementById("editSetWords").value.trim();
    
    if(!name) {
        alert("请输入词库名称");
        return;
    }
    
    const words = wordsText.split(/[\n,，、\s]+/).filter(w => w.trim().length > 0);
    const uniqueWords = [...new Map(words.map(w => [w.trim(), w.trim()])).values()];
    
    const set = customSets.find(s => s.id === editingSetId);
    if(set) {
        set.name = name;
        set.words = uniqueWords;
        set.langType = uniqueWords.some(w => /[\u4e00-\u9fa5]/.test(w)) ? "chinese" : "english";
        saveCustomSets();
        renderCustomList();
        closeEditModal();
        alert("词库已更新");
    }
}

function selectCustomSet(id) { currentCustomSetId = id; alert(`已选用：${customSets.find(s=>s.id===id)?.name}`); }
function deleteCustomSet(id) { if(confirm("永久删除词库？")){ customSets = customSets.filter(s=>s.id!==id); if(currentCustomSetId===id) currentCustomSetId=customSets[0]?.id||null; saveCustomSets(); renderCustomList(); } }
function createNewCustomSet() { let name = prompt("新词库名称", "我的生词本"); if(!name) return; let newId = "c_"+Date.now(); customSets.push({ id:newId, name:name, words:[], langType:"chinese" }); currentCustomSetId = newId; saveCustomSets(); renderCustomList(); alert("新建成功，可粘贴生成词语"); }
function generateFromPaste() { let raw = document.getElementById("pasteTextArea").value; if(!raw.trim()) { alert("请粘贴内容"); return; } let words = raw.split(/[\n,，、\s]+/).filter(w => w.trim().length>0); words = [...new Map(words.map(w=>[w.trim(), w.trim()])).values()]; if(!words.length) { alert("未识别有效词语"); return; } let newName = prompt("词库名称", `听写作业-${new Date().toLocaleTimeString()}`); if(!newName) return; let newId = "gen_"+Date.now(); customSets.push({ id:newId, name:newName, words:words, langType:"auto" }); currentCustomSetId = newId; saveCustomSets(); renderCustomList(); alert(`生成成功！共${words.length}个词语`); document.getElementById("pasteTextArea").value = ""; }
function appendToCurrentCustom() { let raw = document.getElementById("pasteTextArea").value; if(!raw.trim()) { alert("粘贴内容为空"); return; } if(!currentCustomSetId) { alert("请先选择一个词库"); return; } let target = customSets.find(s=>s.id===currentCustomSetId); if(!target) return; let newWords = raw.split(/[\n,，、\s]+/).filter(w => w.trim() && !target.words.includes(w.trim())).map(w=>w.trim()); if(!newWords.length) { alert("无新词可添加"); return; } target.words.push(...newWords); saveCustomSets(); renderCustomList(); alert(`已追加${newWords.length}个词到「${target.name}」`); document.getElementById("pasteTextArea").value = ""; }
function startSelectedCustom() { const set = customSets.find(s => s.id === currentCustomSetId); if(!set || !set.words.length) { alert("当前自定义词库为空，请先通过「粘贴生成」或新建词库添加词语"); return; } const words = [...set.words]; const detailsMap = new Map(); words.forEach(w => detailsMap.set(w, /[\u4e00-\u9fa5]/.test(w) ? `词语：${w}` : `英文单词：${w}`)); startDictationWithWords(words, `✨ ${set.name}`, "custom", detailsMap, false, null); }

function saveSettings() {
    appSettings.playCount = parseInt(document.getElementById("settingPlayCount").value);
    appSettings.intervalSec = parseFloat(document.getElementById("settingIntervalSec").value);
    appSettings.rate = parseFloat(document.getElementById("settingRate").value);
    document.getElementById("rateValue").innerText = appSettings.rate.toFixed(2);
    appSettings.voiceGender = document.getElementById("settingVoiceGender").value;
    appSettings.dictationMode = document.getElementById("dictationMode").value;
    appSettings.autoWaitSec = parseFloat(document.getElementById("autoWaitSec").value);
    appSettings.listeningOnly = document.getElementById("listeningOnlyMode").checked;
    const voiceSelect = document.getElementById("voiceSelector");
    if (voiceSelect) {
        const selectedVoiceName = voiceSelect.value;
        const selectedVoice = cachedVoices.find(v => v.name === selectedVoiceName);
        if (selectedVoice) {
            // 同时保存 voiceURI 和 voice name
            localStorage.setItem('selectedVoice', selectedVoice.name);
            localStorage.setItem('selectedVoiceURI', selectedVoice.voiceURI);
            console.log('Saved voice:', selectedVoice.name, 'URI:', selectedVoice.voiceURI);
        } else if (selectedVoiceName) {
            localStorage.setItem('selectedVoice', selectedVoiceName);
            localStorage.removeItem('selectedVoiceURI');
        } else {
            localStorage.removeItem('selectedVoice');
            localStorage.removeItem('selectedVoiceURI');
        }
    }
    saveSettingsToLocal();
    updateVoiceInfo();
    alert("设置已保存");
}

function loadStorage() {
    const storedSets = localStorage.getItem("customWordSets");
    if(storedSets) customSets = JSON.parse(storedSets);
    else {
        customSets = [{ id: "set1", name: "基础生词", words: ["快乐","学习","成长","祖国","勤奋"], langType: "chinese" },{ id: "set2", name: "英语入门", words: ["apple","teacher","good","family","school"], langType: "english" }];
        currentCustomSetId = "set1";
    }
    if(!currentCustomSetId && customSets.length) currentCustomSetId = customSets[0].id;
    const storedSettings = localStorage.getItem("dictationSettings");
    if(storedSettings) Object.assign(appSettings, JSON.parse(storedSettings));
    document.getElementById("settingPlayCount").value = appSettings.playCount;
    document.getElementById("settingIntervalSec").value = appSettings.intervalSec;
    document.getElementById("settingRate").value = appSettings.rate;
    document.getElementById("rateValue").innerText = appSettings.rate.toFixed(2);
    document.getElementById("settingVoiceGender").value = appSettings.voiceGender;
    document.getElementById("dictationMode").value = appSettings.dictationMode;
    document.getElementById("autoWaitSec").value = appSettings.autoWaitSec;
    document.getElementById("listeningOnlyMode").checked = appSettings.listeningOnly;
}

function bindEvents() {
    document.querySelectorAll('[data-dictate]').forEach(btn => btn.addEventListener('click', e => { const type = btn.dataset.dictate; if(type === 'chinese') startDictationWithWords(chineseFull.map(i=>i.word), "📖 语文听写", "chinese", new Map(chineseFull.map(i=>[i.word,`拼音：${i.pinyin}，释义：${i.meaning}`])), false, null); else if(type === 'english') startDictationWithWords(englishFull.map(i=>i.word), "🇬🇧 英语听写", "english", new Map(englishFull.map(i=>[i.word,`音标：${i.phonetic}，释义：${i.meaning}`])), false, null); else startSelectedCustom(); }));
    document.querySelectorAll('[data-page]').forEach(btn => btn.addEventListener('click', e => showPage(btn.dataset.page)));
    document.querySelector('[data-exit-dictation]')?.addEventListener('click', () => exitDictation());
    
    document.getElementById("playVoiceBtn")?.addEventListener('click', () => playCurrentWord());
    document.getElementById("modeActionBtn")?.addEventListener('click', () => playCurrentWord());
    document.getElementById("hintBtn")?.addEventListener('click', () => { if(dictationState.active){ const w = dictationState.wordList[dictationState.currentIndex]; let msg = dictationState.wordDetailsMap.get(w) || `词语：${w}`; document.getElementById("hintArea").innerHTML = escapeHtml(msg); document.getElementById("hintArea").style.display = "block"; setTimeout(()=>document.getElementById("hintArea").style.display="none",2800); } });
    
    document.getElementById("purePlayVoiceBtn")?.addEventListener('click', () => playCurrentWord());
    document.getElementById("pureModeActionBtn")?.addEventListener('click', () => playCurrentWord());
    document.getElementById("pureHintBtn")?.addEventListener('click', () => { if(dictationState.active){ const w = dictationState.wordList[dictationState.currentIndex]; let msg = dictationState.wordDetailsMap.get(w) || `词语：${w}`; document.getElementById("hintArea").innerHTML = escapeHtml(msg); document.getElementById("hintArea").style.display = "block"; setTimeout(()=>document.getElementById("hintArea").style.display="none",2800); } });
    document.getElementById("pureNextBtn")?.addEventListener('click', () => nextWordManual());
    
    document.getElementById("submitBtn")?.addEventListener('click', () => { if(dictationState.active && !dictationState.listeningOnly && !dictationState.isSubmitting) saveAndNext(); });
    document.getElementById("nextBtn")?.addEventListener('click', () => nextWordManual());
    document.getElementById("skipBtn")?.addEventListener('click', () => skipWord());
    document.getElementById("clearInputBtn")?.addEventListener('click', () => clearCurrentInput());
    document.getElementById("clearRecordsBtn")?.addEventListener('click', () => clearRecords());
    document.getElementById("exportRecordsBtn")?.addEventListener('click', () => exportRecords());
    document.getElementById("saveSettingsBtn")?.addEventListener('click', () => saveSettings());
    document.getElementById("generateFromPasteBtn")?.addEventListener('click', () => generateFromPaste());
    document.getElementById("appendToCurrentBtn")?.addEventListener('click', () => appendToCurrentCustom());
    document.getElementById("newCustomSetBtn")?.addEventListener('click', () => createNewCustomSet());
    document.getElementById("startSelectedCustomBtn")?.addEventListener('click', () => startSelectedCustom());
    document.getElementById("customSetList")?.addEventListener('click', e => { const btn = e.target; if(btn.classList.contains('btn')) { const selectId = btn.dataset.select; if(selectId) selectCustomSet(selectId); const editId = btn.dataset.edit; if(editId) editCustomSet(editId); const delId = btn.dataset.del; if(delId) deleteCustomSet(delId); } });
    document.getElementById("settingRate")?.addEventListener('input', (e) => document.getElementById("rateValue").innerText = parseFloat(e.target.value).toFixed(2));
    document.getElementById("listeningOnlyMode")?.addEventListener('change', (e) => { if(dictationState.active) alert("请在下次听写生效"); });
    document.getElementById("settingVoiceGender")?.addEventListener('change', (e) => { updateVoiceInfo(); });
    document.getElementById("testVoiceBtn")?.addEventListener('click', () => testCurrentVoice());
    document.querySelectorAll('.nav-item').forEach(nav => { nav.addEventListener('click', () => { const target = nav.dataset.page; if(target === 'records') showPage('pageRecords'); else if(target) showPage(target); }); });
}

function updateVoiceInfo() {
    if (!voicesLoaded) {
        loadVoices().then(() => updateVoiceInfo());
        return;
    }
    const gender = document.getElementById("settingVoiceGender")?.value || appSettings.voiceGender;
    const zhVoice = getBestVoice('zh-CN', gender);
    const enVoice = getBestVoice('en-US', gender);
    const info = document.getElementById("currentVoiceInfo");
    if (info) {
        const zhName = zhVoice ? zhVoice.name : '未找到';
        const enName = enVoice ? enVoice.name : '未找到';
        info.innerHTML = `<strong>当前选择：</strong>${gender === 'female' ? '女声' : '男声'} | 中文：${escapeHtml(zhName)} | 英文：${escapeHtml(enName)}`;
    }
    
    populateVoiceSelector();
    updateVoiceListDisplay();
}

function populateVoiceSelector() {
    const selector = document.getElementById("voiceSelector");
    if (!selector) {
        console.warn('Voice selector not found');
        return;
    }
    
    console.log('populateVoiceSelector: cachedVoices count =', cachedVoices.length);
    
    while (selector.options.length > 1) {
        selector.remove(1);
    }
    
    if (!cachedVoices.length) {
        console.warn('No voices available');
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '⚠️ 无可用语音，请刷新页面';
        selector.appendChild(option);
        return;
    }
    
    const zhVoices = cachedVoices.filter(v => {
        const vlang = (v.lang || '').toLowerCase();
        const vname = (v.name || '').toLowerCase();
        const isZh = vlang.startsWith('zh') || 
                     vlang.includes('cn') ||
                     /chinese|siri|ting|yu-shu|mei-jia|xiaoxiao|yaoyao|yunyang|yunxi|kangkang|li-mu|声音|婷婷|语舒/i.test(vname);
        return isZh;
    });
    
    console.log('Chinese voices found:', zhVoices.length, zhVoices.map(v => `${v.name}(${v.lang})`));
    
    const voicesToShow = zhVoices.length > 0 ? zhVoices : cachedVoices;
    
    const seen = new Set();
    const uniqueVoices = voicesToShow.filter(v => {
        const key = v.name + '|' + v.lang;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    
    const maleVoices = [];
    const femaleVoices = [];
    const unknownVoices = [];
    
    uniqueVoices.forEach(v => {
        if (isMaleVoice(v)) {
            maleVoices.push(v);
        } else if (isFemaleVoice(v)) {
            femaleVoices.push(v);
        } else {
            unknownVoices.push(v);
        }
    });
    
    console.log('Male voices:', maleVoices.length, maleVoices.map(v => v.name));
    console.log('Female voices:', femaleVoices.length, femaleVoices.map(v => v.name));
    console.log('Unknown voices:', unknownVoices.length, unknownVoices.map(v => v.name));
    
    const genderSelect = document.getElementById('settingVoiceGender');
    const currentGender = genderSelect?.value || 'female';
    if (currentGender === 'male' && maleVoices.length === 0) {
        console.warn('WARNING: No male voices available, but male gender selected');
    }
    
    femaleVoices.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    maleVoices.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    unknownVoices.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    
    const allSorted = [...femaleVoices, ...maleVoices, ...unknownVoices];
    
    allSorted.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.name;
        const male = isMaleVoice(voice);
        const female = isFemaleVoice(voice);
        const g = male ? '♂' : (female ? '♀' : '?');
        option.textContent = `${g} ${voice.name} (${voice.lang || 'unknown'})`;
        selector.appendChild(option);
    });
    
    // 恢复之前保存的选择（优先使用 voiceURI 匹配）
    const savedVoiceURI = localStorage.getItem('selectedVoiceURI');
    const savedVoice = localStorage.getItem('selectedVoice');
    if (savedVoiceURI) {
        const voiceByURI = cachedVoices.find(v => v.voiceURI === savedVoiceURI);
        if (voiceByURI) {
            for (let i = 0; i < selector.options.length; i++) {
                if (selector.options[i].value === voiceByURI.name) {
                    selector.selectedIndex = i;
                    console.log('Restored voice selection by URI:', savedVoiceURI);
                    break;
                }
            }
        }
    } else if (savedVoice) {
        for (let i = 0; i < selector.options.length; i++) {
            if (selector.options[i].value === savedVoice) {
                selector.selectedIndex = i;
                break;
            }
        }
    }
    
    console.log('Voice selector populated with', allSorted.length, 'voices (female:', femaleVoices.length, ', male:', maleVoices.length, ')');
}

function updateVoiceListDisplay() {
    let listDiv = document.getElementById("voiceListDisplay");
    if (!listDiv) {
        listDiv = document.createElement('div');
        listDiv.id = 'voiceListDisplay';
        listDiv.style.cssText = 'font-size:11px;color:#888;margin-top:8px;padding:8px;background:#f8f9fa;border-radius:8px;max-height:150px;overflow-y:auto;';
        const info = document.getElementById("currentVoiceInfo");
        if (info) info.parentNode.insertBefore(listDiv, info.nextSibling);
    }
    
    const zhVoices = cachedVoices.filter(v => v.lang.startsWith('zh-CN'));
    const enVoices = cachedVoices.filter(v => v.lang.startsWith('en-US'));
    
    let html = '<div style="font-weight:bold;margin-bottom:4px;">可用语音列表：</div>';
    html += '<div style="color:#10b981;font-weight:bold;">中文语音 (' + zhVoices.length + '个)：</div>';
    zhVoices.forEach(v => {
        const isMale = isMaleVoice(v);
        const isFemale = isFemaleVoice(v);
        const tag = isMale ? '♂' : (isFemale ? '♀' : '?');
        const color = isMale ? '#3b82f6' : (isFemale ? '#ec4899' : '#6b7280');
        html += `<span style="display:inline-block;margin:2px;padding:2px 6px;background:#fff;border-radius:4px;color:${color}">${tag} ${escapeHtml(v.name)}</span>`;
    });
    html += '<div style="color:#10b981;font-weight:bold;margin-top:8px;">英文语音 (' + enVoices.length + '个)：</div>';
    enVoices.forEach(v => {
        const isMale = isMaleVoice(v);
        const isFemale = isFemaleVoice(v);
        const tag = isMale ? '♂' : (isFemale ? '♀' : '?');
        const color = isMale ? '#3b82f6' : (isFemale ? '#ec4899' : '#6b7280');
        html += `<span style="display:inline-block;margin:2px;padding:2px 6px;background:#fff;border-radius:4px;color:${color}">${tag} ${escapeHtml(v.name)}</span>`;
    });
    
    listDiv.innerHTML = html;
}

function testCurrentVoice() {
    if (!voicesLoaded) {
        loadVoices().then(() => testCurrentVoice());
        return;
    }
    
    const voiceSelector = document.getElementById("voiceSelector");
    const customVoiceName = voiceSelector?.value;
    
    let tempVoice = null;
    if (customVoiceName) {
        tempVoice = cachedVoices.find(v => v.name === customVoiceName);
    }
    
    const gender = document.getElementById("settingVoiceGender")?.value || appSettings.voiceGender;
    if (!tempVoice) {
        tempVoice = getBestVoice('zh-CN', gender);
    }
    
    if (!tempVoice) {
        alert('未找到可用的中文语音，请检查系统设置');
        return;
    }
    
    const voiceIsMale = isMaleVoice(tempVoice);
    const testText = voiceIsMale ? "你好，这是男声的语音测试。" : "你好，这是女声的语音测试。";
    
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(testText);
    utter.lang = 'zh-CN';
    utter.voice = tempVoice;
    utter.rate = getOptimalRate('zh-CN');
    utter.pitch = getOptimalPitch('zh-CN');
    utter.volume = 1.0;
    
    utter.onstart = () => {
        console.log('Speech started, using voice:', tempVoice.name);
    };
    utter.onend = () => {
        console.log('Speech ended');
    };
    utter.onerror = (e) => {
        console.error('Speech error:', e);
        alert('语音播放出错: ' + e.error);
    };
    
    try {
        speechSynthesis.speak(utter);
    } catch (err) {
        console.error('speak() failed:', err);
        alert('语音播放失败，请刷新页面重试');
    }
    
    const info = document.getElementById("currentVoiceInfo");
    if (info) {
        const genderTag = voiceIsMale ? '男声 ♂' : '女声 ♀';
        info.innerHTML = `<strong>当前选择：</strong>${genderTag} | 使用语音：<span style="color:#10b981;font-weight:bold">${escapeHtml(tempVoice.name)}</span>`;
    }
}

// ========== 初始化 ==========
if(!localStorage.getItem('studentName')) localStorage.setItem('studentName', prompt("欢迎使用听写助手，请输入你的名字", "小学霸") || "同学");
loadStorage(); 
bindEvents(); 
refreshHomeStats();
initThemeToggle();
initWordSearch();
setTimeout(() => { loadVoices().then(() => updateVoiceInfo()); }, 500);