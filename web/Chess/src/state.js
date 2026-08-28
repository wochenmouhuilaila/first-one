// ==================== DOM ====================
const canvas = document.getElementById('boardCanvas');
const ctx = canvas.getContext('2d');
const statusText = document.getElementById('statusText');
const turnBadge = document.getElementById('turnBadge');
const logArea = document.getElementById('logArea');
const sideSelect = document.getElementById('sideSelect');
const btnStart = document.getElementById('btnStart');
const btnRestart = document.getElementById('btnRestart');
const btnToggleApi = document.getElementById('btnToggleApi');
const apiPanel = document.getElementById('apiPanel');
const apiEndpoint = document.getElementById('apiEndpoint');
const apiKey = document.getElementById('apiKey');
const apiModel = document.getElementById('apiModel');
const apiMaxTokens = document.getElementById('apiMaxTokens');
const apiMoveMaxTokens = document.getElementById('apiMoveMaxTokens');
const apiTemperature = document.getElementById('apiTemperature');
const apiThinkingMode = document.getElementById('apiThinkingMode');
const apiForceMove = document.getElementById('apiForceMove');
const apiNumberMode = document.getElementById('apiNumberMode');
const apiEngineGuard = document.getElementById('apiEngineGuard');
const btnSaveApi = document.getElementById('btnSaveApi');
const btnCloseApi = document.getElementById('btnCloseApi');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSendBtn');
const chatSystemPromptInput = document.getElementById('chatSystemPrompt');
const btnTestApi = document.getElementById('btnTestApi');
const btnCheat = document.getElementById('btnCheat');
const btnCheatDone = document.getElementById('btnCheatDone');
const cheatPanel = document.getElementById('cheatPanel');
const cheatPiece = document.getElementById('cheatPiece');

// ==================== 游戏状态 ====================
let board = [];
let currentTurn = 'red';
let userSide = 'red';
let aiSide = 'black';
let gameStarted = false;
let gameOver = false;
let selectedPos = null;
let legalMovesForSelected = [];
let isAiThinking = false;
let lastMove = null;
let boardFlipped = false;
let cheatMode = false;
let chatHistory = [];
let moveHistory = [];
// AI心智状态（聊天室可影响走棋AI；每局重置）
let aiMind = { mercy: 0, risk: 0, mood: '平静' }; // mercy/risk 取值 0~3

// API配置
let apiConfig = {
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    key: '',
    model: 'deepseek-v4-flash',
    maxTokens: 1024,         // 聊天
    moveMaxTokens: 4096,     // 走棋
    temperature: 0.3,
    thinkingMode: 'off',     // 'off' | 'low' | 'high'
    forceMove: false,
    numberMode: false,
    engineGuard: true,
    chatSystemPrompt: '你是中国象棋对局中的聊天伙伴，可以轻松聊天，也可以评论棋局。请用简短中文回复。'
};

// API 兼容性缓存：记住该 endpoint 实际接受哪些扩展参数
let apiCompat = null;              // {thinking, thinkingBudget, reasoningEffort, json, temperature, maxTokens}
let apiRejected = null;            // Set：已知被该接口 400 拒绝的参数名，后续请求直接跳过
let effMoveBudget = 0;             // 本局已验证有效的走棋 token 预算（每局重置）
let thoughtOffWarningLogged = false; // "关闭思考被接口忽略"提示只打一次
let autoThinkingOff = false;       // 本局思考模式已被判"过思考"，后续自动改用关闭思考

// 记录一次成功预算：取"本次用量的 1.2 倍"作为下一步起步，预防需求越来越高
function commitBudget(used) {
    effMoveBudget = Math.min(MAX_MOVE_TOKENS, Math.max(effMoveBudget || 0, Math.ceil(used * 1.2)));
}

// 日志系统
let logLines = [];
function log(msg) {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit' });
    const line = `[${time}] ${msg}`;
    console.log(`[象棋] ${msg}`);
    logLines.push(line);
    if (logLines.length > 80) logLines.shift();
    logArea.textContent = logLines.join('\n');
    logArea.scrollTop = logArea.scrollHeight;
}

function shortStr(s, n) {
    if (s === null || s === undefined) return '(空)';
    const t = String(s).replace(/\s+/g, ' ').trim();
    return t.length > n ? t.substring(0, n) + '…' : t;
}

// 加载配置（兼容旧版 v10 配置）
try {
    let saved = localStorage.getItem('xiangqi_api_config_v11');
    let oldVer = false;
    if (!saved) { saved = localStorage.getItem('xiangqi_api_config_v10'); oldVer = true; }
    if (saved) {
        const p = JSON.parse(saved);
        Object.assign(apiConfig, p);
        if (oldVer) {
            // 旧版 enableThinking=true 映射为 high 思考
            apiConfig.thinkingMode = p.enableThinking ? 'high' : 'off';
            if (!p.moveMaxTokens || p.moveMaxTokens < 1024) apiConfig.moveMaxTokens = 4096;
            if (!p.maxTokens || p.maxTokens < 256) apiConfig.maxTokens = 1024;
        }
        apiEndpoint.value = apiConfig.endpoint || '';
        apiKey.value = apiConfig.key || '';
        apiModel.value = apiConfig.model || '';
        apiMaxTokens.value = apiConfig.maxTokens || 1024;
        apiMoveMaxTokens.value = apiConfig.moveMaxTokens || 4096;
        apiTemperature.value = apiConfig.temperature !== undefined ? apiConfig.temperature : 0.3;
        apiThinkingMode.value = apiConfig.thinkingMode || 'off';
        apiForceMove.checked = !!apiConfig.forceMove;
        apiNumberMode.checked = !!apiConfig.numberMode;
        apiEngineGuard.checked = apiConfig.engineGuard !== false;
        chatSystemPromptInput.value = apiConfig.chatSystemPrompt || '';
    }
} catch(e) {}

