// ==================== 全局状态模块 ====================
// 集中持有：DOM 引用（dom）、可变游戏状态（state）、日志与配置函数。
// 其余模块通过显式 import 引用，不再依赖全局作用域。
import { MAX_MOVE_TOKENS } from './constants.js';

// ==================== DOM ====================
const boardCanvas = document.getElementById('boardCanvas');
export const dom = {
    canvas: boardCanvas,
    ctx: boardCanvas.getContext('2d'),
    statusText: document.getElementById('statusText'),
    turnBadge: document.getElementById('turnBadge'),
    logArea: document.getElementById('logArea'),
    sideSelect: document.getElementById('sideSelect'),
    btnStart: document.getElementById('btnStart'),
    btnRestart: document.getElementById('btnRestart'),
    btnToggleApi: document.getElementById('btnToggleApi'),
    apiPanel: document.getElementById('apiPanel'),
    apiEndpoint: document.getElementById('apiEndpoint'),
    apiKey: document.getElementById('apiKey'),
    apiModel: document.getElementById('apiModel'),
    apiMaxTokens: document.getElementById('apiMaxTokens'),
    apiMoveMaxTokens: document.getElementById('apiMoveMaxTokens'),
    apiTemperature: document.getElementById('apiTemperature'),
    apiThinkingMode: document.getElementById('apiThinkingMode'),
    apiForceMove: document.getElementById('apiForceMove'),
    apiNumberMode: document.getElementById('apiNumberMode'),
    apiEngineGuard: document.getElementById('apiEngineGuard'),
    btnSaveApi: document.getElementById('btnSaveApi'),
    btnCloseApi: document.getElementById('btnCloseApi'),
    chatMessages: document.getElementById('chatMessages'),
    chatInput: document.getElementById('chatInput'),
    chatSendBtn: document.getElementById('chatSendBtn'),
    chatSystemPromptInput: document.getElementById('chatSystemPrompt'),
    btnTestApi: document.getElementById('btnTestApi'),
    btnCheat: document.getElementById('btnCheat'),
    btnCheatDone: document.getElementById('btnCheatDone'),
    cheatPanel: document.getElementById('cheatPanel'),
    cheatPiece: document.getElementById('cheatPiece')
};

// ==================== 游戏状态 ====================
export const state = {
    board: [],
    currentTurn: 'red',
    userSide: 'red',
    aiSide: 'black',
    gameStarted: false,
    gameOver: false,
    selectedPos: null,
    legalMovesForSelected: [],
    isAiThinking: false,
    lastMove: null,
    boardFlipped: false,
    cheatMode: false,
    chatHistory: [],
    moveHistory: [],
    // AI心智状态（聊天室可影响走棋AI；每局重置）
    aiMind: { mercy: 0, risk: 0, mood: '平静' }, // mercy/risk 取值 0~3

    // API配置
    apiConfig: {
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
    },

    // API 兼容性缓存：记住该 endpoint 实际接受哪些扩展参数
    apiCompat: null,              // {thinking, thinkingBudget, reasoningEffort, json, temperature, maxTokens}
    apiRejected: null,            // Set：已知被该接口 400 拒绝的参数名，后续请求直接跳过
    effMoveBudget: 0,             // 本局已验证有效的走棋 token 预算（每局重置）
    thoughtOffWarningLogged: false, // "关闭思考被接口忽略"提示只打一次
    autoThinkingOff: false,       // 本局思考模式已被判"过思考"，后续自动改用关闭思考

    logLines: []
};

// 记录一次成功预算：取"本次用量的 1.2 倍"作为下一步起步，预防需求越来越高
export function commitBudget(used) {
    state.effMoveBudget = Math.min(MAX_MOVE_TOKENS, Math.max(state.effMoveBudget || 0, Math.ceil(used * 1.2)));
}

// 日志系统
export function log(msg) {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit' });
    const line = `[${time}] ${msg}`;
    console.log(`[象棋] ${msg}`);
    state.logLines.push(line);
    if (state.logLines.length > 80) state.logLines.shift();
    dom.logArea.textContent = state.logLines.join('\n');
    dom.logArea.scrollTop = dom.logArea.scrollHeight;
}

export function shortStr(s, n) {
    if (s === null || s === undefined) return '(空)';
    const t = String(s).replace(/\s+/g, ' ').trim();
    return t.length > n ? t.substring(0, n) + '…' : t;
}

// 加载配置（兼容旧版 v10 配置）；由 main.js 的 init() 调用
export function loadConfig() {
    try {
        let saved = localStorage.getItem('xiangqi_api_config_v11');
        let oldVer = false;
        if (!saved) { saved = localStorage.getItem('xiangqi_api_config_v10'); oldVer = true; }
        if (saved) {
            const p = JSON.parse(saved);
            Object.assign(state.apiConfig, p);
            if (oldVer) {
                // 旧版 enableThinking=true 映射为 high 思考
                state.apiConfig.thinkingMode = p.enableThinking ? 'high' : 'off';
                if (!p.moveMaxTokens || p.moveMaxTokens < 1024) state.apiConfig.moveMaxTokens = 4096;
                if (!p.maxTokens || p.maxTokens < 256) state.apiConfig.maxTokens = 1024;
            }
            dom.apiEndpoint.value = state.apiConfig.endpoint || '';
            dom.apiKey.value = state.apiConfig.key || '';
            dom.apiModel.value = state.apiConfig.model || '';
            dom.apiMaxTokens.value = state.apiConfig.maxTokens || 1024;
            dom.apiMoveMaxTokens.value = state.apiConfig.moveMaxTokens || 4096;
            dom.apiTemperature.value = state.apiConfig.temperature !== undefined ? state.apiConfig.temperature : 0.3;
            dom.apiThinkingMode.value = state.apiConfig.thinkingMode || 'off';
            dom.apiForceMove.checked = !!state.apiConfig.forceMove;
            dom.apiNumberMode.checked = !!state.apiConfig.numberMode;
            dom.apiEngineGuard.checked = state.apiConfig.engineGuard !== false;
            dom.chatSystemPromptInput.value = state.apiConfig.chatSystemPrompt || '';
        }
    } catch(e) {}
}
