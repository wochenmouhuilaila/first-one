import { EMPTY, PIECE_NAMES, isRed } from './constants.js';
import { dom, state, log } from './state.js';
import { moveToStr, posToStr } from './board.js';
import { getAllLegalMoves, getPieceLegalMoves } from './rules.js';
import { executeMove } from './moves.js';
import { afterMove, updateStatus } from './game-flow.js';
import { drawBoard, getBoardPos } from './render.js';


// ==================== 用户交互 ====================
function handleCanvasClick(e){
    if(!state.gameStarted||state.gameOver||state.isAiThinking) return;
    if(state.currentTurn!==state.userSide) return;
    const rect=dom.canvas.getBoundingClientRect();
    const scaleX=dom.canvas.width/rect.width, scaleY=dom.canvas.height/rect.height;
    const sx=(e.clientX-rect.left)*scaleX, sy=(e.clientY-rect.top)*scaleY;
    const pos=getBoardPos(sx,sy); if(!pos) return;
    const {row,col}=pos;
    if (state.cheatMode) { placeCheatPiece(row,col); return; }
    const piece=state.board[row][col];
    if(state.selectedPos){
        const isTarget=state.legalMovesForSelected.some(m=>m.toRow===row&&m.toCol===col);
        if(isTarget){
            executeMove(state.selectedPos.row,state.selectedPos.col,row,col);
            state.selectedPos=null; state.legalMovesForSelected=[];
            state.currentTurn=state.aiSide;
            log(`您走棋: ${moveToStr(state.lastMove.fromRow,state.lastMove.fromCol,state.lastMove.toRow,state.lastMove.toCol)}`);
            afterMove(); return;
        }
        if(piece!==EMPTY){
            const pred=isRed(piece);
            if((state.userSide==='red'&&pred)||(state.userSide==='black'&&!pred)){
                state.selectedPos={row,col}; state.legalMovesForSelected=getPieceLegalMoves(state.board,row,col,piece);
                drawBoard(); return;
            }
        }
        state.selectedPos=null; state.legalMovesForSelected=[]; drawBoard(); return;
    }
    if(piece!==EMPTY){
        const pred=isRed(piece);
        if((state.userSide==='red'&&pred)||(state.userSide==='black'&&!pred)){
            state.selectedPos={row,col}; state.legalMovesForSelected=getPieceLegalMoves(state.board,row,col,piece);
            drawBoard();
        }
    }
}
dom.canvas.addEventListener('click', handleCanvasClick);
dom.canvas.addEventListener('touchstart', function(e){
    e.preventDefault(); const touch=e.touches[0];
    const fakeEvent={clientX:touch.clientX,clientY:touch.clientY};
    handleCanvasClick(fakeEvent);
}, {passive:false});

// ==================== 摆棋作弊 ====================
function placeCheatPiece(row,col){
    if (!state.cheatMode) return;
    if (state.board[row][col] !== EMPTY) { log('作弊摆棋只能放在空格上'); return; }
    const letter = dom.cheatPiece.value;
    state.board[row][col] = letter;
    // 安全检查：不能把当前走棋方逼到无子可走
    if (getAllLegalMoves(state.board, state.currentTurn).length === 0) {
        state.board[row][col] = EMPTY;
        log('该摆放会导致当前走棋方无子可走，已撤销');
        drawBoard();
        return;
    }
    log(`🧙 作弊摆棋：${PIECE_NAMES[letter]} @ ${posToStr(row,col)}（不占回合）`);
    drawBoard(); updateStatus();
}
dom.btnCheat.addEventListener('click', ()=>{
    state.cheatMode = !state.cheatMode;
    dom.cheatPanel.classList.toggle('hidden', !state.cheatMode);
    log(state.cheatMode ? '作弊模式开启：选择棋子后点击棋盘空格放置（仅限你的回合，不占走棋）' : '作弊模式已关闭');
});
dom.btnCheatDone.addEventListener('click', ()=>{
    state.cheatMode = false;
    dom.cheatPanel.classList.add('hidden');
    log('作弊模式已关闭');
});

