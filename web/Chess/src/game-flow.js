// ==================== AI走棋流程 ====================
async function aiTurn() {
    if (gameOver || !gameStarted) return;
    if (isAiThinking) return;
    isAiThinking = true;
    updateStatus();
    const sideName = aiSide==='red'?'红方':'黑方';
    const thinkLabel = autoThinkingOff ? 'off(自动降级)' : (apiConfig.thinkingMode==='off' ? '关闭' : apiConfig.thinkingMode);
    log(`AI (${sideName}) 思考中...（思考模式：${thinkLabel}${apiConfig.engineGuard?'，引擎护航开启':''}${aiMind.mercy>0?`，放水${aiMind.mercy}/3`:''}${aiMind.risk>0?`，任性${aiMind.risk}/3`:''}）`);

    let llmMove = null, llmSpirit = 'serious';
    const apiConfigured = apiConfig.endpoint.trim() && apiConfig.model.trim();

    if (apiConfigured) {
        try {
            const llmRes = await aiMoveWithApi();
            if (llmRes && llmRes.move && isValidMove(board, llmRes.move.fromRow, llmRes.move.fromCol, llmRes.move.toRow, llmRes.move.toCol, aiSide)) {
                llmMove = llmRes.move;
                llmSpirit = llmRes.spirit || 'serious';
            }
        } catch(err) {
            log(`API走棋错误: ${err.message}`);
            if (apiConfig.forceMove) {
                log('强制API走棋，尝试整体重试一次...');
                try {
                    const llmRes = await aiMoveWithApi();
                    if (llmRes && llmRes.move && isValidMove(board, llmRes.move.fromRow, llmRes.move.fromCol, llmRes.move.toRow, llmRes.move.toCol, aiSide)) {
                        llmMove = llmRes.move;
                        llmSpirit = llmRes.spirit || 'serious';
                    } else log('重试失败');
                } catch(retryErr) {
                    log(`重试也失败: ${retryErr.message}`);
                }
            }
        }
    }

    // 走法决定：AI自由选点 + 引擎护航（AI可依状态行使"任性权"）
    let move = null;
    if (llmMove) {
        if (apiConfig.engineGuard) {
            move = engineGuard(llmMove, aiSide, llmSpirit);
        } else {
            move = llmMove;
        }
    } else {
        log(apiConfigured ? 'API未给出有效走法，本步由引擎接管。' : '本地引擎走棋...');
        move = softPickMove(aiSide);
    }
    if (!move) {
        if (getAllLegalMoves(board, aiSide).length === 0) {
            gameOver = true;
            const winner = aiSide==='red' ? '黑方' : '红方';
            log(isInCheck(board, aiSide) ? `将死！${winner}获胜！` : `困毙！${winner}获胜！`);
        } else {
            log('AI无合法走法');
        }
        isAiThinking = false;
        updateStatus();
        return;
    }

    executeMove(move.fromRow, move.fromCol, move.toRow, move.toCol);
    selectedPos = null;
    legalMovesForSelected = [];
    isAiThinking = false;
    currentTurn = userSide;
    lastMove = { fromRow: move.fromRow, fromCol: move.fromCol, toRow: move.toRow, toCol: move.toCol };
    afterMove();
}

function afterMove() {
    checkGameState();
    drawBoard();
    updateStatus();
    if (gameStarted && !gameOver && currentTurn === aiSide) {
        setTimeout(() => aiTurn(), 300);
    }
}
function checkGameState() {
    if (isCheckmate(board, currentTurn)) {
        gameOver = true;
        const winner = currentTurn === 'red' ? '黑方' : '红方';
        log(`将死！${winner}获胜！`);
        updateStatus();
        return;
    }
    if (isStalemate(board, currentTurn)) {
        gameOver = true;
        const winner = currentTurn === 'red' ? '黑方' : '红方';
        log(`困毙！${winner}获胜！`);
        updateStatus();
        return;
    }
    if (isInCheck(board, currentTurn)) {
        log(`${currentTurn==='red'?'红方':'黑方'}被将军！`);
    }
}
function updateStatus() {
    if (!gameStarted) {
        statusText.textContent = '请选择执子方并开始游戏';
        turnBadge.textContent = '等待开始';
        turnBadge.className = 'badge badge-gray';
        return;
    }
    if (gameOver) {
        statusText.textContent = '游戏结束';
        turnBadge.textContent = '结束';
        turnBadge.className = 'badge badge-gray';
        return;
    }
    if (isAiThinking) {
        statusText.textContent = `AI (${aiSide==='red'?'红方':'黑方'}) 思考中...`;
        turnBadge.textContent = 'AI思考';
        turnBadge.className = 'badge badge-gray';
        return;
    }
    const turnName = currentTurn === 'red' ? '红方' : '黑方';
    const isUserTurn = currentTurn === userSide;
    statusText.textContent = isUserTurn ? `轮到您 (${turnName}) 走棋` : `轮到AI (${turnName}) 走棋`;
    turnBadge.textContent = turnName;
    turnBadge.className = currentTurn === 'red' ? 'badge badge-red' : 'badge badge-black';
}

