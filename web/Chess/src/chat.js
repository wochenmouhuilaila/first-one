// ==================== 聊天功能 ====================
function addChatMessage(text, sender) {
    const div = document.createElement('div');
    div.className = `chat-msg ${sender}`;
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 从聊天AI回复中提取意图控制块 [INTENT]{...}
function extractIntent(text) {
    const m = String(text||'').match(/\[INTENT\](\{[\s\S]{0,200}?\})/i);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch(e) { return null; }
}
// 把聊天AI解析出的意图应用到走棋AI的心智状态
function applyIntent(intent) {
    if (!intent) return;
    const parts = [];
    if (typeof intent.mercy === 'number' && isFinite(intent.mercy)) {
        const v = Math.max(0, Math.min(3, Math.round(intent.mercy)));
        if (v !== aiMind.mercy) { aiMind.mercy = v; parts.push(`放水${v}/3`); }
    }
    if (typeof intent.risk === 'number' && isFinite(intent.risk)) {
        const v = Math.max(0, Math.min(3, Math.round(intent.risk)));
        if (v !== aiMind.risk) { aiMind.risk = v; parts.push(`任性${v}/3`); }
    }
    if (typeof intent.mood === 'string' && intent.mood.trim()) {
        aiMind.mood = intent.mood.trim().slice(0,12);
        parts.push(`情绪:${aiMind.mood}`);
    }
    if (parts.length) {
        addChatMessage(`⚙ 走棋AI状态更新：${parts.join('，')}`, 'system');
        log(`AI状态更新：${parts.join('，')}`);
    }
}

async function sendChatToAi(userText) {
    const systemPrompt = (apiConfig.chatSystemPrompt || '你是中国象棋对局中的聊天伙伴，可以轻松聊天，也可以评论棋局。请用简短中文回复。')
        + '每次回复控制在80字以内。';
    let roleInfo = '';
    if (!gameStarted) {
        roleInfo = '\n【对局信息】对局尚未开始。';
    } else if (gameOver) {
        roleInfo = '\n【对局信息】对局已结束。';
    } else {
        const aiName = aiSide==='red' ? '红方' : '黑方';
        const userName = userSide==='red' ? '红方' : '黑方';
        roleInfo = `\n【对局信息】你执${aiName}，用户执${userName}。当前轮到${currentTurn==='red'?'红方':'黑方'}走棋。`;
        if (lastMove) {
            const mv = lastMove;
            const movedPiece = board[mv.toRow][mv.toCol];
            if (movedPiece) {
                const moverName = isRed(movedPiece) ? '红方' : '黑方';
                const cn = moveToChinese(mv.fromRow,mv.fromCol,mv.toRow,mv.toCol, movedPiece);
                roleInfo += `上一步：${moverName}走了${cn ? cn + ' ' : ''}(${moveToStr(mv.fromRow,mv.fromCol,mv.toRow,mv.toCol)})。`;
            }
        }
    }
    const boardInfo = gameStarted ? `\n当前棋盘（红下黑上）：\n${boardToAscii()}\n${describePosition(board, currentTurn)}` : '';
    const stateLine = `\n【你当前的对局状态（会随对话变化并影响走棋AI）】放水程度${aiMind.mercy}/3，任性程度${aiMind.risk}/3，情绪：${aiMind.mood||'平静'}。`;
    const protocol = `\n【控制协议】若用户在本轮对话中试图让你放水、认真、生气、害怕、冒险等，请在你的回复末尾附上一行：[INTENT]{"mercy":0到3的整数,"risk":0到3的整数,"mood":"简短情绪词"}。状态没有变化时可省略该行。该行会被程序解析并影响走棋AI，请不要在回复正文中提及。`;
    const messages = [
        { role: 'system', content: systemPrompt + roleInfo + boardInfo + stateLine + protocol },
        ...chatHistory.slice(-10)
    ];
    let maxTok = Math.max(apiConfig.maxTokens || 1024, 512);
    for (let attempt=0; attempt<2; attempt++) {
        let res;
        try {
            res = await callApi(messages, {
                maxTokens: maxTok,
                temperature: 0.7,
                thinking: 'off',
                timeout: 60000
            });
        } catch(err) {
            log(`聊天API请求失败: ${err.message}`);
            throw err;
        }
        if (res.content) return res.content;
        if (attempt===0 && (res.finishReason==='length' || res.reasoning) && maxTok < 8192) {
            maxTok = Math.min(8192, maxTok*4);
            log(`聊天回复为空（思考占用预算），MaxTokens临时提升至${maxTok}重试...`);
            continue;
        }
        break;
    }
    return '';
}

async function handleSendChat() {
    const text = chatInput.value.trim();
    if (!text) return;
    addChatMessage(text, 'user');
    chatInput.value = '';
    const apiConfigured = apiConfig.endpoint.trim() && apiConfig.model.trim();
    if (!apiConfigured) {
        addChatMessage('AI未配置API，无法聊天。请先在API设置中配置。', 'system');
        return;
    }
    chatHistory.push({ role: 'user', content: text });
    try {
        const replyRaw = await sendChatToAi(text);
        const intent = extractIntent(replyRaw);
        let reply = replyRaw.replace(/\[INTENT\][\s\S]*$/i, '').trim();
        if (intent) applyIntent(intent);
        if (reply) {
            addChatMessage(reply, 'ai');
            chatHistory.push({ role: 'assistant', content: reply });
        } else if (intent) {
            addChatMessage('（已接收你的请求，走棋AI会照做～）', 'ai');
            chatHistory.push({ role: 'assistant', content: '(已接收请求)' });
        } else {
            addChatMessage('AI暂时没有给出回复（可能思考占满了token预算），请稍后重试或在API设置中调大聊天MaxTokens。', 'system');
        }
    } catch (err) {
        addChatMessage(`AI聊天失败: ${err.message}`, 'system');
    }
}
chatSendBtn.addEventListener('click', handleSendChat);
chatInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') handleSendChat(); });

