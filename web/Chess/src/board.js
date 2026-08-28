import { COLS, COL_LETTERS, EMPTY, PIECE_NAMES, ROWS, isRed } from './constants.js';
import { state } from './state.js';


// ==================== 棋盘初始化 ====================
export function initBoard() {
    state.board = [];
    for (let r=0; r<ROWS; r++) state.board.push(new Array(COLS).fill(EMPTY));
    state.board[0] = ['r','n','b','a','k','a','b','n','r'];
    state.board[2] = [EMPTY,'c',EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,'c',EMPTY];
    state.board[3] = ['p',EMPTY,'p',EMPTY,'p',EMPTY,'p',EMPTY,'p'];
    state.board[6] = ['P',EMPTY,'P',EMPTY,'P',EMPTY,'P',EMPTY,'P'];
    state.board[7] = [EMPTY,'C',EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,'C',EMPTY];
    state.board[9] = ['R','N','B','A','K','A','B','N','R'];
}

export function boardToFEN() {
    let fen = '';
    for (let r=0; r<ROWS; r++) {
        let empty=0;
        for (let c=0; c<COLS; c++) {
            if (state.board[r][c]===EMPTY) empty++;
            else { if(empty>0){fen+=empty;empty=0;} fen+=state.board[r][c]; }
        }
        if(empty>0) fen+=empty;
        if(r<ROWS-1) fen+='/';
    }
    return fen;
}

// ASCII 棋盘：面向模型，红方在下方（行0），列 a-i
export function boardToAscii() {
    const lines = ['    a   b   c   d   e   f   g   h   i'];
    for (let r = 9; r >= 0; r--) {
        let line = String(r) + '  ';
        for (let c = 0; c < 9; c++) {
            const p = state.board[r][c];
            if (p === EMPTY) line += ' ·  ';
            else line += (isRed(p) ? '红' : '黑') + PIECE_NAMES[p] + ' ';
        }
        lines.push(line.replace(/\s+$/,''));
    }
    lines.push('（红方在下方行0-4半场，黑方在上方行5-9半场；列号a在左侧）');
    return lines.join('\n');
}

export function posToStr(r,c) { return COL_LETTERS[c]+r; }
export function strToPos(s) {
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
export function moveToStr(fr,fc,tr,tc) { return COL_LETTERS[fc]+fr+COL_LETTERS[tc]+tr; }

