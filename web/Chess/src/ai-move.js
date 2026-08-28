import { EMPTY, MAX_MOVE_TOKENS, PIECE_NAMES, THINK_BUDGET } from './constants.js';
import { state, commitBudget, log, shortStr } from './state.js';
import { boardToAscii, moveToStr } from './board.js';
import { cloneBoard, getAllLegalMoves, isInCheck } from './rules.js';
import { extractSpirit, moveToChinese, parseMoveCandidates, parseNumberChoice } from './moves.js';
import { callApi } from './api-client.js';
import { buildBoardPrompt, describePosition, explainIllegal } from './prompts.js';


// ==================== 主走棋模式：模型自由选点 ====================
export async function askForMove(side) {
    const sideName = side==='red' ? '红方' : '黑方';
    const legalSet = new Set(getAllLegalMoves(state.board, side).map(m => moveToStr(m.fromRow,m.fromCol,m.toRow,m.toCol)));
    if (legalSet.size===0) return null;
    const msgs = [
        { role:'system', content: buildBoardPrompt(side) },
        { role:'user', content: `请为${sideName}走出最优一步。` }
    ];
    const baseTok = Math.max(state.apiConfig.moveMaxTokens || 4096, 512);
    let maxTok = Math.max(baseTok, state.effMoveBudget || 0);
    let thinkingNow = state.autoThinkingOff ? 'off' : (state.apiConfig.thinkingMode || 'off');
    let budgetBumped = false;
    const maxAttempts = 3;
    for (let attempt=0; attempt<maxAttempts; attempt++) {
        let res;
        try {
            res = await callApi(msgs, {
                maxTokens: maxTok,
                temperature: 0.3,
                jsonMode: true,
                thinking: thinkingNow,
                thinkingBudget: thinkingNow!=='off' ? THINK_BUDGET : 0,
                timeout: thinkingNow!=='off' ? 90000 : 60000
            });
        } catch(err) {
            log(`API请求失败: ${err.message}`);
            throw err;
        }
        log(`API返回(${attempt+1}/${maxAttempts},思考:${thinkingNow}): ${shortStr(res.content || '(空)', 120)}` +
            (res.reasoning ? ` [思考${res.reasoning.length}字]` : '') +
            ` [finish:${res.finishReason||'?'}]` +
            (res.usage ? ` [tokens:${res.usage.total_tokens}]` : ''));

        // ---- 思考超限自愈：思考未收敛 -> 本步与本局改用关闭思考 ----
        const overthink = !res.content && (res.finishReason==='length' || res.reasoning);
        if (thinkingNow!=='off' && overthink) {
            log('检测到思考超限（思考未收敛），本步改用关闭思考模式重试...');
            thinkingNow = 'off';
            if (!state.autoThinkingOff) { state.autoThinkingOff = true; log('本局后续走棋将自动使用关闭思考（已证实思考模式无法收敛）。'); }
            continue;
        }
        if (thinkingNow==='off' && res.reasoning && !state.thoughtOffWarningLogged) {
            state.thoughtOffWarningLogged = true;
            log('提示：该接口似乎忽略了"关闭思考"参数（仍在思考）。已自动加大token预算并缓存。');
            state.effMoveBudget = Math.max(state.effMoveBudget, 8192);
        }

        // ---- content 为空 ----
        if (!res.content) {
            if ((res.finishReason==='length' || res.reasoning) && !budgetBumped && maxTok < MAX_MOVE_TOKENS) {
                budgetBumped = true;
                maxTok = Math.min(MAX_MOVE_TOKENS, Math.max(maxTok*2, state.effMoveBudget || 0));
                state.effMoveBudget = maxTok;
                log(`content为空且思考吃光预算，max_tokens提升至${maxTok}重试...`);
                continue;
            }
            if (res.finishReason==='length' || res.reasoning) { log('多次提升预算后content仍为空，放弃主模式'); return null; }
            log('模型返回完全为空（无思考内容），请检查API与模型配置');
            msgs.push({ role:'user', content: '你上一条回复为空，请务必输出JSON：{"move":"<4字符坐标>"}' });
            continue;
        }

        // ---- 解析：先content，再reasoning兜底 ----
        let hit = null, hitSource = '';
        const tryCands = (cands, tag) => {
            for (const cand of cands) {
                const key = moveToStr(cand.fromRow,cand.fromCol,cand.toRow,cand.toCol);
                if (legalSet.has(key)) { hit = cand; hitSource = tag; return true; }
            }
            return false;
        };
        tryCands(parseMoveCandidates(res.content, side), 'JSON/坐标/记谱');
        if (!hit && res.reasoning) tryCands(parseMoveCandidates(res.reasoning, side), '思考内容');
        if (hit) {
            commitBudget(maxTok);
            const key = moveToStr(hit.fromRow,hit.fromCol,hit.toRow,hit.toCol);
            const cn = moveToChinese(hit.fromRow,hit.fromCol,hit.toRow,hit.toCol);
            const spirit = extractSpirit(res.content);
            log(`✔ 解析成功（${hitSource}）: ${key}${cn ? ' ' + cn : ''}${spirit!=='serious' ? ' [spirit:'+spirit+']' : ''}`);
            return { move: hit, spirit };
        }

        // ---- 有内容但被截断 ----
        if (res.finishReason==='length' && !budgetBumped && maxTok < MAX_MOVE_TOKENS) {
            budgetBumped = true;
            maxTok = Math.min(MAX_MOVE_TOKENS, maxTok*2);
            state.effMoveBudget = maxTok;
            log(`回复被截断(length)，max_tokens提升至${maxTok}重试...`);
            continue;
        }

        // ---- 反馈重试：告诉模型具体原因 ----
        const cands0 = parseMoveCandidates(res.content, side);
        const cands1 = res.reasoning ? parseMoveCandidates(res.reasoning, side) : [];
        const first = cands0[0] || cands1[0];
        const reason = first ? explainIllegal(first.fromRow,first.fromCol,first.toRow,first.toCol,side) : '无法从回复中识别出任何坐标';
        log(`模型有回复但无法采用（${reason}），携带反馈重试...`);
        msgs.push({ role:'user', content: `你上一条回复「${shortStr(res.content,80)}」无法采用，原因：${reason}。请重新对照棋盘分析，只输出JSON：{"move":"<4字符坐标>"}` });
    }
    return null;
}

// ==================== 降级模式：全量合法走法编号选择 ====================
export async function askByNumber(side) {
    const sideName = side==='red' ? '红方' : '黑方';
    const legalMoves = getAllLegalMoves(state.board, side);
    if (legalMoves.length===0) return null;
    const opp = side==='red' ? 'black' : 'red';
    const items = legalMoves.map((m,i) => {
        const cn = moveToChinese(m.fromRow,m.fromCol,m.toRow,m.toCol) || '';
        const coord = moveToStr(m.fromRow,m.fromCol,m.toRow,m.toCol);
        const captured = state.board[m.toRow][m.toCol];
        let extra='';
        if (captured!==EMPTY) extra = ' [吃' + PIECE_NAMES[captured] + ']';
        const nb = cloneBoard(state.board);
        nb[m.toRow][m.toCol]=nb[m.fromRow][m.fromCol]; nb[m.fromRow][m.fromCol]=EMPTY;
        if (isInCheck(nb, opp)) extra += ' [将军]';
        return `${i+1}. ${cn} (${coord})${extra}`;
    }).join('\n');
    const system = `你是中国象棋AI，执${sideName}。以下是当前棋盘与全部合法走法，请认真评估后选择最优。

${boardToAscii()}

【当前形势】${describePosition(state.board, side)}

【${sideName}全部合法走法】共${legalMoves.length}步（编号. 中文记谱(坐标)[吃子/将军]）：
${items}

【任务】请选出你判断最优的一步。只输出JSON：{"choice":<编号>}。不要输出其他内容。`;
    const msgs = [
        { role:'system', content: system },
        { role:'user', content: `请为${sideName}选择最优走法的编号。` }
    ];
    let maxTok = Math.max(state.apiConfig.moveMaxTokens || 4096, state.effMoveBudget || 0, 512);
    let thinkingNow = state.autoThinkingOff ? 'off' : (state.apiConfig.thinkingMode || 'off');
    for (let attempt=0; attempt<2; attempt++) {
        let res;
        try {
            res = await callApi(msgs, {
                maxTokens: maxTok,
                temperature: 0.3,
                jsonMode: true,
                thinking: thinkingNow,
                thinkingBudget: thinkingNow!=='off' ? THINK_BUDGET : 0,
                timeout: thinkingNow!=='off' ? 90000 : 60000
            });
        } catch(err) {
            log(`编号模式API请求失败: ${err.message}`);
            throw err;
        }
        log(`编号模式API返回(${attempt+1}/2,思考:${thinkingNow}): ${shortStr(res.content || '(空)', 120)}` +
            (res.reasoning ? ` [思考${res.reasoning.length}字]` : '') + ` [finish:${res.finishReason||'?'}]`);
        const fullText = (res.content||'') + '\n' + (res.reasoning||'');
        const idx = parseNumberChoice(fullText, legalMoves.length);
        if (idx>=0 && idx<legalMoves.length) {
            const m = legalMoves[idx];
            commitBudget(maxTok);
            log(`✔ 编号模式解析成功: 第${idx+1}步 ${moveToStr(m.fromRow,m.fromCol,m.toRow,m.toCol)}`);
            return { move: m, spirit: null };
        }
        for (const cand of parseMoveCandidates(fullText, side)) {
            const key = moveToStr(cand.fromRow, cand.fromCol, cand.toRow, cand.toCol);
            const hit = legalMoves.find(m => moveToStr(m.fromRow,m.fromCol,m.toRow,m.toCol)===key);
            if (hit) {
                commitBudget(maxTok);
                log(`✔ 编号模式(坐标/记谱)解析成功: ${key}`);
                return { move: hit, spirit: null };
            }
        }
        // 思考超限自愈
        const overthink = !res.content && (res.finishReason==='length' || res.reasoning);
        if (thinkingNow!=='off' && overthink) {
            log('编号模式检测到思考超限，本步改用关闭思考重试...');
            thinkingNow = 'off';
            if (!state.autoThinkingOff) { state.autoThinkingOff = true; log('本局后续走棋将自动使用关闭思考。'); }
            if (attempt===0) continue;
            return null;
        }
        if (attempt===0 && !res.content && (res.finishReason==='length' || res.reasoning) && maxTok < MAX_MOVE_TOKENS) {
            maxTok = Math.min(MAX_MOVE_TOKENS, maxTok*2);
            state.effMoveBudget = maxTok;
            log(`编号模式content为空，max_tokens提升至${maxTok}重试...`);
            continue;
        }
        if (attempt===0) {
            msgs.push({ role:'user', content: `你的回复「${shortStr(res.content,80)}」无法解析。请只输出JSON：{"choice":<1到${legalMoves.length}的整数>}` });
        }
    }
    return null;
}

export async function aiMoveWithApi() {
    if (state.apiConfig.numberMode) {
        const m = await askByNumber(state.aiSide);
        if (m) return m;
        throw new Error('编号模式失败');
    }
    const main = await askForMove(state.aiSide);
    if (main) return main;
    log('主模式（自由选点）未获得合法走法，降级为全量编号模式...');
    const nb = await askByNumber(state.aiSide);
    if (nb) return nb;
    throw new Error('坐标模式和编号模式均失败');
}

