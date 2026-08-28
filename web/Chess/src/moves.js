// ==================== 执行走法 ====================
function executeMove(fr,fc,tr,tc) {
    const piece=board[fr][fc]; const captured=board[tr][tc];
    const cnBefore = moveToChinese(fr,fc,tr,tc, piece); // 必须在落子前计算
    board[tr][tc]=piece; board[fr][fc]=EMPTY;
    lastMove={fromRow:fr,fromCol:fc,toRow:tr,toCol:tc};
    if(captured!==EMPTY) log(`吃子: ${PIECE_NAMES[captured]}`);
    const side = isRed(piece) ? '红方' : '黑方';
    const moveDesc = `${side} ${PIECE_NAMES[piece]} ${cnBefore||''} (${moveToStr(fr,fc,tr,tc)})`;
    moveHistory.push(moveDesc);
    if (moveHistory.length > 20) moveHistory.shift();
    return {piece,captured};
}

// ==================== 中文记谱 <-> 坐标 双向转换 ====================
// 把一步棋转成中文记谱（如 炮二平五 / 马八进七 / 前车进一）
// pieceOverride：棋盘已落子后调用时传入落子棋子，避免原位置为空导致返回空串
function moveToChinese(fr,fc,tr,tc, pieceOverride) {
    const piece = pieceOverride !== undefined ? pieceOverride : board[fr][fc];
    if (!piece) return '';
    const side = isRed(piece) ? 'red' : 'black';
    const pieceCh = PIECE_NAMES[piece]; // 车/马/炮/兵/卒/相/象/仕/士/帅/将
    const kind = CN_PIECE_KIND[pieceCh];
    const numToStr = side==='red' ? (n=>CN_NUM_REV[n]) : (n=>String(n));
    const fromColNum = side==='red' ? 9-fc : fc+1;
    const toColNum = side==='red' ? 9-tc : tc+1;
    // 前缀：同列同类型子
    let cnt=0, rows=[];
    for (let r=0;r<ROWS;r++) if (board[r][fc]===piece) { cnt++; rows.push(r); }
    let prefix='';
    if (cnt>=2) {
        if (cnt===2) {
            const isFront = side==='red' ? fr===Math.min(...rows) : fr===Math.max(...rows);
            prefix = isFront ? '前' : '后';
        } else {
            const sorted = side==='red' ? [...rows].sort((a,b)=>a-b) : [...rows].sort((a,b)=>b-a);
            prefix = numToStr(sorted.indexOf(fr)+1);
        }
    }
    let action='', target='';
    if (kind==='pawn') {
        if (tc!==fc) { action='平'; target=numToStr(toColNum); }
        else { action='进'; target=numToStr(1); }
    } else if (kind==='rook'||kind==='cannon'||kind==='king') {
        if (tc===fc) {
            const steps = Math.abs(tr-fr);
            const fwd = (tr-fr) * (side==='red'?-1:1);
            action = fwd>0 ? '进' : '退';
            target = numToStr(steps);
        } else { action='平'; target=numToStr(toColNum); }
    } else { // 马 相 士
        const fwd = (tr-fr) * (side==='red'?-1:1);
        action = fwd>0 ? '进' : '退';
        target = numToStr(toColNum);
    }
    return prefix + pieceCh + numToStr(fromColNum) + action + target;
}

// 从任意文本中解析中文记谱，返回候选走法列表（未做合法性过滤）
function parseChineseNotation(text, side) {
    const results = [];
    if (!text) return results;
    const pattern = /(前|后|[一二三四五])?(车|马|炮|兵|卒|相|象|仕|士|帅|将)([一二三四五六七八九1-9])(进|退|平)([一二三四五六七八九1-9])/g;
    const pieceSetMap = side==='red' ? RED_PIECE_SET : BLACK_PIECE_SET;
    const forward = side==='red' ? -1 : 1;
    let m;
    while ((m = pattern.exec(text)) !== null) {
        const prefix = m[1] || '';
        const pieceCh = m[2];
        const fromColNum = cnParse(m[3]);
        const action = m[4];
        const toNum = cnParse(m[5]);
        if (!fromColNum || !toNum) continue;
        const pieceLetter = pieceSetMap[pieceCh];
        if (!pieceLetter) continue; // 该字不是本方的棋子字（如红方不会写"将5进1"）
        const fromCol = side==='red' ? 9-fromColNum : fromColNum-1;
        const toCol = side==='red' ? 9-toNum : toNum-1;
        if (fromCol<0||fromCol>8||toCol<0||toCol>8) continue;
        // 收集同列同类棋子
        const sources=[];
        for (let r=0;r<ROWS;r++) if (board[r][fromCol]===pieceLetter) sources.push(r);
        if (!sources.length) continue;
        let chosenRows;
        if (sources.length>=2) {
            if (prefix==='前') chosenRows=[ side==='red' ? Math.min(...sources) : Math.max(...sources) ];
            else if (prefix==='后') chosenRows=[ side==='red' ? Math.max(...sources) : Math.min(...sources) ];
            else if (prefix) {
                const idx = CN_NUM[prefix];
                const sorted = side==='red' ? [...sources].sort((a,b)=>a-b) : [...sources].sort((a,b)=>b-a);
                chosenRows = (idx && idx<=sorted.length) ? [sorted[idx-1]] : [];
            } else chosenRows = sources; // 无前缀则全部作为候选，交给合法过滤
        } else chosenRows = sources;
        const kind = CN_PIECE_KIND[pieceCh];
        for (const fr of chosenRows) {
            const cands=[];
            if (kind==='rook'||kind==='cannon'||kind==='king') {
                if (action==='平') cands.push([fr,toCol]);
                else if (action==='进') cands.push([fr+forward*toNum, fromCol]);
                else cands.push([fr-forward*toNum, fromCol]);
            } else if (kind==='knight'||kind==='bishop'||kind==='advisor') {
                const dr = action==='进' ? forward : -forward;
                const steps = kind==='knight' ? [1,2] : (kind==='bishop' ? [2] : [1]);
                for (const s of steps) cands.push([fr+dr*s, toCol]);
            } else if (kind==='pawn') {
                if (action==='进' && toNum===1) cands.push([fr+forward, fromCol]);
                else if (action==='平') cands.push([fr, toCol]);
            }
            for (const [tr,tc] of cands) {
                if (inBoard(tr,tc)) results.push({fromRow:fr,fromCol,toRow:tr,toCol:tc});
            }
        }
    }
    return results;
}

// 从文本提取 4 字符坐标（支持 b2e2 / b2 e2 / b2-e2 / b2→e2 / b2至e2 等写法）
function extractCoords(text) {
    const res=[];
    if (!text) return res;
    const s = String(text).toLowerCase();
    let m;
    const re1=/[a-i][0-9][a-i][0-9]/g;
    while ((m=re1.exec(s))!==null){ const p=strToPos(m[0]); if(p) res.push(p); }
    const re2=/([a-i])([0-9])\s*(?:[-—–→⇒至到,，.。\s]|to){1,3}\s*([a-i])([0-9])/g;
    while ((m=re2.exec(s))!==null){ const p=strToPos(m[1]+m[2]+m[3]+m[4]); if(p) res.push(p); }
    return res;
}

// 多格式候选解析：JSON -> 坐标 -> 中文记谱
function parseMoveCandidates(text, side) {
    const out=[];
    const push=(arr,src)=>{ for(const mm of arr) out.push({fromRow:mm.fromRow,fromCol:mm.fromCol,toRow:mm.toRow,toCol:mm.toCol,source:src}); };
    // 1) JSON 对象（模型输出 {"move":"b2e2"}）
    const jstrs = String(text||'').match(/\{[\s\S]{0,400}?\}/g) || [];
    for (const js of jstrs) {
        try {
            const obj = JSON.parse(js);
            const vals=[obj.move, obj.coord, obj.coordinate, obj.uci, obj.answer];
            for (const v of vals) {
                if (typeof v==='string' && v.trim()) {
                    push(extractCoords(v), 'JSON');
                    push(parseChineseNotation(v, side), 'JSON中文记谱');
                }
            }
        } catch(e) {}
    }
    // 2) 纯坐标
    push(extractCoords(text), '坐标');
    // 3) 中文记谱
    push(parseChineseNotation(text, side), '中文记谱');
    return out;
}

// 解析编号（JSON choice 字段优先，其次裸数字，再其次汉字数字）
function parseNumberChoice(text, maxIdx) {
    if (!text) return -1;
    const jstrs = String(text).match(/\{[\s\S]{0,200}?\}/g) || [];
    for (const js of jstrs) {
        try {
            const o = JSON.parse(js);
            const n = parseInt(o.choice ?? o.index ?? o.answer ?? o.move);
            if (n>=1 && n<=maxIdx) return n-1;
        } catch(e) {}
    }
    const mm = String(text).match(/\d+/);
    if (mm) { const n=parseInt(mm[0]); if (n>=1 && n<=maxIdx) return n-1; }
    for (const k in CN_NUM) {
        if (String(text).includes(k)) { const n=CN_NUM[k]; if (n>=1 && n<=maxIdx) return n-1; }
    }
    return -1;
}

// 提取走棋风格声明（serious / mercy / creative）
function extractSpirit(text) {
    if (!text) return 'serious';
    const jstrs = String(text).match(/\{[\s\S]{0,300}?\}/g) || [];
    for (const js of jstrs) {
        try {
            const o = JSON.parse(js);
            const s = o.spirit || o.style;
            if (s==='mercy' || s==='creative' || s==='serious') return s;
        } catch(e) {}
    }
    return 'serious';
}

