import { COLS, EMPTY, PIECE_NAMES, ROWS, isRed } from './constants.js';
import { dom, state } from './state.js';
import { isInCheck } from './rules.js';


// ==================== Canvas绘制 ====================
let canvasWidth=0, canvasHeight=0, cellSize=0, boardOffsetX=0, boardOffsetY=0, boardPadding=30;
export function resizeCanvas() {
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
    dom.canvas.width = canvasWidth; dom.canvas.height = canvasHeight;
    dom.canvas.style.width = canvasWidth + 'px'; dom.canvas.style.height = canvasHeight + 'px';
}
function getScreenPos(row, col) {
    const displayRow = state.boardFlipped ? (ROWS-1-row) : row;
    return { x: boardOffsetX + col*cellSize, y: boardOffsetY + displayRow*cellSize };
}
export function getBoardPos(sx, sy) {
    const col = Math.round((sx - boardOffsetX) / cellSize);
    const dRow = Math.round((sy - boardOffsetY) / cellSize);
    const row = state.boardFlipped ? (ROWS-1-dRow) : dRow;
    if (col<0||col>=COLS||row<0||row>=ROWS) return null;
    const sp = getScreenPos(row,col);
    if (Math.sqrt((sx-sp.x)**2 + (sy-sp.y)**2) > cellSize*0.45) return null;
    return { row, col };
}
export function drawBoard() {
    dom.ctx.clearRect(0,0,canvasWidth,canvasHeight);
    dom.ctx.fillStyle = '#e8d5b0'; dom.ctx.fillRect(0,0,canvasWidth,canvasHeight);
    dom.ctx.strokeStyle = '#5a3e1b'; dom.ctx.lineWidth = 1.2;
    for(let r=0;r<ROWS;r++){ const p1=getScreenPos(r,0),p2=getScreenPos(r,8); dom.ctx.beginPath(); dom.ctx.moveTo(p1.x,p1.y); dom.ctx.lineTo(p2.x,p2.y); dom.ctx.stroke(); }
    for(let c=0;c<COLS;c++){
        if(c===0||c===8){ const p1=getScreenPos(0,c),p2=getScreenPos(9,c); dom.ctx.beginPath(); dom.ctx.moveTo(p1.x,p1.y); dom.ctx.lineTo(p2.x,p2.y); dom.ctx.stroke(); }
        else { const p1=getScreenPos(0,c),p2=getScreenPos(4,c); dom.ctx.beginPath(); dom.ctx.moveTo(p1.x,p1.y); dom.ctx.lineTo(p2.x,p2.y); dom.ctx.stroke(); const p3=getScreenPos(5,c),p4=getScreenPos(9,c); dom.ctx.beginPath(); dom.ctx.moveTo(p3.x,p3.y); dom.ctx.lineTo(p4.x,p4.y); dom.ctx.stroke(); }
    }
    dom.ctx.lineWidth = 1;
    const bp1=getScreenPos(0,3),bp2=getScreenPos(2,5); dom.ctx.beginPath(); dom.ctx.moveTo(bp1.x,bp1.y); dom.ctx.lineTo(bp2.x,bp2.y); dom.ctx.stroke();
    const bp3=getScreenPos(0,5),bp4=getScreenPos(2,3); dom.ctx.beginPath(); dom.ctx.moveTo(bp3.x,bp3.y); dom.ctx.lineTo(bp4.x,bp4.y); dom.ctx.stroke();
    const rp1=getScreenPos(7,3),rp2=getScreenPos(9,5); dom.ctx.beginPath(); dom.ctx.moveTo(rp1.x,rp1.y); dom.ctx.lineTo(rp2.x,rp2.y); dom.ctx.stroke();
    const rp3=getScreenPos(7,5),rp4=getScreenPos(9,3); dom.ctx.beginPath(); dom.ctx.moveTo(rp3.x,rp3.y); dom.ctx.lineTo(rp4.x,rp4.y); dom.ctx.stroke();
    dom.ctx.fillStyle = '#5a3e1b';
    dom.ctx.font = `bold ${Math.max(cellSize*0.4,12)}px 'STKaiti','KaiTi','SimSun',serif`;
    dom.ctx.textAlign='center'; dom.ctx.textBaseline='middle';
    const riverY = (getScreenPos(4,4).y + getScreenPos(5,4).y)/2;
    dom.ctx.fillText('楚 河', (getScreenPos(4,1).x+getScreenPos(4,3).x)/2, riverY);
    dom.ctx.fillText('汉 界', (getScreenPos(4,5).x+getScreenPos(4,7).x)/2, riverY);
    const pieceRadius = Math.max(cellSize*0.38, 12);
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) {
        const piece=state.board[r][c]; if(piece===EMPTY) continue;
        const sp=getScreenPos(r,c);
        const isSelected = state.selectedPos && state.selectedPos.row===r && state.selectedPos.col===c;
        const isLast = state.lastMove && ((state.lastMove.fromRow===r&&state.lastMove.fromCol===c)||(state.lastMove.toRow===r&&state.lastMove.toCol===c));
        const isCheckPiece = piece==='K'||piece==='k';
        const inCheckNow = state.gameStarted&&!state.gameOver&&isInCheck(state.board,isRed(piece)?'red':'black');
        const highlightCheck = isCheckPiece&&inCheckNow;
        dom.ctx.beginPath(); dom.ctx.arc(sp.x,sp.y,pieceRadius,0,Math.PI*2);
        dom.ctx.fillStyle='#f5e8c8'; dom.ctx.fill();
        dom.ctx.lineWidth = isSelected?3:2;
        dom.ctx.strokeStyle = isSelected?'#ff8c00':(highlightCheck?'#ff0000':'#8b6914'); dom.ctx.stroke();
        if(isLast){ dom.ctx.lineWidth=2; dom.ctx.strokeStyle='rgba(100,180,255,0.8)'; dom.ctx.beginPath(); dom.ctx.arc(sp.x,sp.y,pieceRadius+3,0,Math.PI*2); dom.ctx.stroke(); }
        const name=PIECE_NAMES[piece];
        dom.ctx.fillStyle=isRed(piece)?'#c0392b':'#2c2c2c';
        dom.ctx.font=`bold ${Math.round(pieceRadius*1.15)}px 'STKaiti','KaiTi','SimSun','Noto Sans SC',serif`;
        dom.ctx.fillText(name,sp.x,sp.y+1);
    }
    if(state.selectedPos && state.legalMovesForSelected.length>0){
        for(const m of state.legalMovesForSelected){
            const sp=getScreenPos(m.toRow,m.toCol);
            const target=state.board[m.toRow][m.toCol];
            dom.ctx.beginPath(); dom.ctx.arc(sp.x,sp.y,pieceRadius*0.5,0,Math.PI*2);
            if(target!==EMPTY){ dom.ctx.fillStyle='rgba(255,0,0,0.4)'; dom.ctx.strokeStyle='rgba(255,0,0,0.7)'; dom.ctx.lineWidth=2.5; dom.ctx.fill(); dom.ctx.beginPath(); dom.ctx.arc(sp.x,sp.y,pieceRadius,0,Math.PI*2); dom.ctx.stroke(); }
            else { dom.ctx.fillStyle='rgba(0,200,0,0.35)'; dom.ctx.fill(); }
        }
    }
    if(state.selectedPos){ const sp=getScreenPos(state.selectedPos.row,state.selectedPos.col); dom.ctx.beginPath(); dom.ctx.arc(sp.x,sp.y,pieceRadius+4,0,Math.PI*2); dom.ctx.strokeStyle='rgba(255,150,0,0.85)'; dom.ctx.lineWidth=3; dom.ctx.stroke(); }
}

