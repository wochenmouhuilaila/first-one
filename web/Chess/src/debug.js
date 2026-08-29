// ==================== LLM 调试面板 ====================
// 叶子模块：只记录事件并渲染面板，不依赖任何游戏逻辑模块。
// 开启方式：URL 加 ?debug=1，或点击页面上"🔍 调试"按钮。
const MAX_EVENTS = 300;
const events = [];
let enabled = typeof location !== 'undefined' && new URLSearchParams(location.search).get('debug') === '1';
let panel = null, bodyEl = null, countEl = null;

function ensurePanel() {
    if (panel) return;
    panel = document.createElement('div');
    panel.id = 'dbg-panel';
    panel.innerHTML =
        '<div id="dbg-head">🛠 LLM 调试' +
        ' <span id="dbg-count" class="dbg-count"></span>' +
        ' <button id="dbg-clear" type="button">清空</button>' +
        ' <button id="dbg-close" type="button">×</button>' +
        '</div>' +
        '<div id="dbg-body"></div>' +
        '<div id="dbg-sandbox"></div>';
    document.body.appendChild(panel);
    bodyEl = panel.querySelector('#dbg-body');
    countEl = panel.querySelector('#dbg-count');
    panel.querySelector('#dbg-clear').addEventListener('click', () => {
        events.length = 0;
        render();
    });
    panel.querySelector('#dbg-close').addEventListener('click', () => setEnabled(false));
}

function fmtTime(t) {
    const d = new Date(t);
    return d.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function render() {
    if (!bodyEl) return;
    bodyEl.textContent = '';
    for (const ev of events.slice(-80)) {
        const det = document.createElement('details');
        det.className = 'dbg-row';
        const sum = document.createElement('summary');
        const badge = document.createElement('span');
        badge.className = 'dbg-kind dbg-' + ev.kind;
        badge.textContent = ev.kind.toUpperCase();
        sum.appendChild(badge);
        sum.appendChild(document.createTextNode(` ${fmtTime(ev.t)} ${ev.summary || ''}`));
        det.appendChild(sum);
        const pre = document.createElement('pre');
        pre.className = 'dbg-pre';
        let s = JSON.stringify(ev.data, null, 2);
        if (s.length > 8000) s = s.slice(0, 8000) + '\n…(已截断)';
        pre.textContent = s;
        det.appendChild(pre);
        bodyEl.appendChild(det);
    }
    if (countEl) countEl.textContent = `(${events.length})`;
}

// 游戏各模块调用：追加一条调试事件（rec: {kind, summary, data}）
export function logEvent(rec) {
    events.push({ t: Date.now(), kind: rec.kind || 'info', summary: rec.summary || '', data: rec.data || {} });
    if (events.length > MAX_EVENTS) events.shift();
    if (enabled) render();
}

export function setEnabled(v) {
    enabled = !!v;
    if (enabled) {
        ensurePanel();
        panel.style.display = 'block';
        render();
    } else if (panel) {
        panel.style.display = 'none';
    }
}

export function isEnabled() { return enabled; }

// 只读访问全部事件（供测试/控制台使用）
export function getEvents() { return events.slice(); }

// 供沙盒等子面板挂载的位置
export function getSandboxBox() {
    ensurePanel();
    return panel.querySelector('#dbg-sandbox');
}

// ---- 入口：绑定调试按钮 + URL ?debug=1 自动开启 ----
const btn = document.getElementById('btnDebug');
if (btn) btn.addEventListener('click', () => setEnabled(!enabled));
if (enabled) setEnabled(true);
