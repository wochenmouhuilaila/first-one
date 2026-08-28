(function(){
try{
/* ============ S1 引擎：嵌套效果目标解析（修复判定/分支子效果失效） ============ */
SGS.FX.execSeq = async function(list, ctx) {
 for (const e of list || []) {
  if (!e || !SGS.FX[e.op]) continue;
  const arr = Array.isArray(ctx.target) ? ctx.target : (ctx.target ? [ctx.target] : []);
  const sctx = { game: ctx.game, self: ctx.owner, targets: arr, target: arr[0] || ctx.owner, source: ctx.source };
  const t = SGS.skills.resolveTarget(e, sctx);
  await SGS.FX[e.op](Object.assign({}, ctx, e, { target: t }));
 }
};
SGS.FX.judge = async ctx => {
 const who = Array.isArray(ctx.target) ? ctx.target[0] : (ctx.target || ctx.owner);
 const card = await ctx.game.judge(who, ctx.reason || ('【' + (ctx.skill && ctx.skill.name || '技能') + '】判定'));
 const red = card.suit === '♥' || card.suit === '♦';
 let pass = false;
 if (ctx.on === 'red') pass = red;
 else if (ctx.on === 'black') pass = !red;
 else if (ctx.on === 'heart') pass = card.suit === '♥';
 else if (ctx.on === 'diamond') pass = card.suit === '♦';
 else if (ctx.on === 'spade') pass = card.suit === '♠';
 else if (ctx.on === 'club') pass = card.suit === '♣';
 else if (ctx.on === 'numGE8') pass = card.num >= 8;
 const list = pass ? ctx.then : ctx.else;
 if (list && list.length) await SGS.FX.execSeq(list, Object.assign({}, ctx, { lastJudge: card }));
};
SGS.FX['if'] = async ctx => {
 const tgt = Array.isArray(ctx.target) ? ctx.target[0] : ctx.target;
 const c = SGS.cond.check(ctx.cond, {
  game: ctx.game, self: ctx.owner, target: tgt, source: ctx.source,
  card: ctx.card, lastJudge: ctx.lastJudge, data: ctx.data,
  skillSt: ctx.skillSt, paid: ctx.paid || 0
 });
 await SGS.FX.execSeq(c ? ctx.then : ctx.else, ctx);
};

/* ============ S2 引擎：新效果原子 ============ */
var FX = SGS.FX;
FX.loseMark = async ctx => {
 for (const t of (Array.isArray(ctx.target) ? ctx.target : [ctx.target])) {
  const mk = ctx.mark || '权';
  t.marks[mk] = Math.max(0, (t.marks[mk] || 0) - (ctx.count || ctx.n || 1));
 }
};
FX.loseMaxHp = async ctx => {
 for (const t of (Array.isArray(ctx.target) ? ctx.target : [ctx.target])) {
  t.maxHp = Math.max(1, t.maxHp - (ctx.count || ctx.n || 1));
  t.hp = Math.min(t.hp, t.maxHp);
  ctx.game.log(t.name + ' 体力上限变为 ' + t.maxHp);
  if (t.hp <= 0) await ctx.game.checkDying(t, null);
 }
};
FX.swapHands = async ctx => {
 const a = ctx.owner;
 for (const b of (Array.isArray(ctx.target) ? ctx.target : [ctx.target])) {
  if (!b || b === a) continue;
  const tmp = a.hand; a.hand = b.hand; b.hand = tmp;
  a.hand.forEach(c => { c.owner = a; }); b.hand.forEach(c => { c.owner = b; });
  ctx.game.log(a.name + ' 与 ' + b.name + ' 交换了手牌');
 }
};
FX.transferDamage = async ctx => {
 const d = ctx.dmg || (ctx.data && ctx.data.dmg);
 const t = (Array.isArray(ctx.target) ? ctx.target : [ctx.target])[0];
 if (d && t && d.to !== t) { d.to = t; ctx.game.log('伤害转移给了 ' + t.name); }
};
FX.peekDeck = async ctx => {
 const n = Math.min(ctx.count || ctx.n || 1, ctx.game.deck.length);
 if (!n) return;
 const cards = ctx.game.deck.slice(-n).reverse();
 if (ctx.owner.ai) ctx.game.log(ctx.owner.name + ' 观看了牌堆顶 ' + n + ' 张牌');
 else if (ctx.game.ui) ctx.game.ui.showCards('牌堆顶 ' + n + ' 张', cards, false);
};
FX.putOnDeck = async ctx => {
 const n = Math.min(ctx.count || ctx.n || 1, ctx.owner.hand.length);
 if (!n) return;
 let cards;
 if (ctx.owner.ai) cards = SGS.AI.pickDiscard(ctx.owner, n);
 else cards = await SGS.req(ctx.game, ctx.owner, { type: 'pickCards', n, prompt: '选择 ' + n + ' 张手牌置于牌堆' });
 if (!cards || !cards.length) return;
 let pos = 'top';
 if (!ctx.owner.ai) {
  const ch = await SGS.req(ctx.game, ctx.owner, { type: 'choose', options: ['牌堆顶', '牌堆底'], prompt: '置于何处？' });
  if (ch === 1) pos = 'bottom';
 }
 for (const c of cards) {
  ctx.game.removeFromZone(c);
  c.zone = 'deck'; c.owner = null;
  if (pos === 'top') ctx.game.deck.push(c); else ctx.game.deck.unshift(c);
 }
 ctx.game.log(ctx.owner.name + ' 将 ' + cards.length + ' 张牌置于牌堆' + (pos === 'top' ? '顶' : '底'));
};
FX.stealEach = async ctx => {
 const n = ctx.count || ctx.n || 1;
 for (const t of (Array.isArray(ctx.target) ? ctx.target : [ctx.target])) {
  if (!t || t === ctx.owner || !t.alive) continue;
  const options = [];
  t.hand.forEach(c => options.push({ card: c, zone: 'hand' }));
  ['weapon', 'armor', 'horseP', 'horseM'].forEach(k => { if (t.equips[k]) options.push({ card: t.equips[k], zone: 'equip' }); });
  t.judges.forEach(c => options.push({ card: c, zone: 'judge' }));
  if (!options.length) continue;
  let sel;
  if (ctx.owner.ai) sel = options.slice().sort((a, b) => SGS.AI.cardValue(a.card, ctx.owner) - SGS.AI.cardValue(b.card, ctx.owner)).slice(0, Math.min(n, options.length));
  else sel = await SGS.req(ctx.game, ctx.owner, { type: 'pickCardsFrom', options, max: Math.min(n, options.length), prompt: '从 ' + t.name + ' 处选择 ' + Math.min(n, options.length) + ' 张获得' });
  if (!sel || !sel.length) continue;
  for (const o of sel) await ctx.game.moveCard(o.card, t, o.zone, ctx.owner, 'hand', '技能获得');
 }
};
FX.showHand = async ctx => {
 for (const t of (Array.isArray(ctx.target) ? ctx.target : [ctx.target])) {
  if (t && t.hand.length && ctx.game.ui) ctx.game.ui.showCards(t.name + ' 的手牌', t.hand.slice(), false);
 }
};
FX.choose = async ctx => {
 let ch;
 if (ctx.owner.ai) ch = 0;
 else ch = await SGS.req(ctx.game, ctx.owner, { type: 'choose', options: [ctx.optA || '选项一', ctx.optB || '选项二'], prompt: ctx.prompt || '请选择' });
 await SGS.FX.execSeq(ch === 1 ? ctx.else : ctx.then, ctx);
};

/* ============ S3 引擎：新目标规则 ============ */
SGS.__enemies = function(game, p) {
 if (game.mode === '8p') {
  const side = p.identity === 'lord' || p.identity === 'loyal';
  return game.players.filter(q => q.alive && (side ? (q.identity === 'rebel' || q.identity === 'renegade') : (q.identity === 'lord' || q.identity === 'loyal')));
 }
 if (game.mode === '2v2') return game.players.filter(q => q.alive && q.team !== p.team);
 return game.players.filter(q => q.alive && q !== p);
};
SGS.__allies = function(game, p) {
 if (game.mode === '8p') {
  const side = p.identity === 'lord' || p.identity === 'loyal';
  return game.players.filter(q => q.alive && q !== p && (side ? (q.identity === 'lord' || q.identity === 'loyal') : (q.identity === 'rebel' || q.identity === 'renegade')));
 }
 if (game.mode === '2v2') return game.players.filter(q => q.alive && q !== p && q.team === p.team);
 return [p];
};
var _ct4 = SGS.skills.chooseTargets;
SGS.skills.chooseTargets = async function(game, player, skill, sctx, tr) {
 if (tr && tr.type) {
  const T = tr.type;
  const alive = game.players.filter(p => p.alive);
  const others = alive.filter(p => p !== player);
  const ok = p => !tr.filter || SGS.cond.check(tr.filter, Object.assign({}, sctx, { target: p }));
  if (T === 'lowestHp') { const m = Math.min.apply(null, others.map(p => p.hp)); const f = others.filter(p => p.hp === m && ok(p)); return f.length ? f : false; }
  if (T === 'highestHp') { const m = Math.max.apply(null, others.map(p => p.hp)); const f = others.filter(p => p.hp === m && ok(p)); return f.length ? f : false; }
  if (T === 'mostHand') { const m = Math.max.apply(null, others.map(p => p.hand.length)); const f = others.filter(p => p.hand.length === m && ok(p)); return f.length ? f : false; }
  if (T === 'fewestHand') { const m = Math.min.apply(null, others.map(p => p.hand.length)); const f = others.filter(p => p.hand.length === m && ok(p)); return f.length ? f : false; }
  if (T === 'injured') { const f = others.filter(p => p.hp < p.maxHp && ok(p)); return f.length ? f : false; }
  if (T === 'hasCards') { const f = others.filter(p => (p.hand.length || game.countEquips(p) || p.judges.length) && ok(p)); return f.length ? f : false; }
  if (T === 'nearest') { let best = null, bd = 1e9; for (const q of others.filter(ok)) { const d = await game.distance(player, q); if (d < bd) { bd = d; best = q; } } return best ? [best] : false; }
  if (T === 'allEnemies') { const f = SGS.__enemies(game, player).filter(ok); return f.length ? f : false; }
  if (T === 'allAllies') { const f = SGS.__allies(game, player).filter(ok); return f.length ? f : false; }
 }
 return _ct4.call(this, game, player, skill, sctx, tr);
};
var _rt2 = SGS.skills.resolveTarget;
SGS.skills.resolveTarget = function(ef, sctx) {
 const ty = ef && ef.target;
 if (ty === 'allEnemies') return SGS.__enemies(sctx.game, sctx.self);
 if (ty === 'allAllies') return SGS.__allies(sctx.game, sctx.self);
 if (ty) {
  const list = sctx.game.players.filter(p => p.alive && p !== sctx.self);
  if (ty === 'lowestHp') { const m = Math.min.apply(null, list.map(p => p.hp)); const f = list.filter(p => p.hp === m); return f[0] || []; }
  if (ty === 'highestHp') { const m = Math.max.apply(null, list.map(p => p.hp)); const f = list.filter(p => p.hp === m); return f[0] || []; }
  if (ty === 'mostHand') { const m = Math.max.apply(null, list.map(p => p.hand.length)); const f = list.filter(p => p.hand.length === m); return f[0] || []; }
  if (ty === 'fewestHand') { const m = Math.min.apply(null, list.map(p => p.hand.length)); const f = list.filter(p => p.hand.length === m); return f[0] || []; }
  if (ty === 'injured') { const f = list.filter(p => p.hp < p.maxHp); return f[0] || []; }
  if (ty === 'hasCards') { const f = list.filter(p => p.hand.length || sctx.game.countEquips(p) || p.judges.length); return f[0] || []; }
 }
 return _rt2.call(this, ef, sctx);
};

/* ============ S4 条件变量：mark ============ */
var _mkg2 = SGS.cond.mkGetter;
SGS.cond.mkGetter = function(ctx) {
 const base = _mkg2.call(this, ctx);
 const markOf = e => e && e.marks ? Object.keys(e.marks).reduce((s, k) => s + (e.marks[k] || 0), 0) : 0;
 return function(path) {
  if (path === 'mark') return markOf(ctx.self);
  if (path === 'target.mark') return markOf(ctx.target);
  if (path === 'source.mark') return markOf(ctx.source);
  return base(path);
 };
};

/* ============ S5 编辑器：选项表扩展 ============ */
(function(){
 var E = SGS.editor;
 E.EFFECT_OPTS.push(
  ['loseMark', '失去标记'], ['loseMaxHp', '失去体力上限'], ['swapHands', '交换手牌'],
  ['transferDamage', '转移此伤害'], ['peekDeck', '观看牌堆顶'], ['putOnDeck', '手牌置于牌堆'],
  ['stealEach', '各获得其一张牌'], ['showHand', '展示其手牌'],
  ['if', '条件分支(if)'], ['choose', '二选一(choose)']
 );
 E.TARGET_OPTS.push(
  ['lowestHp', '体力最低者'], ['highestHp', '体力最高者'], ['mostHand', '手牌最多者'],
  ['fewestHand', '手牌最少者'], ['nearest', '距离最近者'], ['injured', '已受伤角色'],
  ['hasCards', '有牌的角色'], ['allEnemies', '所有敌方'], ['allAllies', '所有友方']
 );
 var stSel = $('sk-target');
 if (stSel) {
  [['lowestHp', '体力最低者'], ['highestHp', '体力最高者'], ['mostHand', '手牌最多者'], ['fewestHand', '手牌最少者'], ['nearest', '距离最近者'], ['injured', '已受伤角色'], ['hasCards', '有牌的角色'], ['allEnemies', '所有敌方'], ['allAllies', '所有友方']].forEach(function(p) {
   var o = document.createElement('option'); o.value = p[0]; o.textContent = p[1]; stSel.appendChild(o);
  });
 }
 var cp = $('sk-cond-preset');
 if (cp) {
  [['mark>=1', '有标记时'], ['mark>=3', '标记≥3时'], ['lostHp>=1', '已受伤时'], ['target.hp<=2', '目标体力≤2时'], ['card.isRed', '牌为红色时'], ['handCount>=hp', '手牌≥体力时']].forEach(function(p) {
   var o = document.createElement('option'); o.value = p[0]; o.textContent = p[1]; cp.appendChild(o);
  });
 }
 var _et2 = E.effectText;
 E.effectText = function(e) {
  const n = e.delta !== undefined ? e.delta : (e.count || 1);
  const mk = e.mark || '权';
  switch (e.op) {
   case 'loseMark': return '失去' + n + '个「' + mk + '」标记';
   case 'loseMaxHp': return '失去' + n + '点体力上限';
   case 'swapHands': return '与其交换手牌';
   case 'transferDamage': return '将此伤害转移';
   case 'peekDeck': return '观看牌堆顶' + n + '张牌';
   case 'putOnDeck': return '将' + n + '张手牌置于牌堆顶/底';
   case 'stealEach': return '获得其各' + n + '张牌';
   case 'showHand': return '展示其手牌';
   case 'if': return '若(' + (e.cond || '条件') + ')则' + (e.then && e.then[0] ? this.effectText(e.then[0]) : '无') + '，否则' + (e.else && e.else[0] ? this.effectText(e.else[0]) : '无');
   case 'choose': return '二选一：' + (e.optA || '甲') + ' / ' + (e.optB || '乙');
  }
  return _et2.call(this, e);
 };
 var _gd = E.genDesc;
 E.genDesc = function(skill) {
  const TT = { lowestHp: '令体力最低的角色，', highestHp: '令体力最高的角色，', mostHand: '令手牌最多的角色，', fewestHand: '令手牌最少的角色，', nearest: '令距离最近的角色，', injured: '令已受伤的角色，', hasCards: '令有牌的角色，', allEnemies: '令所有敌方角色，', allAllies: '令所有友方角色' };
  const rt = skill.targetRule && skill.targetRule.type;
  if (rt && TT[rt]) {
   const saved = skill.targetRule.type;
   skill.targetRule.type = 'other';
   const d = _gd.call(this, skill);
   skill.targetRule.type = saved;
   return d.replace('选择一名其他角色，', TT[rt]);
  }
  return _gd.call(this, skill);
 };
})();

/* ============ S6 编辑器：效果行增强（分支/二选一/@cost） ============ */
(function(){
 var E = SGS.editor;
 var _ber2 = E.buildEffectRow;
 E.buildEffectRow = function(e) {
  e = e || { op: 'draw', target: 'self', count: 1 };
  var row = _ber2.call(this, e);
  var __sync = function() {
   var old = row.querySelector('.ef-ext');
   if (old) old.remove();
   var os = row.querySelector('.ef-op');
   if (!os) return;
   var op = os.value;
   var nm = row.querySelector('.ef-num');
   if (nm) {
    if (['if', 'choose', 'swapHands', 'transferDamage', 'showHand'].indexOf(op) >= 0) nm.style.display = 'none';
    else if (e.count === '@cost') { nm.type = 'text'; nm.value = '@cost'; nm.title = '输入 @cost 表示与消耗量相等'; }
   }
   var ts = row.querySelector('.ef-target');
   if (ts && (op === 'if' || op === 'choose')) ts.style.display = 'none';
   if ((op === 'gainMark' || op === 'loseMark') && !row.querySelector('.ef-mark')) {
    var mi = document.createElement('input');
    mi.className = 'ef-mark';
    mi.placeholder = '标记名';
    mi.value = e.mark || '';
    mi.style.cssText = 'width:64px;margin-left:4px';
    mi.addEventListener('change', function() { row.collect(); E.refreshPreview(); });
    (ts || os).after(mi);
   }
   if (op === 'if' || op === 'choose') {
    var ext = document.createElement('div');
    ext.className = 'ef-ext';
    ext.style.cssText = 'width:100%;margin-top:6px;padding:6px 8px;border-left:3px solid #5d4c33;background:rgba(255,255,255,.03);border-radius:6px';
    if (op === 'if') {
     var hint = document.createElement('div');
     hint.style.cssText = 'font-size:11px;color:#a6977c;margin-bottom:4px';
     hint.textContent = '条件可用: hp maxHp lostHp handCount mark target.hp target.handCount card.isRed card.isBlack card.suit card.num phase turn usedSha distance aliveCount state';
     ext.appendChild(hint);
     var ci = document.createElement('input');
     ci.className = 'if-cond';
     ci.placeholder = '如 handCount>=hp 或 mark>=2 或 card.isRed';
     ci.style.cssText = 'width:72%;margin-right:6px';
     ci.value = e.cond || '';
     ci.addEventListener('input', function() { E.refreshPreview(); });
     ext.appendChild(ci);
    } else {
     var oa = document.createElement('input');
     oa.className = 'ch-a';
     oa.placeholder = '选项一描述';
     oa.value = e.optA || '';
     oa.style.cssText = 'width:40%;margin-right:8px';
     var ob = document.createElement('input');
     ob.className = 'ch-b';
     ob.placeholder = '选项二描述';
     ob.value = e.optB || '';
     ob.style.cssText = 'width:40%';
     oa.addEventListener('input', function() { E.refreshPreview(); });
     ob.addEventListener('input', function() { E.refreshPreview(); });
     ext.appendChild(oa); ext.appendChild(ob);
    }
    var mk2 = function(cls, label) {
     var d = document.createElement('div');
     d.innerHTML = '<div style="font-size:11px;color:#a6977c;margin:4px 0 2px">' + label + '</div>';
     var list = document.createElement('div');
     list.className = cls;
     list.style.cssText = 'display:flex;flex-direction:column;gap:4px';
     d.appendChild(list);
     var btn = document.createElement('button');
     btn.type = 'button';
     btn.className = 'btn btn-ghost btn-sm';
     btn.textContent = '＋ 添加效果';
     btn.onclick = function() {
      list.appendChild(E.buildEffectRow({ op: 'draw', target: 'self', count: 1 }));
      E.refreshPreview();
     };
     d.appendChild(btn);
     return { d: d, list: list };
    };
    var a = mk2('sub-then', op === 'if' ? '满足条件时执行' : '选择「一」时执行');
    var b = mk2('sub-else', op === 'if' ? '不满足时执行' : '选择「二」时执行');
    ext.appendChild(a.d); ext.appendChild(b.d);
    (e.then || []).forEach(function(x) { a.list.appendChild(E.buildEffectRow(SGS.deepClone(x))); });
    (e.else || []).forEach(function(x) { b.list.appendChild(E.buildEffectRow(SGS.deepClone(x))); });
    row.appendChild(ext);
   }
  };
  row.querySelector('.ef-op').addEventListener('change', function() { __sync(); });
  __sync();
  var base = row.collect;
  row.collect = function() {
   var e2 = base.call(this);
   var nm2 = row.querySelector('.ef-num');
   if (nm2 && String(nm2.value).trim() === '@cost') e2.count = '@cost';
   var ext2 = row.querySelector('.ef-ext');
   if (ext2) {
    var ci2 = ext2.querySelector('.if-cond');
    if (ci2) e2.cond = ci2.value.trim() || 'always';
    var oa2 = ext2.querySelector('.ch-a'), ob2 = ext2.querySelector('.ch-b');
    if (oa2) { e2.optA = oa2.value.trim() || '选项一'; e2.optB = ob2.value.trim() || '选项二'; }
    var la = ext2.querySelector('.sub-then');
    if (la) e2.then = Array.prototype.slice.call(la.children).filter(function(x) { return x.classList.contains('effect-row'); }).map(function(r) { return r.collect(); });
    var lb = ext2.querySelector('.sub-else');
    if (lb) e2.else = Array.prototype.slice.call(lb.children).filter(function(x) { return x.classList.contains('effect-row'); }).map(function(r) { return r.collect(); });
   }
   return e2;
  };
  return row;
 };
 var _cs2 = E.collectSkill;
 E.collectSkill = function() {
  var sk = _cs2.call(this);
  sk.effects = Array.prototype.slice.call(($('sk-effects') || { children: [] }).children).filter(function(x) { return x.classList.contains('effect-row'); }).map(function(r) { return r.collect(); }).filter(Boolean);
  return sk;
 };
})();

/* ============ S7 模板库 ============ */
(function(){
 var E = SGS.editor;
 E.TEMPLATES = {
  yiji: { name: '遗计（受伤后摸2）', type: 'triggered', trigger: 'damageTaken', auto: true, limit: { scope: 'turn', max: 1 }, effects: [{ op: 'draw', target: 'self', count: 2 }] },
  fankui: { name: '反馈（获伤害来源一张牌）', type: 'triggered', trigger: 'damageTaken', auto: true, effects: [{ op: 'stealFrom', target: 'source', count: 1 }] },
  zhiheng: { name: '制衡（弃几摸几）', type: 'active', cost: { type: 'discardAny' }, effects: [{ op: 'draw', target: 'self', count: '@cost' }] },
  tuxi: { name: '突袭（拿两名角色各一张）', type: 'triggered', trigger: 'phaseDrawStart', auto: true, targetRule: { type: 'other2' }, limit: { scope: 'turn', max: 1 }, effects: [{ op: 'drawFromOthers', target: 'targets', count: 2 }] },
  qingnang: { name: '青囊（回复一名角色1体力）', type: 'active', targetRule: { type: 'other' }, limit: { scope: 'turn', max: 1 }, effects: [{ op: 'recoverHp', target: 'target', count: 1 }] },
  jiang: { name: '激昂（成为杀目标后摸1）', type: 'triggered', trigger: 'cardTargetAfter', subj: 'target', auto: true, effects: [{ op: 'draw', target: 'self', count: 1 }] },
  luoshen: { name: '洛神·简（准备阶段判定黑摸1）', type: 'triggered', trigger: 'phasePrepareStart', auto: true, effects: [{ op: 'judge', target: 'self', on: 'black', then: [{ op: 'draw', target: 'self', count: 1 }] }] },
  biyue: { name: '闭月（结束阶段摸1）', type: 'triggered', trigger: 'phaseTurnEnd', auto: true, effects: [{ op: 'draw', target: 'self', count: 1 }] },
  rende: { name: '仁德（交给一名角色手牌）', type: 'active', cost: { type: 'give', min: 1 }, targetRule: { type: 'any' }, effects: [] },
  kurou: { name: '苦肉（失去1体力摸2）', type: 'active', cost: { type: 'loseHp', n: 1 }, effects: [{ op: 'draw', target: 'self', count: 2 }] },
  wushuang: { name: '无双（对手响应需多打1张）', type: 'passive', modify: { op: 'responsePlus', delta: 1 } },
  yingzi: { name: '英姿（摸牌阶段+1）', type: 'passive', modify: { op: 'drawCount', delta: 1 } },
  mashu: { name: '马术（距离-1）', type: 'passive', modify: { op: 'distance', delta: -1 } },
  tieji: { name: '铁骑（判定红则封闪）', type: 'triggered', trigger: 'cardTargetAfter', auto: true, effects: [{ op: 'judge', target: 'self', on: 'red', then: [{ op: 'ironBlock', target: 'target' }] }] },
  jiushi: { name: '酒诗（翻面并回复1）', type: 'active', effects: [{ op: 'flip', target: 'self' }, { op: 'recoverHp', target: 'self', count: 1 }] },
  guose: { name: '国色（方块牌当乐不思蜀）', type: 'conversion', convert: [{ as: '乐不思蜀', filter: { op: 'isSuit', suit: '♦' }, when: 'any' }] },
  dimeng: { name: '缔盟（与目标交换手牌）', type: 'active', targetRule: { type: 'other' }, limit: { scope: 'turn', max: 1 }, effects: [{ op: 'swapHands', target: 'target' }] },
  guixin: { name: '归心（各角色拿一张并翻面）', type: 'triggered', trigger: 'damageTaken', auto: true, targetRule: { type: 'allOthers' }, effects: [{ op: 'stealEach', target: 'allOthers', count: 1 }, { op: 'flip', target: 'self' }] },
  mingce: { name: '明策（二选一示例）', type: 'active', targetRule: { type: 'other' }, limit: { scope: 'turn', max: 1 }, effects: [{ op: 'choose', optA: '对其造成1点伤害', optB: '自己摸一张牌', then: [{ op: 'dealDamage', target: 'target', count: 1 }], else: [{ op: 'draw', target: 'self', count: 1 }] }] },
  buzhi: { name: '不屈·简（濒死判定救回）', type: 'triggered', trigger: 'nearDeathEnter', auto: true, limit: { scope: 'turn', max: 1 }, effects: [{ op: 'judge', target: 'self', on: 'numGE8', then: [{ op: 'recoverHp', target: 'self', count: 1 }] }] }
 };
 E.applyTemplate = function(key) {
  var T = this.TEMPLATES[key];
  if (!T) return;
  $('sk-type').value = T.type || 'active';
  $('sk-name').value = T.name || '';
  $('sk-class').value = T.skillClass || 'normal';
  var trg = $('sk-trigger'); if (trg && T.trigger) trg.value = T.trigger;
  var subj = $('sk-subj'); if (subj) subj.value = T.subj || '';
  var au = $('sk-auto'); if (au) au.checked = T.auto !== false;
  var lim = $('sk-limit');
  if (lim) { lim.value = T.limit ? T.limit.scope : 'never'; if ($('sk-limit-max')) $('sk-limit-max').value = T.limit ? (T.limit.max || 1) : 1; }
  var ct = $('sk-cost');
  if (ct) { ct.value = (T.cost && T.cost.type) || 'none'; this.rebuildCostN(); if ($('sk-cost-n') && T.cost) $('sk-cost-n').value = T.cost.n || T.cost.min || 1; }
  var tt = $('sk-target'); if (tt) tt.value = (T.targetRule && T.targetRule.type) || 'self';
  if ($('sk-target-filter')) $('sk-target-filter').value = '';
  if ($('sk-cond')) $('sk-cond').value = '';
  if ($('sk-quote')) $('sk-quote').value = '';
  $('sk-effects').innerHTML = '';
  (T.effects || []).forEach(function(ef) { $('sk-effects').appendChild(SGS.editor.buildEffectRow(SGS.deepClone(ef))); });
  $('cv-rows').innerHTML = '';
  (T.convert || []).forEach(function(cv) { SGS.editor.addConvertRow(SGS.deepClone(cv)); });
  if (T.modify && $('pm-op')) { $('pm-op').value = T.modify.op; if ($('pm-delta')) $('pm-delta').value = T.modify.delta; this.togglePassiveUI(); }
  this.toggleTypeUI();
  this.renderSkillList();
  this.refreshPreview();
  SGS.toast('已套用模板「' + T.name + '」，可继续微调');
 };
 var nmF = $('sk-name');
 if (nmF && nmF.parentElement) {
  var w = document.createElement('div');
  w.className = 'ed-field';
  w.innerHTML = '<label>技能模板</label><select id="sk-template"></select><button type="button" class="btn btn-ghost btn-sm" id="sk-tpl-go" style="margin-left:6px">套用</button>';
  nmF.parentElement.after(w);
  var sel2 = w.querySelector('#sk-template');
  sel2.innerHTML = '<option value="">— 选择经典模板（套用后可微调）—</option>' + Object.keys(E.TEMPLATES).map(function(k) {
   return '<option value="' + k + '">' + E.TEMPLATES[k].name + '</option>';
  }).join('');
  w.querySelector('#sk-tpl-go').onclick = function() { E.applyTemplate(sel2.value); };
 }
})();

/* ============ S8 座位标记显示 ============ */
(function(){
 var _rs3 = SGS.ui.refreshSeats;
 SGS.ui.refreshSeats = function() {
  var r = _rs3.call(this);
  try {
   var G = this.game;
   if (G) G.players.forEach(function(p) {
    var el = document.getElementById('seat-' + p.seat);
    if (!el) return;
    var old = el.querySelector('.mark-tag');
    if (old) old.remove();
    if (p.marks) {
     var txt = Object.keys(p.marks).filter(function(k) { return p.marks[k] > 0; }).map(function(k) { return k + '×' + p.marks[k]; }).join(' ');
     if (txt) {
      var tag = document.createElement('div');
      tag.className = 'mark-tag';
      tag.textContent = txt;
      tag.style.cssText = 'position:absolute;left:4px;top:4px;background:#5a4522;color:#f5c25a;font-size:11px;padding:1px 6px;border-radius:6px;border:1px solid #d9b06a;z-index:4';
      el.appendChild(tag);
     }
    }
   });
  } catch(e) {}
  return r;
 };
})();

/* ============ S9 变量速查提示 ============ */
(function(){
 var fx = $('sk-effects');
 if (fx && fx.parentElement) {
  var h = document.createElement('div');
  h.style.cssText = 'font-size:11px;color:#a6977c;line-height:1.7;margin-top:6px;border-top:1px dashed #5d4c33;padding-top:6px';
  h.innerHTML = '💡 条件/分支可用变量：<b>hp maxHp lostHp handCount mark judgesCount equipsCount isWounded turned chained phase turn usedSha isYourTurn distance aliveCount state cost</b>；带前缀：<b>target.hp target.handCount source.hp card.isRed card.isBlack card.suit card.num card.name</b>。例：<b>target.hp&lt;=2</b>、<b>mark&gt;=3</b>、<b>card.isRed &amp;&amp; handCount&gt;=hp</b>';
  fx.parentElement.appendChild(h);
 }
})();

console.log('√ 段10S 编辑器进化包已应用');
}catch(e){ if (window.__sgBanner) window.__sgBanner('10S失败: ' + e.message); }
})();
