// ==================== 用户交互 ====================
function handleCanvasClick(e){
    if(!gameStarted||gameOver||isAiThinking) return;
    if(currentTurn!==userSide) return;
    const rect=canvas.getBoundingClientRect();
    const scaleX=canvas.width/rect.width, scaleY=canvas.height/rect.height;
    const sx=(e.clientX-rect.left)*scaleX, sy=(e.clientY-rect.top)*scaleY;
    const pos=getBoardPos(sx,sy); if(!pos) return;
    const {row,col}=pos;
    if (cheatMode) { placeCheatPiece(row,col); return; }
    const piece=board[row][col];
    if(selectedPos){
        const isTarget=legalMovesForSelected.some(m=>m.toRow===row&&m.toCol===col);
        if(isTarget){
            executeMove(selectedPos.row,selectedPos.col,row,col);
            selectedPos=null; legalMovesForSelected=[];
            currentTurn=aiSide;
            log(`您走棋: ${moveToStr(lastMove.fromRow,lastMove.fromCol,lastMove.toRow,lastMove.toCol)}`);
            afterMove(); return;
        }
        if(piece!==EMPTY){
            const pred=isRed(piece);
            if((userSide==='red'&&pred)||(userSide==='black'&&!pred)){
                selectedPos={row,col}; legalMovesForSelected=getPieceLegalMoves(board,row,col,piece);
                drawBoard(); return;
            }
        }
        selectedPos=null; legalMovesForSelected=[]; drawBoard(); return;
    }
    if(piece!==EMPTY){
        const pred=isRed(piece);
        if((userSide==='red'&&pred)||(userSide==='black'&&!pred)){
            selectedPos={row,col}; legalMovesForSelected=getPieceLegalMoves(board,row,col,piece);
            drawBoard();
        }
    }
}
canvas.addEventListener('click', handleCanvasClick);
canvas.addEventListener('touchstart', function(e){
    e.preventDefault(); const touch=e.touches[0];
    const fakeEvent={clientX:touch.clientX,clientY:touch.clientY};
    handleCanvasClick(fakeEvent);
}, {passive:false});

// ==================== 摆棋作弊 ====================
function placeCheatPiece(row,col){
    if (!cheatMode) return;
    if (board[row][col] !== EMPTY) { log('作弊摆棋只能放在空格上'); return; }
    const letter = cheatPiece.value;
    board[row][col] = letter;
    // 安全检查：不能把当前走棋方逼到无子可走
    if (getAllLegalMoves(board, currentTurn).length === 0) {
        board[row][col] = EMPTY;
        log('该摆放会导致当前走棋方无子可走，已撤销');
        drawBoard();
        return;
    }
    log(`🧙 作弊摆棋：${PIECE_NAMES[letter]} @ ${posToStr(row,col)}（不占回合）`);
    drawBoard(); updateStatus();
}
btnCheat.addEventListener('click', ()=>{
    cheatMode = !cheatMode;
    cheatPanel.classList.toggle('hidden', !cheatMode);
    log(cheatMode ? '作弊模式开启：选择棋子后点击棋盘空格放置（仅限你的回合，不占走棋）' : '作弊模式已关闭');
});
btnCheatDone.addEventListener('click', ()=>{
    cheatMode = false;
    cheatPanel.classList.add('hidden');
    log('作弊模式已关闭');
});

