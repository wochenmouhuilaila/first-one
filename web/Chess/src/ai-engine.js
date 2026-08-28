// ==================== 本地AI（兜底，带基本评估） ====================
function localAiMove(side) {
    const moves=getAllLegalMoves(board,side);
    if(moves.length===0) return null;
    const opp = side==='red' ? 'black' : 'red';
    let best=null, bestScore=-1e9;
    for(const m of moves){
        let s=0;
        const piece=board[m.fromRow][m.fromCol];
        const target=board[m.toRow][m.toCol];
        if(target!==EMPTY) s += (PIECE_VALUES[target]||0)*10;           // 吃子
        const nb=cloneBoard(board); nb[m.toRow][m.toCol]=piece; nb[m.fromRow][m.fromCol]=EMPTY;
        if(isInCheck(nb,opp)) s += 4;                                    // 将军
        if(isAttackedBy(board,m.toRow,m.toCol,opp)) s -= (PIECE_VALUES[piece]||1)*6; // 落点风险
        s += (side==='red' ? (m.fromRow-m.toRow) : (m.toRow-m.fromRow))*0.1;        // 前进
        s += (4-Math.abs(m.toCol-4))*0.05;                               // 中央
        if(lastMove && lastMove.toRow===m.fromRow && lastMove.toCol===m.fromCol
           && lastMove.fromRow===m.toRow && lastMove.fromCol===m.toCol) s -= 3;     // 避免来回走
        s += Math.random()*0.4;
        if(s>bestScore){ bestScore=s; best=m; }
    }
    return best;
}

// ==================== 内置搜索引擎（α-β剪枝 + 静态评估 + 吃子静态搜索） ====================
const SEARCH_MATE = 1000000;
const SEARCH_INF = 100000000;
const GUARD_MARGIN = 150;          // 护航容差（厘兵）：AI走法比引擎最优差不超150cp即采用
const SEARCH_NODE_LIMIT = 300000;  // 节点上限，保证毫秒级
let searchNodes = 0;

// 静态评估（红方视角，单位：厘兵）
function evalBoard(bs) {
    let score = 0;
    for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
        const p = bs[r][c]; if (p===EMPTY) continue;
        const pl = p.toLowerCase();
        const mat = (PIECE_VALUES[p]||0)*100;
        let pos = 0;
        if (pl==='p') {
            pos = isRed(p) ? (9-r)*6 + (r<=4?8:0) : r*6 + (r>=5?8:0);
        } else if (pl==='n') {
            pos = 12 - Math.min(r,9-r)*2 - Math.abs(c-4)*2;
        } else if (pl==='b' || pl==='a') {
            pos = 5 - Math.abs(c-4);
        } else if (pl==='r') {
            pos = 5 - Math.abs(c-4);
        } else if (pl==='c') {
            pos = 4 - Math.abs(c-4);
        } else if (pl==='k') {
            pos = isRed(p) ? (r<7 ? -15 : 5 - Math.abs(c-4)) : (r>2 ? -15 : 5 - Math.abs(c-4));
        }
        if (isRed(p)) score += mat + pos; else score -= mat + pos;
    }
    return score;
}

// 走法排序：吃子优先（MVV-LVA）
function orderMoves(bs, moves) {
    const sc = m => {
        const t = bs[m.toRow][m.toCol];
        return t!==EMPTY ? (PIECE_VALUES[t]||0)*10 - (PIECE_VALUES[bs[m.fromRow][m.fromCol]]||0)*0.01 : 0;
    };
    return moves.map(m=>({m,s:sc(m)})).sort((a,b)=>b.s-a.s).map(o=>o.m);
}

function quiescence(bs, alpha, beta, side) {
    searchNodes++;
    const stand = (side==='red' ? 1 : -1) * evalBoard(bs);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    let caps = getAllLegalMoves(bs, side).filter(m => bs[m.toRow][m.toCol] !== EMPTY);
    caps = orderMoves(bs, caps);
    for (const m of caps) {
        if (searchNodes > SEARCH_NODE_LIMIT) break;
        const nb = cloneBoard(bs);
        nb[m.toRow][m.toCol]=nb[m.fromRow][m.fromCol]; nb[m.fromRow][m.fromCol]=EMPTY;
        const sc = -quiescence(nb, -beta, -alpha, side==='red'?'black':'red');
        if (sc >= beta) return beta;
        if (sc > alpha) alpha = sc;
    }
    return alpha;
}

function alphaBeta(bs, depth, alpha, beta, side, ply) {
    searchNodes++;
    const opp = side==='red'?'black':'red';
    const moves = getAllLegalMoves(bs, side);
    if (moves.length===0) {
        return isInCheck(bs, side) ? -(SEARCH_MATE - ply) : 0;
    }
    if (depth<=0) return quiescence(bs, alpha, beta, side);
    const ordered = orderMoves(bs, moves);
    let best = -SEARCH_INF;
    for (const m of ordered) {
        if (searchNodes > SEARCH_NODE_LIMIT) break;
        const nb = cloneBoard(bs);
        nb[m.toRow][m.toCol]=nb[m.fromRow][m.fromCol]; nb[m.fromRow][m.fromCol]=EMPTY;
        const sc = -alphaBeta(nb, depth-1, -beta, -alpha, opp, ply+1);
        if (sc > best) best = sc;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
    }
    return best;
}

// 搜索最佳走法（返回 {move, score}，score为走完该步后己方视角的评估值）
function searchBestMove(bs, side) {
    const moves = getAllLegalMoves(bs, side);
    if (moves.length===0) return null;
    const depth = moves.length <= 8 ? 4 : 3;
    searchNodes = 0;
    const opp = side==='red'?'black':'red';
    let best = null, alpha = -SEARCH_INF;
    for (const m of orderMoves(bs, moves)) {
        if (searchNodes > SEARCH_NODE_LIMIT) break;
        const nb = cloneBoard(bs);
        nb[m.toRow][m.toCol]=nb[m.fromRow][m.fromCol]; nb[m.fromRow][m.fromCol]=EMPTY;
        const sc = -alphaBeta(nb, depth-1, -SEARCH_INF, -alpha, opp, 1);
        if (sc > alpha) { alpha = sc; best = m; }
    }
    return best ? { move: best, score: alpha } : { move: moves[0], score: 0 };
}

// 引擎护航：AI自由选点若明显劣于引擎最优则纠正；但AI可依"心智状态"选择性无视纠正（放水/任性）
function engineGuard(llmMove, side, spirit) {
    const moves = getAllLegalMoves(board, side);
    const depth = moves.length <= 8 ? 4 : 3;
    const eng = searchBestMove(board, side);
    if (!eng) return null;
    if (!llmMove) { log('引擎接管（AI未给出有效走法）'); return eng.move; }
    const opp = side==='red'?'black':'red';
    const nb = cloneBoard(board);
    nb[llmMove.toRow][llmMove.toCol]=nb[llmMove.fromRow][llmMove.fromCol];
    nb[llmMove.fromRow][llmMove.fromCol]=EMPTY;
    const llmVal = -alphaBeta(nb, depth-1, -SEARCH_INF, SEARCH_INF, opp, 1);
    const m = aiMind.mercy, r = aiMind.risk;
    const margin = GUARD_MARGIN + m*250 + r*200;           // 放水/任性越大，容忍越差的走法
    if (llmVal >= eng.score - margin) return llmMove;       // 质量过关
    // "任性权"：AI依状态与spirit决定无视引擎纠正（偶尔自发的小任性3%）
    const spiritSoft = spirit==='mercy' || spirit==='creative';
    const stateOverride = (m>0 || r>0) && (spiritSoft || Math.random() < 0.25*m + 0.2*r);
    const spontaneous = Math.random() < 0.03;
    const forcedMateLoss = llmVal <= -(SEARCH_MATE - 100);  // 引擎算出必败连杀则不任性
    if (!forcedMateLoss && (stateOverride || spontaneous)) {
        log(`⚠ AI行使"任性权"（spirit:${spirit||'未声明'}，放水${m} 任性${r}）：无视引擎纠正，采用自选走法（评估${llmVal}cp vs 最优${eng.score}cp）`);
        return llmMove;
    }
    log(`引擎纠错：AI走法评估${llmVal}cp，引擎最优${eng.score}cp（差${eng.score-llmVal}cp），改用引擎走法`);
    return eng.move;
}

// 放水兜底：AI没有给出走法时，按放水/任性程度在"次优窗口"内随机选择（否则选最优）
function softPickMove(side) {
    const eng = searchBestMove(board, side);
    if (!eng) return null;
    const m = aiMind.mercy, r = aiMind.risk;
    if (m===0 && r===0) return eng.move;
    const win = m*120 + r*80; // 容忍窗口（厘兵）
    const moves = getAllLegalMoves(board, side);
    const depth = moves.length <= 8 ? 4 : 3;
    const opp = side==='red'?'black':'red';
    let bestV = -SEARCH_INF;
    const scored = [];
    for (const mv of moves) {
        const nb = cloneBoard(board);
        nb[mv.toRow][mv.toCol]=nb[mv.fromRow][mv.fromCol]; nb[mv.fromRow][mv.fromCol]=EMPTY;
        const v = -alphaBeta(nb, depth-1, -SEARCH_INF, SEARCH_INF, opp, 1);
        scored.push({mv,v});
        if (v > bestV) bestV = v;
    }
    const pool = scored.filter(x => x.v >= bestV - win);
    const pick = pool[Math.floor(Math.random()*pool.length)].mv;
    log(`（放水兜底：在最优${bestV}cp附近${win}cp窗口内随机选择，共${pool.length}个候选）`);
    return pick;
}

