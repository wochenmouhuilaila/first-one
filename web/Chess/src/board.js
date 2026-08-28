// ==================== 棋盘初始化 ====================
function initBoard() {
    board = [];
    for (let r=0; r<ROWS; r++) board.push(new Array(COLS).fill(EMPTY));
    board[0] = ['r','n','b','a','k','a','b','n','r'];
    board[2] = [EMPTY,'c',EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,'c',EMPTY];
    board[3] = ['p',EMPTY,'p',EMPTY,'p',EMPTY,'p',EMPTY,'p'];
    board[6] = ['P',EMPTY,'P',EMPTY,'P',EMPTY,'P',EMPTY,'P'];
    board[7] = [EMPTY,'C',EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,'C',EMPTY];
    board[9] = ['R','N','B','A','K','A','B','N','R'];
}

function boardToFEN() {
    let fen = '';
    for (let r=0; r<ROWS; r++) {
        let empty=0;
        for (let c=0; c<COLS; c++) {
            if (board[r][c]===EMPTY) empty++;
            else { if(empty>0){fen+=empty;empty=0;} fen+=board[r][c]; }
        }
        if(empty>0) fen+=empty;
        if(r<ROWS-1) fen+='/';
    }
    return fen;
}

// ASCII 棋盘：面向模型，红方在下方（行0），列 a-i
function boardToAscii() {
    const lines = ['    a   b   c   d   e   f   g   h   i'];
    for (let r = 9; r >= 0; r--) {
        let line = String(r) + '  ';
        for (let c = 0; c < 9; c++) {
            const p = board[r][c];
            if (p === EMPTY) line += ' ·  ';
            else line += (isRed(p) ? '红' : '黑') + PIECE_NAMES[p] + ' ';
        }
        lines.push(line.replace(/\s+$/,''));
    }
    lines.push('（红方在下方行0-4半场，黑方在上方行5-9半场；列号a在左侧）');
    return lines.join('\n');
}

function posToStr(r,c) { return COL_LETTERS[c]+r; }
function strToPos(s) {
    const clean = String(s).replace(/[^a-zA-Z0-9]/g, '');
    if(clean.length!==4) return null;
    const c1 = COL_LETTERS.indexOf(clean[0].toLowerCase());
    const r1 = parseInt(clean[1]);
    const c2 = COL_LETTERS.indexOf(clean[2].toLowerCase());
    const r2 = parseInt(clean[3]);
    if(c1===-1 || c2===-1 || isNaN(r1) || isNaN(r2)) return null;
    if(r1<0||r1>9||r2<0||r2>9||c1<0||c1>8||c2<0||c2>8) return null;
    return { fromRow:r1, fromCol:c1, toRow:r2, toCol:c2 };
}
function moveToStr(fr,fc,tr,tc) { return COL_LETTERS[fc]+fr+COL_LETTERS[tc]+tr; }

