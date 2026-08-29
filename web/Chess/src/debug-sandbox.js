// ==================== 模型输出沙盒 ====================
// 粘贴任意外部模型回复 → 用本地解析器 + 规则引擎验证，逐条标出合法/非法及原因。
// 依赖游戏逻辑模块（仅在使用时调用，避免加载期耦合）。
import { getSandboxBox, logEvent } from './debug.js';
import { parseMoveCandidates } from './moves.js';
import { isValidMove } from './rules.js';
import { explainIllegal } from './prompts.js';
import { moveToStr } from './board.js';
import { state } from './state.js';

function build() {
    const box = getSandboxBox();
    const sec = document.createElement('div');
    sec.className = 'dbg-sec';
    sec.innerHTML =
        '<div class="dbg-sec-title">🔬 模型输出沙盒（粘贴回复 → 本地解析验证）</div>' +
        '<div class="dbg-sandbox-row">执子方 ' +
        '<select id="dbg-side"><option value="red">红方</option><option value="black">黑方</option></select>' +
        ' <button id="dbg-run" type="button">解析</button>' +
        ' <span id="dbg-hint"></span></div>' +
        '<textarea id="dbg-text" rows="4" placeholder=\'粘贴模型回复，如 {"move":"h9g7"}、炮二平五 或 一段带坐标的文字\'></textarea>' +
        '<div id="dbg-result"></div>';
    box.appendChild(sec);

    const sideSel = sec.querySelector('#dbg-side');
    const textEl = sec.querySelector('#dbg-text');
    const hintEl = sec.querySelector('#dbg-hint');
    const resultEl = sec.querySelector('#dbg-result');

    sec.querySelector('#dbg-run').addEventListener('click', () => {
        const side = sideSel.value;
        const text = textEl.value;
        resultEl.textContent = '';
        if (!text.trim()) { hintEl.textContent = '请先粘贴内容'; return; }
        // 收集候选并去重
        const cands = parseMoveCandidates(text, side);
        const seen = new Set();
        const rows = [];
        for (const c of cands) {
            const key = moveToStr(c.fromRow, c.fromCol, c.toRow, c.toCol);
            if (seen.has(key)) continue;
            seen.add(key);
            const valid = isValidMove(state.board, c.fromRow, c.fromCol, c.toRow, c.toCol, side);
            rows.push({
                key,
                source: c.source || '',
                valid,
                reason: valid ? '' : explainIllegal(c.fromRow, c.fromCol, c.toRow, c.toCol, side)
            });
        }
        if (!rows.length) {
            resultEl.innerHTML = '<div class="dbg-bad">✗ 未能从输入中解析出任何走法（检查棋子字/坐标/JSON格式）</div>';
            hintEl.textContent = '';
            logEvent({ kind: 'sandbox', summary: `沙盒[${side}] 0 候选`, data: { input: text.slice(0, 200) } });
            return;
        }
        const ok = rows.filter(r => r.valid).length;
        let html = '';
        for (const r of rows) {
            html += `<div class="dbg-move ${r.valid ? 'dbg-ok' : 'dbg-bad'}">${r.valid ? '✓' : '✗'} ${r.key}` +
                (r.source ? ` <span class="dbg-src">(${r.source})</span>` : '') +
                (r.reason ? ` <span class="dbg-reason">${r.reason}</span>` : '') + '</div>';
        }
        const summary = `沙盒[${side}] 候选${rows.length} 合法${ok}`;
        resultEl.innerHTML = `<div class="dbg-summary">${summary}</div>` + html;
        hintEl.textContent = '';
        logEvent({ kind: 'sandbox', summary, data: { input: text.slice(0, 200), rows } });
    });
}

build();
