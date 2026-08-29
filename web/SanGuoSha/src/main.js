/* ---------- 最后一批补丁 ---------- */
// 请求弹窗闭包修复：modal 类请求需先取出 pend 再清空 pending
SGS.ui.request = function(player, opts) {
  const G = this.game;
  if (!G || player.ai) return Promise.resolve(null);
  return new Promise(res => {
    this.sel = { cards: [], targets: [], usages: [], usage: null };
    const pend = { player, opts, resolve: v => { this.pending = null; this.refreshAll(); res(v); } };
    this.pending = pend;
    if (['yesNo', 'choose', 'chooseSuit', 'pickCard', 'skill'].includes(opts.type)) {
      this.pending = null;
      this.modalRequest(opts, pend);
    } else {
      this.refreshAll();
    }
  });
};
SGS.ui.modalRequest = function(opts, pend) {
  const box = this.showModal('<div class="panel" style="padding:14px">' +
    '<div style="margin-bottom:12px;font-weight:700;color:var(--gold);letter-spacing:.1em">' + (opts.prompt || '') + '</div>' +
    '<div id="m-body"></div></div>');
  const body = box.querySelector('#m-body');
  if (opts.type === 'yesNo') {
    body.innerHTML = '<button class="btn btn-main" id="m-y">确定</button> <button class="btn btn-ghost" id="m-n">取消</button>';
    body.querySelector('#m-y').onclick = () => { this.closeModal(); pend.resolve(true); };
    body.querySelector('#m-n').onclick = () => { this.closeModal(); pend.resolve(false); };
  } else if (opts.type === 'skill') {
    const s = opts.skill;
    body.innerHTML = '<div style="font-size:13px;color:var(--dim);margin-bottom:10px">' + (s.desc || '') + '</div>' +
      '<button class="btn btn-main" id="m-y">发动【' + s.name + '】</button> <button class="btn btn-ghost" id="m-n">不发动</button>';
    body.querySelector('#m-y').onclick = () => { this.closeModal(); pend.resolve(true); };
    body.querySelector('#m-n').onclick = () => { this.closeModal(); pend.resolve(false); };
  } else if (opts.type === 'chooseSuit') {
    body.innerHTML = (opts.options || ['♠', '♥', '♣', '♦']).map(s =>
      '<button class="btn btn-ghost" data-s="' + s + '" style="font-size:22px;width:56px;margin:4px;' + (s === '♥' || s === '♦' ? 'color:var(--red)' : '') + '">' + s + '</button>').join('');
    body.querySelectorAll('button').forEach(b => b.onclick = () => { this.closeModal(); pend.resolve(b.dataset.s); });
  } else if (opts.type === 'choose') {
    body.innerHTML = (opts.options || []).map((o, i) =>
      '<button class="btn btn-main" data-i="' + i + '" style="margin:4px;display:block;width:100%">' + o + '</button>').join('');
    body.querySelectorAll('button').forEach(b => b.onclick = () => { this.closeModal(); pend.resolve(+b.dataset.i); });
  } else if (opts.type === 'pickCard') {
    body.innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">' +
      opts.options.map((o, i) => '<div data-i="' + i + '" style="cursor:pointer">' + SGS.cardView(o.card) + '</div>').join('') + '</div>';
    body.querySelectorAll('[data-i]').forEach(d => d.onclick = () => { this.closeModal(); pend.resolve(opts.options[+d.dataset.i]); });
  }
};
// 结算画面出现时，清空可能挂起的玩家请求（防死锁）
const _sr = SGS.ui.showResult;
SGS.ui.showResult = function(title) {
  if (this.pending) { const p = this.pending; this.pending = null; p.resolve(null); }
  _sr.call(this, title);
};
// 判定牌展示 1.6 秒后自动关闭
SGS.ui.judgeShow = function(card) {
  clearTimeout(this._judgeT);
  if (this.judgeEl) this.judgeEl.remove();
  const el = make('div', 'judge-card');
  el.id = 'judge-float';
  el.innerHTML = SGS.cardView(card);
  el.style.position = 'fixed';
  el.style.left = '50%';
  el.style.top = '30%';
  el.style.transform = 'translateX(-50%)';
  el.style.zIndex = '115';
  document.body.appendChild(el);
  this.judgeEl = el;
  this._judgeT = setTimeout(() => { if (this.judgeEl) { this.judgeEl.remove(); this.judgeEl = null; } }, 1600);
};
SGS.ui.judgeHide = function() { /* 由计时器自动关闭 */ };
// 座位未渲染时跳过摸牌特效
const _fd = SGS.ui.fxDraw;
SGS.ui.fxDraw = function(p, n) {
  if (!this.seatEls || !this.seatEls[p.seat]) return;
  _fd.call(this, p, n);
};
// 自定义武将数据净化 + 菜单选中态
const _ag = SGS.allGenerals;
SGS.allGenerals = function() {
  return SGS.GENERALS.concat(SGS.customStore.load().filter(g => g && g.name && Array.isArray(g.skills)));
};
const _rcg = SGS.editor.refreshCharGrid;
SGS.editor.refreshCharGrid = function() {
  _rcg.call(this);
  if (SGS.menuPick && SGS.menuPick.general) {
    const el = document.querySelector('.char-card[data-name="' + SGS.menuPick.general.name + '"]');
    if (el) el.classList.add('picked');
  }
};
// 保存时校验技能名不重复
const _sg = SGS.editor.saveGeneral;
SGS.editor.saveGeneral = function() {
  const g = this.collectGeneral();
  if (!g) return;
  const names = g.skills.map(s => s.name);
  if (new Set(names).size !== names.length) { SGS.toast('技能名不能重复'); return; }
  return _sg.call(this);
};
/* ---------- 被动/锁定技台词：拥有者回合开始时播报 ---------- */
SGS.bus.on('phaseTurnStart', ctx => {
  const p = ctx.player;
  if (!p) return;
  const sk = (p.general.skills || []).find(s => (s.type === 'passive' || s.skillClass === 'locked') && s.quote);
  if (sk && (p.human || Math.random() < 0.45)) setTimeout(() => SGS.ui.say(p, sk.quote), 350);
});
/* ---------- 主菜单 ---------- */
SGS.menuPick = { general: null };
SGS.menuRefresh = function() {
  SGS.editor.refreshCharGrid();
  if (!SGS.menuPick.general) {
    const all = SGS.allGenerals();
    SGS.menuPick.general = all[0] || null;
  }
  if (SGS.menuPick.general) {
    const el = document.querySelector('.char-card[data-name="' + SGS.menuPick.general.name + '"]');
    if (el) el.classList.add('picked');
  }
};
document.querySelectorAll('.mode-btn').forEach(b => {
  b.addEventListener('click', () => {
    const g = SGS.menuPick.general || SGS.allGenerals()[0];
    if (g) SGS.startGame(b.dataset.mode, g);
    else SGS.toast('请先在下方选择武将');
  });
});
$('char-select').addEventListener('click', e => {
  const el = e.target.closest('.char-card');
  if (!el) return;
  const g = SGS.allGenerals().find(x => x.name === el.dataset.name);
  if (g) {
    SGS.menuPick.general = g;
    SGS.menuRefresh();
    SGS.toast('已选择武将：' + g.name + '（' + (g.skills || []).map(s => s.name).join('、') + '）');
  }
});
/* ---------- 开局 ---------- */
SGS.lastGame = null;
SGS.startGame = async function(mode, humanG) {
  humanG = humanG || SGS.menuPick.general || SGS.allGenerals()[0];
  // 清理上一局的监听器与 AI 观察者（防内存泄漏）
  if (SGS.lastGame) SGS.lastGame.players.forEach(p => SGS.bus.offPlayer(p));
  SGS.AI.reset();
  const all = SGS.allGenerals();
  const pool = SGS.shuffle(all.filter(g => g.name !== humanG.name));
  const nAI = mode === '1v1' ? 1 : mode === '2v2' ? 3 : 7;
  const aiGenerals = pool.slice(0, nAI);
  const game = new SGS.Game();
  SGS.game = game;
  game.ui = SGS.ui;
  await game.init(mode, { humanGeneral: humanG, aiGenerals });
  // 主公身份对全场公开
  if (mode === '8p') {
    const lord = game.players.find(p => p.identity === 'lord');
    if (lord) lord.revealed = true;
  }
  SGS.ui.bind(game);
  SGS.lastGame = game;
  SGS.showScreen('screen-game');
  await game.start();
};
/* ---------- 启动 ---------- */
SGS.menuRefresh();
SGS.showScreen('screen-menu');
console.log('√ 段9 已加载，游戏可运行');
