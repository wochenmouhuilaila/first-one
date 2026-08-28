// ==================== Canvas绘制 ====================
let canvasWidth=0, canvasHeight=0, cellSize=0, boardOffsetX=0, boardOffsetY=0, boardPadding=30;
function resizeCanvas() {
    const containerWidth = Math.min(window.innerWidth - 20, 660);
    const containerHeight = Math.min(window.innerHeight - 240, 680);
    const maxW = containerWidth, maxH = containerHeight;
    let cw = (maxW - boardPadding*2) / 8;
    let ch = (maxH - boardPadding*2) / 9;
    cellSize = Math.max(Math.min(cw, ch, 70), 28);
    if (cellSize*8 + boardPadding*2 > maxW) cellSize = (maxW - boardPadding*2)/8;
    if (cellSize*9 + boardPadding*2 > maxH) cellSize = (maxH - boardPadding*2)/9;
    cellSize = Math.floor(cellSize);
    if (cellSize < 28) cellSize = 28;
    canvasWidth = cellSize*8 + boardPadding*2;
    canvasHeight = cellSize*9 + boardPadding*2;
    boardOffsetX = boardPadding; boardOffsetY = boardPadding;
    canvas.width = canvasWidth; canvas.height = canvasHeight;
    canvas.style.width = canvasWidth + 'px'; canvas.style.height = canvasHeight + 'px';
}
function getScreenPos(row, col) {
    const displayRow = boardFlipped ? (ROWS-1-row) : row;
    return { x: boardOffsetX + col*cellSize, y: boardOffsetY + displayRow*cellSize };
}
function getBoardPos(sx, sy) {
    const col = Math.round((sx - boardOffsetX) / cellSize);
    const dRow = Math.round((sy - boardOffsetY) / cellSize);
    const row = boardFlipped ? (ROWS-1-dRow) : dRow;
    if (col<0||col>=COLS||row<0||row>=ROWS) return null;
    const sp = getScreenPos(row,col);
    if (Math.sqrt((sx-sp.x)**2 + (sy-sp.y)**2) > cellSize*0.45) return null;
    return { row, col };
}
function drawBoard() {
    ctx.clearRect(0,0,canvasWidth,canvasHeight);
    ctx.fillStyle = '#e8d5b0'; ctx.fillRect(0,0,canvasWidth,canvasHeight);
    ctx.strokeStyle = '#5a3e1b'; ctx.lineWidth = 1.2;
    for(let r=0;r<ROWS;r++){ const p1=getScreenPos(r,0),p2=getScreenPos(r,8); ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.stroke(); }
    for(let c=0;c<COLS;c++){
        if(c===0||c===8){ const p1=getScreenPos(0,c),p2=getScreenPos(9,c); ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.stroke(); }
        else { const p1=getScreenPos(0,c),p2=getScreenPos(4,c); ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.stroke(); const p3=getScreenPos(5,c),p4=getScreenPos(9,c); ctx.beginPath(); ctx.moveTo(p3.x,p3.y); ctx.lineTo(p4.x,p4.y); ctx.stroke(); }
    }
    ctx.lineWidth = 1;
    const bp1=getScreenPos(0,3),bp2=getScreenPos(2,5); ctx.beginPath(); ctx.moveTo(bp1.x,bp1.y); ctx.lineTo(bp2.x,bp2.y); ctx.stroke();
    const bp3=getScreenPos(0,5),bp4=getScreenPos(2,3); ctx.beginPath(); ctx.moveTo(bp3.x,bp3.y); ctx.lineTo(bp4.x,bp4.y); ctx.stroke();
    const rp1=getScreenPos(7,3),rp2=getScreenPos(9,5); ctx.beginPath(); ctx.moveTo(rp1.x,rp1.y); ctx.lineTo(rp2.x,rp2.y); ctx.stroke();
    const rp3=getScreenPos(7,5),rp4=getScreenPos(9,3); ctx.beginPath(); ctx.moveTo(rp3.x,rp3.y); ctx.lineTo(rp4.x,rp4.y); ctx.stroke();
    ctx.fillStyle = '#5a3e1b';
    ctx.font = `bold ${Math.max(cellSize*0.4,12)}px 'STKaiti','KaiTi','SimSun',serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    const riverY = (getScreenPos(4,4).y + getScreenPos(5,4).y)/2;
    ctx.fillText('楚 河', (getScreenPos(4,1).x+getScreenPos(4,3).x)/2, riverY);
    ctx.fillText('汉 界', (getScreenPos(4,5).x+getScreenPos(4,7).x)/2, riverY);
    const pieceRadius = Math.max(cellSize*0.38, 12);
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) {
        const piece=board[r][c]; if(piece===EMPTY) continue;
        const sp=getScreenPos(r,c);
        const isSelected = selectedPos && selectedPos.row===r && selectedPos.col===c;
        const isLast = lastMove && ((lastMove.fromRow===r&&lastMove.fromCol===c)||(lastMove.toRow===r&&lastMove.toCol===c));
        const isCheckPiece = piece==='K'||piece==='k';
        const inCheckNow = gameStarted&&!gameOver&&isInCheck(board,isRed(piece)?'red':'black');
        const highlightCheck = isCheckPiece&&inCheckNow;
        ctx.beginPath(); ctx.arc(sp.x,sp.y,pieceRadius,0,Math.PI*2);
        ctx.fillStyle='#f5e8c8'; ctx.fill();
        ctx.lineWidth = isSelected?3:2;
        ctx.strokeStyle = isSelected?'#ff8c00':(highlightCheck?'#ff0000':'#8b6914'); ctx.stroke();
        if(isLast){ ctx.lineWidth=2; ctx.strokeStyle='rgba(100,180,255,0.8)'; ctx.beginPath(); ctx.arc(sp.x,sp.y,pieceRadius+3,0,Math.PI*2); ctx.stroke(); }
        const name=PIECE_NAMES[piece];
        ctx.fillStyle=isRed(piece)?'#c0392b':'#2c2c2c';
        ctx.font=`bold ${Math.round(pieceRadius*1.15)}px 'STKaiti','KaiTi','SimSun','Noto Sans SC',serif`;
        ctx.fillText(name,sp.x,sp.y+1);
    }
    if(selectedPos && legalMovesForSelected.length>0){
        for(const m of legalMovesForSelected){
            const sp=getScreenPos(m.toRow,m.toCol);
            const target=board[m.toRow][m.toCol];
            ctx.beginPath(); ctx.arc(sp.x,sp.y,pieceRadius*0.5,0,Math.PI*2);
            if(target!==EMPTY){ ctx.fillStyle='rgba(255,0,0,0.4)'; ctx.strokeStyle='rgba(255,0,0,0.7)'; ctx.lineWidth=2.5; ctx.fill(); ctx.beginPath(); ctx.arc(sp.x,sp.y,pieceRadius,0,Math.PI*2); ctx.stroke(); }
            else { ctx.fillStyle='rgba(0,200,0,0.35)'; ctx.fill(); }
        }
    }
    if(selectedPos){ const sp=getScreenPos(selectedPos.row,selectedPos.col); ctx.beginPath(); ctx.arc(sp.x,sp.y,pieceRadius+4,0,Math.PI*2); ctx.strokeStyle='rgba(255,150,0,0.85)'; ctx.lineWidth=3; ctx.stroke(); }
}

