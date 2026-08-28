// ==================== 游戏控制 ====================
function startGame(){
    userSide=sideSelect.value; aiSide=userSide==='red'?'black':'red';
    boardFlipped=(userSide==='black');
    initBoard(); gameStarted=true; gameOver=false;
    selectedPos=null; legalMovesForSelected=[]; isAiThinking=false; lastMove=null;
    chatHistory = [];
    moveHistory = [];
    currentTurn='red';
    effMoveBudget = 0; autoThinkingOff = false; // 新一局，预算记忆与思考降级标记归零
    aiMind = { mercy:0, risk:0, mood:'平静' }; // 重置AI心智
    cheatMode = false; cheatPanel.classList.add('hidden');
    log(`游戏开始！您执${userSide==='red'?'红方':'黑方'}，AI执${aiSide==='red'?'红方':'黑方'}`);
    updateStatus(); drawBoard();
    if(aiSide==='red') setTimeout(()=>aiTurn(),500);
}
function restartGame(){
    gameStarted=false; gameOver=false; selectedPos=null; legalMovesForSelected=[]; isAiThinking=false; lastMove=null;
    initBoard(); boardFlipped=false;
    chatHistory = [];
    moveHistory = [];
    effMoveBudget = 0; autoThinkingOff = false; // 新一局，预算记忆与思考降级标记归零
    aiMind = { mercy:0, risk:0, mood:'平静' }; // 重置AI心智
    cheatMode = false; cheatPanel.classList.add('hidden');
    statusText.textContent='请选择执子方并开始游戏'; turnBadge.textContent='等待开始'; turnBadge.className='badge badge-gray';
    log('游戏已重置'); drawBoard();
    chatMessages.innerHTML = '<div class="chat-msg system">💬 聊天室已开启，配置API后可与AI对话（AI知晓当前棋局与执子方）</div>';
}
btnStart.addEventListener('click', startGame);
btnRestart.addEventListener('click', restartGame);
btnToggleApi.addEventListener('click', ()=>apiPanel.classList.toggle('hidden'));
btnCloseApi.addEventListener('click', ()=>apiPanel.classList.add('hidden'));
btnSaveApi.addEventListener('click', ()=>{
    apiConfig.endpoint=apiEndpoint.value.trim();
    apiConfig.key=apiKey.value.trim();
    apiConfig.model=apiModel.value.trim();
    apiConfig.maxTokens=parseInt(apiMaxTokens.value)||1024;
    apiConfig.moveMaxTokens=parseInt(apiMoveMaxTokens.value)||4096;
    apiConfig.temperature=parseFloat(apiTemperature.value); if(isNaN(apiConfig.temperature)) apiConfig.temperature=0.3;
    apiConfig.thinkingMode=apiThinkingMode.value || 'off';
    apiConfig.forceMove = apiForceMove.checked;
    apiConfig.numberMode = apiNumberMode.checked;
    apiConfig.engineGuard = apiEngineGuard.checked;
    apiConfig.chatSystemPrompt = chatSystemPromptInput.value.trim();
    apiCompat = null; apiRejected = null; effMoveBudget = 0; autoThinkingOff = false; thoughtOffWarningLogged = false; // 配置变了，重置缓存
    try{ localStorage.setItem('xiangqi_api_config_v11', JSON.stringify(apiConfig)); log('API配置已保存'); }catch(e){ log('无法保存API配置'); }
    apiPanel.classList.add('hidden');
});
window.addEventListener('resize', ()=>{ resizeCanvas(); drawBoard(); });
document.addEventListener('keydown', (e)=>{
    if(e.key==='Escape'){ selectedPos=null; legalMovesForSelected=[]; drawBoard(); }
    if(e.key==='Enter' && !gameStarted) startGame();
    if((e.key==='r'||e.key==='R')&&!e.ctrlKey&&!e.metaKey) restartGame();
});

// ==================== 测试API连接 ====================
btnTestApi.addEventListener('click', async () => {
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

