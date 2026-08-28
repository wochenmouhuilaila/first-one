import { dom, state, log } from './state.js';
import { getAllLegalMoves, isCheckmate, isInCheck, isStalemate, isValidMove } from './rules.js';
import { executeMove } from './moves.js';
import { engineGuard, softPickMove } from './ai-engine.js';
import { aiMoveWithApi } from './ai-move.js';
import { drawBoard } from './render.js';


// ==================== AI走棋流程 ====================
export async function aiTurn() {
    if (state.gameOver || !state.gameStarted) return;
    if (state.isAiThinking) return;
    state.isAiThinking = true;
    updateStatus();
    const sideName = state.aiSide==='red'?'红方':'黑方';
    const thinkLabel = state.autoThinkingOff ? 'off(自动降级)' : (state.apiConfig.thinkingMode==='off' ? '关闭' : state.apiConfig.thinkingMode);
    log(`AI (${sideName}) 思考中...（思考模式：${thinkLabel}${state.apiConfig.engineGuard?'，引擎护航开启':''}${state.aiMind.mercy>0?`，放水${state.aiMind.mercy}/3`:''}${state.aiMind.risk>0?`，任性${state.aiMind.risk}/3`:''}）`);

    let llmMove = null, llmSpirit = 'serious';
    const apiConfigured = state.apiConfig.endpoint.trim() && state.apiConfig.model.trim();

    if (apiConfigured) {
        try {
            const llmRes = await aiMoveWithApi();
            if (llmRes && llmRes.move && isValidMove(state.board, llmRes.move.fromRow, llmRes.move.fromCol, llmRes.move.toRow, llmRes.move.toCol, state.aiSide)) {
                llmMove = llmRes.move;
                llmSpirit = llmRes.spirit || 'serious';
            }
        } catch(err) {
            log(`API走棋错误: ${err.message}`);
            if (state.apiConfig.forceMove) {
                log('强制API走棋，尝试整体重试一次...');
                try {
                    const llmRes = await aiMoveWithApi();
                    if (llmRes && llmRes.move && isValidMove(state.board, llmRes.move.fromRow, llmRes.move.fromCol, llmRes.move.toRow, llmRes.move.toCol, state.aiSide)) {
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
        if (state.apiConfig.engineGuard) {
            move = engineGuard(llmMove, state.aiSide, llmSpirit);
        } else {
            move = llmMove;
        }
    } else {
        log(apiConfigured ? 'API未给出有效走法，本步由引擎接管。' : '本地引擎走棋...');
        move = softPickMove(state.aiSide);
    }
    if (!move) {
        if (getAllLegalMoves(state.board, state.aiSide).length === 0) {
            state.gameOver = true;
            const winner = state.aiSide==='red' ? '黑方' : '红方';
            log(isInCheck(state.board, state.aiSide) ? `将死！${winner}获胜！` : `困毙！${winner}获胜！`);
        } else {
            log('AI无合法走法');
        }
        state.isAiThinking = false;
        updateStatus();
        return;
    }

    executeMove(move.fromRow, move.fromCol, move.toRow, move.toCol);
    state.selectedPos = null;
    state.legalMovesForSelected = [];
    state.isAiThinking = false;
    state.currentTurn = state.userSide;
    state.lastMove = { fromRow: move.fromRow, fromCol: move.fromCol, toRow: move.toRow, toCol: move.toCol };
    afterMove();
}

export function afterMove() {
    checkGameState();
    drawBoard();
    updateStatus();
    if (state.gameStarted && !state.gameOver && state.currentTurn === state.aiSide) {
        setTimeout(() => aiTurn(), 300);
    }
}
export function checkGameState() {
    if (isCheckmate(state.board, state.currentTurn)) {
        state.gameOver = true;
        const winner = state.currentTurn === 'red' ? '黑方' : '红方';
        log(`将死！${winner}获胜！`);
        updateStatus();
        return;
    }
    if (isStalemate(state.board, state.currentTurn)) {
        state.gameOver = true;
        const winner = state.currentTurn === 'red' ? '黑方' : '红方';
        log(`困毙！${winner}获胜！`);
        updateStatus();
        return;
    }
    if (isInCheck(state.board, state.currentTurn)) {
        log(`${state.currentTurn==='red'?'红方':'黑方'}被将军！`);
    }
}
export function updateStatus() {
    if (!state.gameStarted) {
        dom.statusText.textContent = '请选择执子方并开始游戏';
        dom.turnBadge.textContent = '等待开始';
        dom.turnBadge.className = 'badge badge-gray';
        return;
    }
    if (state.gameOver) {
        dom.statusText.textContent = '游戏结束';
        dom.turnBadge.textContent = '结束';
        dom.turnBadge.className = 'badge badge-gray';
        return;
    }
    if (state.isAiThinking) {
        dom.statusText.textContent = `AI (${state.aiSide==='red'?'红方':'黑方'}) 思考中...`;
        dom.turnBadge.textContent = 'AI思考';
        dom.turnBadge.className = 'badge badge-gray';
        return;
    }
    const turnName = state.currentTurn === 'red' ? '红方' : '黑方';
    const isUserTurn = state.currentTurn === state.userSide;
    dom.statusText.textContent = isUserTurn ? `轮到您 (${turnName}) 走棋` : `轮到AI (${turnName}) 走棋`;
    dom.turnBadge.textContent = turnName;
    dom.turnBadge.className = state.currentTurn === 'red' ? 'badge badge-red' : 'badge badge-black';
}

