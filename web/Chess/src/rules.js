// ==================== 走法生成（完整规则引擎） ====================
function inBoard(r,c) { return r>=0&&r<ROWS&&c>=0&&c<COLS; }
function inRedPalace(r,c){ return r>=7&&r<=9&&c>=3&&c<=5; }
function inBlackPalace(r,c){ return r>=0&&r<=2&&c>=3&&c<=5; }

function isAttackedBy(bs,tr,tc,attackerSide) {
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) {
        const p=bs[r][c]; if(p===EMPTY) continue;
        const pRed=isRed(p);
        if((attackerSide==='red'&&!pRed)||(attackerSide==='black'&&pRed)) continue;
        if(canPieceAttack(bs,r,c,tr,tc,p)) return true;
    }
    return false;
}

function canPieceAttack(bs,fr,fc,tr,tc,p) {
    if(fr===tr&&fc===tc) return false;
    const pl=p.toLowerCase(), pred=isRed(p);
    switch(pl) {
        case 'r': return canRookMove(bs,fr,fc,tr,tc);
        case 'n': return canKnightMove(bs,fr,fc,tr,tc);
        case 'b': return canBishopMove(bs,fr,fc,tr,tc,pred);
        case 'a': return canAdvisorMove(bs,fr,fc,tr,tc,pred);
        case 'k': return canKingMove(bs,fr,fc,tr,tc,pred);
        case 'c': return canCannonMove(bs,fr,fc,tr,tc);
        case 'p': return canPawnMove(bs,fr,fc,tr,tc,pred);
    }
    return false;
}
function canRookMove(bs,fr,fc,tr,tc) {
    if(fr!==tr&&fc!==tc) return false;
    const dr=Math.sign(tr-fr), dc=Math.sign(tc-fc);
    let r=fr+dr,c=fc+dc;
    while(r!==tr||c!==tc){ if(!inBoard(r,c)||bs[r][c]!==EMPTY) return false; r+=dr;c+=dc; }
    return true;
}
function canKnightMove(bs,fr,fc,tr,tc) {
    const dr=Math.abs(tr-fr), dc=Math.abs(tc-fc);
    if(!((dr===2&&dc===1)||(dr===1&&dc===2))) return false;
    let br,bc;
    if(dr===2){ br=fr+Math.sign(tr-fr); bc=fc; } else { br=fr; bc=fc+Math.sign(tc-fc); }
    return bs[br][bc]===EMPTY;
}
function canBishopMove(bs,fr,fc,tr,tc,pred) {
    const dr=Math.abs(tr-fr), dc=Math.abs(tc-fc);
    if(dr!==2||dc!==2) return false;
    if(pred&&tr<5) return false; if(!pred&&tr>4) return false;
    const er=(fr+tr)/2, ec=(fc+tc)/2;
    return bs[er][ec]===EMPTY;
}
function canAdvisorMove(bs,fr,fc,tr,tc,pred) {
    const dr=Math.abs(tr-fr), dc=Math.abs(tc-fc);
    if(dr!==1||dc!==1) return false;
    return pred?inRedPalace(tr,tc):inBlackPalace(tr,tc);
}
function canKingMove(bs,fr,fc,tr,tc,pred) {
    const dr=Math.abs(tr-fr), dc=Math.abs(tc-fc);
    if(dr+dc!==1) return false;
    return pred?inRedPalace(tr,tc):inBlackPalace(tr,tc);
}
function canCannonMove(bs,fr,fc,tr,tc) {
    if(fr!==tr&&fc!==tc) return false;
    const dr=Math.sign(tr-fr), dc=Math.sign(tc-fc);
    let r=fr+dr,c=fc+dc,jumped=false;
    while(r!==tr||c!==tc){ if(!inBoard(r,c)) return false; if(bs[r][c]!==EMPTY){ if(jumped)return false; jumped=true;} r+=dr;c+=dc; }
    if(bs[tr][tc]===EMPTY) return !jumped; else return jumped;
}
function canPawnMove(bs,fr,fc,tr,tc,pred) {
    const dr=tr-fr, dc=Math.abs(tc-fc);
    if(pred){ if(dr===-1&&dc===0) return true; if(fr<=4&&dr===0&&dc===1) return true; }
    else { if(dr===1&&dc===0) return true; if(fr>=5&&dr===0&&dc===1) return true; }
    return false;
}

function getAllLegalMoves(bs,side) {
    const moves=[];
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) {
        const p=bs[r][c]; if(p===EMPTY) continue;
        const pred=isRed(p);
        if((side==='red'&&!pred)||(side==='black'&&pred)) continue;
        const ms=getPieceLegalMoves(bs,r,c,p);
        for(const m of ms) moves.push({fromRow:r,fromCol:c,toRow:m.toRow,toCol:m.toCol});
    }
    return moves;
}
function getPieceLegalMoves(bs,row,col,piece) {
    const res=[];
    const pred=isRed(piece), side=pred?'red':'black';
    for(let tr=0;tr<ROWS;tr++) for(let tc=0;tc<COLS;tc++) {
        if(tr===row&&tc===col) continue;
        const target=bs[tr][tc];
        if(target!==EMPTY&&sameSide(target,piece)) continue;
        if(!canPieceAttack(bs,row,col,tr,tc,piece)) continue;
        const nb=cloneBoard(bs);
        nb[tr][tc]=piece; nb[row][col]=EMPTY;
        const kp=findKing(nb,side);
        if(!kp) continue;
        if(isAttackedBy(nb,kp.row,kp.col,side==='red'?'black':'red')) continue;
        if(kingsFacing(nb)) continue;
        res.push({toRow:tr,toCol:tc});
    }
    return res;
}
function cloneBoard(bs){ return bs.map(row=>[...row]); }
function findKing(bs,side){ const ch=side==='red'?'K':'k'; for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) if(bs[r][c]===ch) return {row:r,col:c}; return null; }
function kingsFacing(bs){ const rk=findKing(bs,'red'), bk=findKing(bs,'black'); if(!rk||!bk) return false; if(rk.col!==bk.col) return false; const min=Math.min(rk.row,bk.row),max=Math.max(rk.row,bk.row); for(let r=min+1;r<max;r++) if(bs[r][rk.col]!==EMPTY) return false; return true; }
function isInCheck(bs,side){ const kp=findKing(bs,side); if(!kp) return true; const attacker=side==='red'?'black':'red'; return isAttackedBy(bs,kp.row,kp.col,attacker); }
function isCheckmate(bs,side){ return isInCheck(bs,side) && getAllLegalMoves(bs,side).length===0; }
function isStalemate(bs,side){ return !isInCheck(bs,side) && getAllLegalMoves(bs,side).length===0; }
function isValidMove(bs,fr,fc,tr,tc,side){
    if(!inBoard(fr,fc)||!inBoard(tr,tc)) return false;
    const p=bs[fr][fc]; if(p===EMPTY) return false;
    const pred=isRed(p); if((side==='red'&&!pred)||(side==='black'&&pred)) return false;
    const target=bs[tr][tc]; if(target!==EMPTY&&sameSide(target,p)) return false;
    if(!canPieceAttack(bs,fr,fc,tr,tc,p)) return false;
    const nb=cloneBoard(bs); nb[tr][tc]=p; nb[fr][fc]=EMPTY;
    if(kingsFacing(nb)) return false;
    const kp=findKing(nb,side); if(!kp) return false;
    if(isAttackedBy(nb,kp.row,kp.col,side==='red'?'black':'red')) return false;
    return true;
}

