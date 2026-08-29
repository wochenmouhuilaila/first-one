import { dom, state, log, shortStr } from './state.js';
import { initBoard } from './board.js';
import { callApi } from './api-client.js';
import { aiTurn, updateStatus } from './game-flow.js';
import { drawBoard, resizeCanvas } from './render.js';


// ==================== 游戏控制 ====================
export function startGame(){
    state.userSide=dom.sideSelect.value; state.aiSide=state.userSide==='red'?'black':'red';
    state.boardFlipped=(state.userSide==='black');
    initBoard(); state.gameStarted=true; state.gameOver=false;
    state.selectedPos=null; state.legalMovesForSelected=[]; state.isAiThinking=false; state.lastMove=null;
    state.chatHistory = [];
    state.moveHistory = [];
    state.currentTurn='red';
    state.effMoveBudget = 0; state.autoThinkingOff = false; // 新一局，预算记忆与思考降级标记归零
    state.aiMind = { mercy:0, risk:0, mood:'平静' }; // 重置AI心智
    state.cheatMode = false; dom.cheatPanel.classList.add('hidden');
    log(`游戏开始！您执${state.userSide==='red'?'红方':'黑方'}，AI执${state.aiSide==='red'?'红方':'黑方'}`);
    updateStatus(); drawBoard();
    if(state.aiSide==='red') setTimeout(()=>aiTurn(),500);
}
export function restartGame(){
    state.gameStarted=false; state.gameOver=false; state.selectedPos=null; state.legalMovesForSelected=[]; state.isAiThinking=false; state.lastMove=null;
    initBoard(); state.boardFlipped=false;
    state.chatHistory = [];
    state.moveHistory = [];
    state.effMoveBudget = 0; state.autoThinkingOff = false; // 新一局，预算记忆与思考降级标记归零
    state.aiMind = { mercy:0, risk:0, mood:'平静' }; // 重置AI心智
    state.cheatMode = false; dom.cheatPanel.classList.add('hidden');
    dom.statusText.textContent='请选择执子方并开始游戏'; dom.turnBadge.textContent='等待开始'; dom.turnBadge.className='badge badge-gray';
    log('游戏已重置'); drawBoard();
    dom.chatMessages.innerHTML = '<div class="chat-msg system">💬 聊天室已开启，配置API后可与AI对话（AI知晓当前棋局与执子方）</div>';
}
dom.btnStart.addEventListener('click', startGame);
dom.btnRestart.addEventListener('click', restartGame);
dom.btnToggleApi.addEventListener('click', ()=>dom.apiPanel.classList.toggle('hidden'));
dom.btnCloseApi.addEventListener('click', ()=>dom.apiPanel.classList.add('hidden'));
dom.btnSaveApi.addEventListener('click', ()=>{
    state.apiConfig.endpoint=dom.apiEndpoint.value.trim();
    state.apiConfig.key=dom.apiKey.value.trim();
    state.apiConfig.model=dom.apiModel.value.trim();
    state.apiConfig.maxTokens=parseInt(dom.apiMaxTokens.value)||1024;
    state.apiConfig.moveMaxTokens=parseInt(dom.apiMoveMaxTokens.value)||4096;
    state.apiConfig.temperature=parseFloat(dom.apiTemperature.value); if(isNaN(state.apiConfig.temperature)) state.apiConfig.temperature=0.3;
    state.apiConfig.thinkingMode=dom.apiThinkingMode.value || 'off';
    state.apiConfig.forceMove = dom.apiForceMove.checked;
    state.apiConfig.numberMode = dom.apiNumberMode.checked;
    state.apiConfig.engineGuard = dom.apiEngineGuard.checked;
    state.apiConfig.chatSystemPrompt = dom.chatSystemPromptInput.value.trim();
    state.apiCompat = null; state.apiRejected = null; state.effMoveBudget = 0; state.autoThinkingOff = false; state.thoughtOffWarningLogged = false; // 配置变了，重置缓存
    try{ localStorage.setItem('xiangqi_api_config_v11', JSON.stringify(state.apiConfig)); log('API配置已保存'); }catch(e){ log('无法保存API配置'); }
    dom.apiPanel.classList.add('hidden');
});
window.addEventListener('resize', ()=>{ resizeCanvas(); drawBoard(); });
document.addEventListener('keydown', (e)=>{
    if(e.key==='Escape'){ state.selectedPos=null; state.legalMovesForSelected=[]; drawBoard(); }
    if(e.key==='Enter' && !state.gameStarted) startGame();
    if((e.key==='r'||e.key==='R')&&!e.ctrlKey&&!e.metaKey) restartGame();
});

// ==================== 测试API连接 ====================
dom.btnTestApi.addEventListener('click', async () => {
    log('正在测试API连接...');
    try {
        const res = await callApi([
            { role: 'system', content: '你是一个测试助手。' },
            { role: 'user', content: '请只回复两个字：OK' }
        ], { maxTokens: 50, temperature: 0, thinking: 'off', timeout: 30000 });
        const reply = res.content || (res.reasoning ? '(content为空，仅思考内容)' : '(空)');
        log(`测试成功！API回复: ${shortStr(reply, 100)}` +
            (res.usage ? ` [tokens:${res.usage.total_tokens}]` : ''));
    } catch (err) {
        log(`测试失败: ${err.message}`);
    }
});

