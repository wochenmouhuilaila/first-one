(function(){
try{
var FX = SGS.FX, GP = SGS.Game.prototype;
/* ===== U1 消耗：失去任意点体力 ===== */
var _runU = SGS.skills.run;
SGS.skills.run = async function(game, player, skill, sctx) {
 if (skill.cost && skill.cost.type === 'loseHpAny' && player.hp > 0) {
  var n;
  if (player.ai) n = Math.min(2, Math.max(1, player.hp - 1));
  else {
   var opts = []; for (var i = 1; i <= player.hp; i++) opts.push('失去 ' + i + ' 点体力');
   var ch = await SGS.req(game, player, { type: 'choose', options: opts, prompt: '【壮誓】选择失去几点体力' });
   if (ch == null) return false;
   n = ch + 1;
  }
  await game.loseHp(player, n, '壮誓');
  var saved = skill.cost; skill.cost = { type: 'none' };
  sctx.paid = n;
  var r = await _runU.call(this, game, player, skill, sctx);
  skill.cost = saved;
  return r;
 }
 return _runU.call(this, game, player, skill, sctx);
};

/* ===== U2 赋牌工具 ===== */
var fuPool = Object.keys(SGS.CARD_INFO).filter(function(n) { return SGS.CARD_INFO[n].type !== 'equip'; });
function fuExtra(card) { var x = fuPool[Math.floor(Math.random() * fuPool.length)]; return x === card.name ? (fuPool[0] === card.name ? fuPool[1] : fuPool[0]) : x; }

/* ===== U3 新效果原子 ===== */
FX.markFu = async ctx => {
 var p = ctx.owner;
 var n = Math.min(ctx.count === '@cost' ? (ctx.paid || 1) : (ctx.count || ctx.n || 1), p.hand.length);
 if (!n) return;
 var cards;
 if (p.ai) cards = p.hand.slice(0, n);
 else cards = await SGS.req(ctx.game, p, { type: 'pickCards', n, prompt: '选择 ' + n + ' 张手牌标记为「赋」' });
 if (!cards || !cards.length) return;
 for (const c of cards) { c.fu = true; c.names = [c.name, fuExtra(c)]; }
 ctx.game.log(p.name + ' 标记了 ' + cards.length + ' 张「赋」牌');
};
FX.fuWave = async ctx => {
 var p = ctx.owner;
 var c = ctx.card || (ctx.data && ctx.data.card);
 if (!c || (c.type === 'trick' && SGS.CARD_INFO[c.name] && SGS.CARD_INFO[c.name].sub === 'delayed')) return;
 var prev = p._fuPrev;
 if (!prev) { p._fuPrev = { name: c.name, fu: !!c.fu, names: c.names || [c.name] }; return; }
 p._fuPrev = null;
 if (prev.fu && c.fu && prev.name === c.name) {
  var got = 0;
  var targets = [ (prev.names.filter(function(x) { return x !== prev.name; })[0]), (c.names ? c.names.filter(function(x) { return x !== c.name; })[0] : null) ];
  for (const nm of targets) {
   if (!nm) continue;
   var found = ctx.game.deck.filter(function(x) { return x.name === nm; })[0] || ctx.game.deck[ctx.game.deck.length - 1];
   if (found) { var ix = ctx.game.deck.indexOf(found); ctx.game.deck.splice(ix, 1); found.zone = 'hand'; found.owner = p; found.fu = true; found.names = [found.name, fuExtra(found)]; p.hand.push(found); got++; }
  }
  ctx.game.log('【文澜】' + p.name + ' 获得 ' + got + ' 张「赋」牌');
 } else {
  var sel;
  if (p.ai) { sel = [p.hand.find(function(x) { return !x.fu; }) || p.hand[0]]; }
  else { var pk = await SGS.req(ctx.game, p, { type: 'pickCards', n: 1, prompt: '【文澜】选择一张手牌标记为「赋」' }); sel = pk || []; }
  if (sel && sel[0]) { sel[0].fu = true; sel[0].names = [sel[0].name, fuExtra(sel[0])]; ctx.game.log(p.name + ' 将一张手牌标记为「赋」'); }
 }
};
FX.pierce = async ctx => { ctx.owner._pierce = (ctx.count === '@cost' ? (ctx.paid || 1) : (ctx.count || ctx.n || 1)); };
FX.unblock = async ctx => { ctx.owner._unblock = (ctx.count === '@cost' ? (ctx.paid || 1) : (ctx.count || ctx.n || 1)); };
FX.noCount = async ctx => { ctx.owner._noCount = (ctx.count === '@cost' ? (ctx.paid || 1) : (ctx.count || ctx.n || 1)); };
FX.setHp = async ctx => { for (const t of (Array.isArray(ctx.target) ? ctx.target : [ctx.target])) { t.hp = Math.max(1, Math.min(t.maxHp, ctx.count || ctx.n || 1)); ctx.game.log(t.name + ' 的体力变为 ' + t.hp); } };
FX.giveSpirit = async ctx => {
 var t = (Array.isArray(ctx.target) ? ctx.target : [ctx.target])[0];
 if (!t) return;
 var opts = ['虎（造成的伤害+1）', '鹤（摸牌阶段+1）', '熊（受到的伤害-1）', '鹿（免疫判定区）', '猿（保留）'];
 var ch;
 if (ctx.owner.ai) ch = Math.floor(Math.random() * 3);
 else ch = await SGS.req(ctx.game, ctx.owner, { type: 'choose', options: opts, prompt: '【五灵】选择传授的五禽戏' });
 if (ch == null) return;
 var names = ['虎', '鹤', '熊', '鹿', '猿'];
 var mk = names[ch];
 t.marks = t.marks || {}; t.marks[mk] = (t.marks[mk] || 0) + 1;
 t.spiritQueue = t.spiritQueue || []; t.spiritQueue.push(mk);
 ctx.game.log(ctx.owner.name + ' 向 ' + t.name + ' 传授了「' + mk + '灵」');
};

/* ===== U4 引擎挂钩 ===== */
/* 出牌：壮誓计数递减 + 赋牌多牌名使用 */
var _ucU = GP.useCard;
GP.useCard = async function(p, card, targets, opts) {
 opts = opts || {};
 if (card && card._asPick) { opts = Object.assign({}, opts, { asName: card._asPick }); delete card._asPick; }
 var buff = false;
 if (p._pierce > 0) { p._pierce--; buff = true; }
 if (p._unblock > 0) { p._unblock--; }
 if (p._noCount > 0) { p._noCount--; buff = true; }
 p._buffedUse = buff;
 try { return await _ucU.call(this, p, card, targets, opts); }
 finally { p._buffedUse = false; }
};
/* 壮誓·无距离限制 */
var _ftU = GP.filterTargets;
GP.filterTargets = async function(p, c, tgts) {
 if (p && p._pierce > 0) return tgts.filter(function(t) { return t && t.alive; });
 return _ftU.call(this, p, c, tgts);
};
/* 壮誓·不可被响应 */
var _arU = GP.askResponse;
GP.askResponse = async function(p, kind, opts) {
 if (opts && opts.user && opts.user._unblock > 0) return null;
 return _arU.call(this, p, kind, opts);
};
/* 壮誓·不计次数 + 无距限制 + 赋牌多牌名用法 */
var _guU = GP.getUsages;
GP.getUsages = async function(p, card) {
 if (p._noCount > 0 && p.usedSha >= 1) p.usedSha -= Math.min(p.usedSha, p._noCount);
 var us = await _guU.call(this, p, card);
 if (p._pierce > 0) {
  for (const u of us) if (['杀', '顺手牵羊', '决斗'].indexOf(u.name) >= 0) u.targets = this.players.filter(function(t) { return t.alive && t !== p; });
 }
 if (card && card.names && card.names.length > 1 && this.phase === 'play' && p === this.players[this.turn]) {
  for (const nm of card.names) {
   if (nm === card.name || !SGS.CARD_INFO[nm]) continue;
   for (const u of us) if (u.card === card && u.name === card.name) us.push(Object.assign({}, u, { name: nm, asName: nm, via: '赋' }));
  }
 }
 return us;
};
/* 赋牌不计入手牌上限 */
var _hlU = GP.handLimit;
GP.handLimit = async function(p) { var v = await _hlU.call(this, p); return v + p.hand.filter(function(c) { return c.fu; }).length; };
/* 鹤灵：摸牌+1 */
var _dcU = GP.drawCount;
GP.drawCount = async function(p) { var v = await _dcU.call(this, p); return v + (p.marks && p.marks['鹤'] ? p.marks['鹤'] : 0); };
/* 虎灵增伤 / 熊灵减伤 */
var _ddU = GP.dealDamage;
GP.dealDamage = async function(dmg) {
 if (dmg && dmg.from && dmg.from.marks && dmg.from.marks['虎'] > 0) { dmg.n = (dmg.n || 1) + dmg.from.marks['虎']; this.log('【虎灵】伤害 +' + dmg.from.marks['虎']); }
 if (dmg && dmg.to && dmg.to.marks && dmg.to.marks['熊'] > 0) { dmg.n = Math.max(1, (dmg.n || 1) - dmg.to.marks['熊']); this.log('【熊灵】伤害 -' + dmg.to.marks['熊']); }
 return _ddU.call(this, dmg);
};
/* 五灵：准备阶段切换为下一种 */
var _ptU = GP.playTurn;
GP.playTurn = async function(p) {
 if (p.spiritQueue && p.spiritQueue.length > 1) {
  var cur = p.spiritQueue.shift(); p.spiritQueue.push(cur);
  ['虎', '鹤', '熊', '鹿', '猿'].forEach(function(k) { if (p.marks && p.marks[k]) delete p.marks[k]; });
  p.marks = p.marks || {}; p.marks[p.spiritQueue[0]] = 1;
 }
 return _ptU.call(this, p);
};
/* UI：赋牌多牌名选择透传 */
var _cuU = SGS.ui.computeUsage;
SGS.ui.computeUsage = async function() {
 var r = await _cuU.call(this);
 if (this.sel && this.sel.cards.length) {
  if (this.sel.usage && this.sel.usage.asName) this.sel.cards[0]._asPick = this.sel.usage.asName;
  else delete this.sel.cards[0]._asPick;
 }
 return r;
};

/* ===== U5 编辑器扩展 ===== */
(function(){
 var E = SGS.editor;
 E.EFFECT_OPTS.push(
  ['markFu', '手牌标记为「赋」'], ['fuWave', '文澜结算'], ['pierce', '前@cost张牌无距离限制'],
  ['unblock', '前@cost张牌不可被响应'], ['noCount', '前@cost张牌不计次数'],
  ['setHp', '体力变为'], ['giveSpirit', '传授五禽戏']
 );
 var et2 = E.effectText;
 E.effectText = function(e) {
  switch (e.op) {
   case 'markFu': return '将' + (e.count === '@cost' ? '等量' : (e.count || 1)) + '张手牌标记为「赋」并附加随机牌名';
   case 'fuWave': return '文澜：两赋同名则摸赋牌，否则标记一张手牌为「赋」';
   case 'pierce': return '本阶段使用的前' + (e.count === '@cost' ? '等量' : (e.count || 1)) + '张牌无距离限制';
   case 'unblock': return '本阶段使用的前' + (e.count === '@cost' ? '等量' : (e.count || 1)) + '张牌不可被响应';
   case 'noCount': return '本阶段使用的前' + (e.count === '@cost' ? '等量' : (e.count || 1)) + '张牌不计入次数';
   case 'setHp': return '体力变为' + (e.count || e.n || 1);
   case 'giveSpirit': return '向其传授一种五禽戏（虎/鹤/熊/鹿/猿）';
  }
  return et2.call(this, e);
 };
 var sc = $('sk-cost');
 if (sc) { var o = document.createElement('option'); o.value = 'loseHpAny'; o.textContent = '失去任意点体力'; sc.appendChild(o); }
 var cp = $('sk-cond-preset');
 if (cp) {
  [['lostRed', '失去红色手牌时'], ['target.distance<=1', '目标距离1以内'], ['hp<=target.hp', '体力不大于目标'], ['handCount<=target.handCount', '手牌数不大于目标'], ['mark>=1', '有标记时']].forEach(function(pr) {
   var oo = document.createElement('option'); oo.value = pr[0]; oo.textContent = pr[1]; cp.appendChild(oo);
  });
 }
 /* 条件变量：lostRed（本事件弃置/失去的牌中有红色） */
 var _mkU = SGS.cond.mkGetter;
 SGS.cond.mkGetter = function(ctx) {
  var base = _mkU.call(this, ctx);
  return function(path) {
   if (path === 'lostRed') { var cs = ctx.data && ctx.data.cards; return !!(cs && cs.some(function(c) { return c.suit === '♥' || c.suit === '♦'; })); }
   return base(path);
  };
 };
 /* 模板 */
 if (!E.TEMPLATES) E.TEMPLATES = {};
 Object.assign(E.TEMPLATES, {
  zhuangshi1: { name: '壮誓·贯阵（弃N→前N张无距且不可响应）', type: 'active', cost: { type: 'discardAny' }, effects: [{ op: 'pierce', target: 'self', count: '@cost' }, { op: 'unblock', target: 'self', count: '@cost' }] },
  zhuangshi2: { name: '壮誓·断粮（失N体力→前N张不计次数）', type: 'active', cost: { type: 'loseHpAny' }, effects: [{ op: 'noCount', target: 'self', count: '@cost' }] },
  yinzhan1: { name: '饮战·体力（杀伤害+1）', type: 'triggered', trigger: 'damageTaking', subj: 'from', auto: true, condition: 'hp<=target.hp', effects: [{ op: 'modifyDamage', target: 'self', delta: 1 }] },
  yinzhan2: { name: '饮战·手牌（杀伤害+1）', type: 'triggered', trigger: 'damageTaking', subj: 'from', auto: true, condition: 'handCount<=target.handCount', effects: [{ op: 'modifyDamage', target: 'self', delta: 1 }] },
  kuanggu: { name: '狂骨（距离1内伤害后二选一）', type: 'triggered', trigger: 'damageDealt', auto: false, condition: 'target.distance<=1', effects: [{ op: 'choose', optA: '回复1点体力', optB: '摸一张牌', then: [{ op: 'recoverHp', target: 'self', count: 1 }], else: [{ op: 'draw', target: 'self', count: 1 }] }] },
  fule: { name: '赋乐（初始手牌标记为赋）', type: 'triggered', trigger: 'phaseTurnStart', auto: true, limit: { scope: 'game', max: 1 }, effects: [{ op: 'markFu', target: 'self', count: 99 }] },
  wenlan: { name: '文澜（两张赋牌结算）', type: 'triggered', trigger: 'cardUseAfterEffect', auto: true, effects: [{ op: 'fuWave', target: 'self' }] },
  jishi1: { name: '济世·开局三药', type: 'triggered', trigger: 'phaseTurnStart', auto: true, limit: { scope: 'game', max: 1 }, effects: [{ op: 'gainMark', target: 'self', mark: '药' }, { op: 'gainMark', target: 'self', mark: '药' }, { op: 'gainMark', target: 'self', mark: '药' }] },
  jishi2: { name: '济世·濒死喂药（回复至1体力）', type: 'triggered', trigger: 'nearDeathEnter', auto: false, condition: 'mark>=1', effects: [{ op: 'loseMark', target: 'self', count: 1, mark: '药' }, { op: 'setHp', target: 'self', count: 1 }] },
  jishi3: { name: '济世·失红牌获药', type: 'triggered', trigger: 'loseAfter', auto: true, condition: 'lostRed', effects: [{ op: 'gainMark', target: 'self', mark: '药' }] },
  wuling: { name: '五灵·传授（虎/鹤/熊/鹿/猿）', type: 'active', targetRule: { type: 'other' }, limit: { scope: 'turn', max: 2 }, effects: [{ op: 'giveSpirit', target: 'target' }] }
 });
 /* 模板套用后补写条件输入框 */
 var _atU = E.applyTemplate;
 E.applyTemplate = function(key) {
  var r = _atU.call(this, key);
  var T = this.TEMPLATES[key];
  if (T && T.condition && $('sk-cond')) $('sk-cond').value = T.condition;
  if (r !== undefined) return r;
 };
})();

console.log('√ 段10U 势/乐/神引擎包已应用');
}catch(e){ if (window.__sgBanner) window.__sgBanner('10U失败: ' + e.message); }
})();
