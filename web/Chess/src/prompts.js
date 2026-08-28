import { COLS, EMPTY, PIECE_NAMES, PIECE_VALUES, ROWS, isRed, sameSide } from './constants.js';
import { state } from './state.js';
import { boardToAscii, boardToFEN, posToStr } from './board.js';
import { canPieceAttack, cloneBoard, findKing, isAttackedBy, isInCheck, kingsFacing } from './rules.js';

// FEN 权威棋盘块：机器可读、无歧义，坐标判定以此为准（ASCII 仅供人类视觉参考）
export function boardToFenBlock() {
    return `【棋盘FEN（机器可读，以此为准；若与ASCII图不一致以FEN为准）】\n${boardToFEN(state.board)}
（FEN共10段：第1段=行0（黑方底线）…第10段=行9（红方底线）；列号a-i从左到右；示例：rnbakabnr/9/1c5c1/…）`;
}


// ==================== 形势描述 ====================
export function describePosition(bs, side) {
    let redScore=0, blackScore=0;
    for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
        const p=bs[r][c]; if(p===EMPTY) continue;
        if (isRed(p)) redScore += PIECE_VALUES[p]||0; else blackScore += PIECE_VALUES[p]||0;
    }
    const sideName = side==='red' ? '红方' : '黑方';
    const inCheck = isInCheck(bs, side);
    const oppInCheck = isInCheck(bs, side==='red'?'black':'red');
    let adv = '';
    if (Math.abs(redScore-blackScore) < 1) adv = '子力均衡';
    else adv = redScore>blackScore ? `红方子力领先${(redScore-blackScore).toFixed(1)}分` : `黑方子力领先${(blackScore-redScore).toFixed(1)}分`;
    return `当前轮到${sideName}走棋。` +
        (inCheck ? `⚠${sideName}正被将军，必须应将！` : '当前无将军。') +
        (oppInCheck ? `对手正被将军。` : '') +
        `红方子力总分${redScore.toFixed(1)}，黑方子力总分${blackScore.toFixed(1)}，${adv}。`;
}

// 找出某方"正被对方攻击"的棋子（危险提示）
export function describeThreats(bs, side) {
    const opp = side==='red'?'black':'red';
    const hits = [];
    for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
        const p = bs[r][c]; if (p===EMPTY) continue;
        const mine = side==='red' ? isRed(p) : !isRed(p);
        if (mine && isAttackedBy(bs, r, c, opp)) hits.push(`${PIECE_NAMES[p]}@${posToStr(r,c)}`);
    }
    return hits;
}

export function buildBoardPrompt(side) {
    const sideName = side==='red' ? '红方' : '黑方';
    const threats = describeThreats(state.board, side);
    const recentMoves = state.moveHistory.length ? state.moveHistory.slice(-6).join('；') : '（开局）';
    const chatTail = state.chatHistory.slice(-6)
        .map(m => `${m.role==='user' ? '用户' : 'AI'}：${String(m.content).slice(0,60)}`)
        .join('\n');
    return `你是中国象棋特级大师级对弈引擎，现在执${sideName}。

【棋盘】10行×9列。下方为红方（行5-9，底线行9），上方为黑方（行0-4，底线行0）。列用小写字母a-i表示，行用数字0-9表示。
坐标格式：起始列字母+起始行号+目标列字母+目标行号，共4字符。例如红方"马二进三"对应坐标h9g7。

当前棋盘（·为空点）：
${boardToAscii()}

${boardToFenBlock()}

【走子规则】
- 车：沿直线行走，遇子即停；可吃路径上第一个敌子。
- 马：走"日"字，若马腿位置有子则蹩腿不能走。
- 炮：直线行走不隔子，吃子时必须恰好隔一个棋子（炮架）。
- 相/象：斜走两格（田字），不能过河，象眼有子则塞象眼不能走。
- 仕/士：在己方九宫内斜走一步。
- 帅/将：在己方九宫内直走一步；两帅将不能同列照面（中间无子时视为被将军）。
- 兵/卒：未过河只能向前一步，过河后可向前或左右一步，永不后退。
- 禁止走出导致己方帅将被吃（送将）的走法。

【当前形势】${describePosition(state.board, side)}
【最近走法】${recentMoves}
【危险警告】你方正被对方攻击的棋子：${threats.length ? threats.join('、') : '无'}（若你正被将军，必须先应将！）

【AI当前状态（来自聊天室，每局可变）】放水程度：${state.aiMind.mercy}/3（0=全力以赴，3=大幅退让）；任性程度：${state.aiMind.risk}/3（越高越倾向无视稳妥评估）；情绪：${state.aiMind.mood||'平静'}。
【聊天室动态】${chatTail || '（暂无对话）'}

【任务】请通盘分析（威胁、子力、位置、后续变化），为${sideName}走出你认为最优的一步。你可以参考聊天室动态与当前状态决定本次走棋风格：
- 想认真求胜 → spirit设为"serious"；想放水/退让 → "mercy"；想走冒险/创造性走法 → "creative"。
【输出格式】只输出一个JSON对象：{"move":"<4字符坐标>","spirit":"serious"}（spirit可省略，默认serious）。
坐标必须严格是：小写列字母(a-i)+行号(0-9)+小写列字母(a-i)+行号(0-9)。不要输出JSON以外的任何内容、理由或解释。`;
}

// 诊断一条非法走法的具体原因（用于反馈给模型）
export function explainIllegal(fr,fc,tr,tc,side){
    const p = state.board[fr][fc];
    if(!p) return `起始格${posToStr(fr,fc)}上没有你的棋子`;
    const pred=isRed(p);
    if((side==='red'&&!pred)||(side==='black'&&pred)) return `起始格${posToStr(fr,fc)}上是对方棋子，不是你的`;
    const target=state.board[tr][tc];
    if(target!==EMPTY&&sameSide(target,p)) return `目标格${posToStr(tr,tc)}上有你自己的棋子`;
    if(!canPieceAttack(state.board,fr,fc,tr,tc,p)) return `该棋子不能走到${posToStr(tr,tc)}（不符合走子规则，注意马腿/象眼/炮架）`;
    const nb=cloneBoard(state.board); nb[tr][tc]=p; nb[fr][fc]=EMPTY;
    if(kingsFacing(nb)) return '走后两帅将同列照面（不允许）';
    const kp=findKing(nb,side);
    if(kp && isAttackedBy(nb, kp.row, kp.col, side==='red'?'black':'red')) return '走后你的帅/将处于被吃状态（送将）';
    return '走法不合法';
}

