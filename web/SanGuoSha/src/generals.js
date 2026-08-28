/* ---------- 补丁A：技能引擎支持 trigger.subj（破军/铁骑/鬼才/落英） ---------- */
(function() {
  const _orig = SGS.skills.register;
  SGS.skills.register = function(game, player) {
    const ext = (player.general.skills || []).filter(s => s.type === 'triggered' && s.trigger && ('subj' in s.trigger));
    const saved = ext.map(s => [s.type, s.trigger]);
    for (const s of ext) { s.type = 'passive'; s.trigger = null; } // 屏蔽常规注册
    _orig.call(this, game, player);
    for (let i = 0; i < ext.length; i++) { ext[i].type = saved[i][0]; ext[i].trigger = saved[i][1]; }
    const reg = SGS.bus.onPlayer(player);
    for (const skill of ext) {
      const tr = skill.trigger;
      const prio = skill.skillClass === 'locked' ? this.PRIO_LOCKED : this.PRIO_NORMAL;
      reg(tr.event, async ctx => {
        if (!player.alive) return;
        const f = tr.subj;
        if (skill.selfOnly !== false && f && ctx[f] !== player) return;
        if (!this.active(game, player, skill, ctx)) return;
        const sctx = this.mkCtx(game, player, skill, ctx);
        if (!SGS.cond.check(skill.condition, sctx)) return;
        const forced = skill.auto || skill.skillClass === 'locked' || skill.skillClass === 'awaken';
        if (forced) { await this.run(game, player, skill, sctx); return; }
        const ok = await SGS.req(game, player, { type: 'skill', skill, sctx });
        if (ok) await this.run(game, player, skill, sctx);
      }, prio);
    }
  };
  // 补丁B：目标规则 eventTarget（铁骑标记杀的目标）
  const _ct = SGS.skills.chooseTargets;
  SGS.skills.chooseTargets = async function(game, player, skill, sctx, tr) {
    if (tr.type === 'eventTarget') return sctx.target ? [sctx.target] : [];
    return _ct.call(this, game, player, skill, sctx, tr);
  };
})();
/* ---------- 补丁C：jail 扣置区（破军） ---------- */
const _mv = SGS.Game.prototype.moveCard;
SGS.Game.prototype.moveCard = async function(card, fromP, fromZone, toP, toZone, reason) {
  if (toZone === 'jail') {
    this.removeFromZone(card);
    card.zone = 'jail'; card.owner = toP;
    toP.jail = toP.jail || []; toP.jail.push(card);
    if (fromZone === 'hand' && fromP) await this.emit('loseAfter', { player: fromP, cards: [card], reason });
    return;
  }
  return _mv.call(this, card, fromP, fromZone, toP, toZone, reason);
};
const _rz = SGS.Game.prototype.removeFromZone;
SGS.Game.prototype.removeFromZone = function(card) {
  if (card.zone === 'jail' && card.owner) { card.owner.jail.splice(card.owner.jail.indexOf(card), 1); return; }
  return _rz.call(this, card);
};
/* 补丁D：破军伤害+1；目标回合结束归还；死亡弃置 */
const _dd = SGS.Game.prototype.dealDamage;
SGS.Game.prototype.dealDamage = async function(dmg) {
  if (dmg && dmg.to && dmg.to.pojunInfo && dmg.from && dmg.card &&
      dmg.from === dmg.to.pojunInfo.user && dmg.card.id === dmg.to.pojunInfo.cardId) {
    dmg.n = (dmg.n || 1) + 1;
    dmg.to.pojunInfo = null;
    this.log('【破军】牌被扣置，此【杀】伤害 +1！');
  }
  return _dd.call(this, dmg);
};
const _turn = SGS.Game.prototype.playTurn;
SGS.Game.prototype.playTurn = async function(p) {
  const r = await _turn.call(this, p);
  p.pojunInfo = null; if (p.jail && p.jail.length) {
    if (p.alive) {
      const cards = p.jail; p.jail = [];
      for (const c of cards) { c.zone = 'hand'; c.owner = p; p.hand.push(c); }
      this.log(p.name + ' 收回了被【破军】扣置的 ' + cards.length + ' 张牌');
    } else {
      const cards = p.jail; p.jail = [];
      for (const c of cards) await this.discardCard(c, '破军牌弃置');
    }
  }
  return r;
};
/* 补丁E：逐张弃置触发 discardAfter（落英），判定牌入弃牌堆也触发 */
SGS.Game.prototype.discardCard = async function(card, reason) {
  if (!card || card.zone === 'discard' || card.zone === 'deck') return;
  const p = card.owner;
  const fromHand = card.zone === 'hand';
  await this.moveCard(card, card.owner, card.zone, null, 'discard', reason);
  if (fromHand && p) await this.emit('discardAfter', { player: p, cards: [card], reason });
};
SGS.Game.prototype.discardCards = async function(p, cards, reason) {
  for (const c of cards || []) await this.discardCard(c, reason); // discardAfter 已逐张触发
};
SGS.Game.prototype.judge = async function(p, reason) {
  if (!this.deck.length) this.reshuffle();
  let card = this.deck.pop(); card.zone = 'proc';
  this.log('⚖ ' + p.name + ' ' + (reason || '判定') + '，亮出 ' + card.suit + SGS.numStr(card.num) + '【' + card.name + '】', 'sys');
  if (this.ui) this.ui.judgeShow(card);
  await this.emit('judgeWhen', { player: p, card });
  const start = this.players[this.turn] || p;
  for (const q of this.seatOrderFrom(start)) {
    if (!q.alive) continue;
    const ctx = { player: q, judged: p, card, reason }; // reason 透传，供鬼才决策
    await this.emit('judgeAsk', ctx);
    if (ctx.card !== card) card = ctx.card;
  }
  await this.emit('judgeBefore', { player: p, card });
  await this.emit('judgeAfter', { player: p, card });
  if (card.zone === 'proc') { card.zone = 'discard'; this.discard.push(card); }
  if (this.ui) this.ui.judgeHide();
  await this.emit('discardAfter', { player: p, cards: [card], reason: '判定' }); // 落英
  return card;
};
/* 补丁F：判定/条件分支嵌套效果的目标解析 + 铁骑标记原子 */
SGS.FX.ironBlock = async ctx => { for (const t of [].concat(ctx.target)) if (t) t.ironBlock = true; };
SGS.FX.judge = async function(ctx) {
  const G = ctx.game;
  const who = Array.isArray(ctx.target) ? ctx.target[0] : (ctx.target || ctx.owner);
  const card = await G.judge(who, ctx.reason || ('【' + (ctx.skill && ctx.skill.name || '技能') + '】判定'));
  ctx.lastJudge = card;
  if (!ctx.on) return;
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
  if (list) for (const e of list) {
    const c2 = Object.assign({}, ctx, e);
    if (e.target) c2.target = SGS.skills.resolveTarget(e, ctx);
    if (SGS.FX[e.op]) await SGS.FX[e.op](c2);
  }
};
SGS.FX['if'] = async function(ctx) {
  const pass = SGS.cond.check(ctx.cond, {
    game: ctx.game, self: ctx.owner,
    target: Array.isArray(ctx.target) ? ctx.target[0] : ctx.target,
    source: ctx.source, card: ctx.card, lastJudge: ctx.lastJudge, data: ctx.data
  });
  const list = pass ? ctx.then : ctx.else;
  if (list) for (const e of list) {
    const c2 = Object.assign({}, ctx, e);
    if (e.target) c2.target = SGS.skills.resolveTarget(e, ctx);
    if (SGS.FX[e.op]) await SGS.FX[e.op](c2);
  }
};
/* 补丁G：AI 微调（刚烈选择/可选触发技/酒诗翻面守卫） */
const _ch = SGS.AI.choose;
SGS.AI.choose = async function(game, p, prompt, options) {
  if (prompt && prompt.includes('刚烈')) return (p.hand.length >= 3 || p.hp <= 2) ? 0 : 1;
  return _ch.call(this, game, p, prompt, options);
};
const _opt = SGS.AI.optionalSkill;
SGS.AI.optionalSkill = async function(game, p, skill, sctx) {
  if (skill.aiAuto) return true;
  return _opt.call(this, game, p, skill, sctx);
};
const _uas = SGS.AI.useActiveSkill;
SGS.AI.useActiveSkill = async function(game, p, skill) {
  const eff = JSON.stringify(skill.effects || []);
  if (eff.includes('flip') && (p.hand.length > 3 || p.hp > 2)) return false; // 酒诗不轻易翻面
  if (skill.name === '青囊' && !game.players.some(t => t.alive && t.hp < t.maxHp && SGS.AI.isFriend(game, p, t))) return false;
  return _uas.call(this, game, p, skill);
};
SGS.AI.guicaiWant = function(game, p, judged, card, reason) {
  const friendly = SGS.AI.isFriend(game, p, judged);
  const r = reason || '';
  if (r.includes('乐不思蜀')) return friendly ? card.suit !== '♥' : card.suit === '♥';
  if (r.includes('闪电')) { const bad = card.suit === '♠' && card.num >= 2 && card.num <= 9; return friendly ? bad : !bad; }
  if (r.includes('八卦阵')) { const red = SGS.isRed(card); return friendly ? !red : red; }
  return false;
};
SGS.AI.guicaiPick = function(game, p, judged, card, reason) {
  const friendly = SGS.AI.isFriend(game, p, judged);
  const pool = p.hand.filter(c => friendly ? SGS.isRed(c) : !SGS.isRed(c));
  const sel = pool.length ? pool : p.hand;
  return [sel.slice().sort((a, b) => SGS.AI.cardValue(a, p) - SGS.AI.cardValue(b, p))[0]];
};
SGS.AI.yijiTarget = function(game, p, c) {
  if (SGS.AI.cardValue(c, p) >= 5) return null; // 好牌自留
  const ally = game.players.filter(t => t.alive && t.hp < t.maxHp && SGS.AI.isFriend(game, p, t))
    .sort((a, b) => (b.maxHp - b.hp) - (a.maxHp - a.hp))[0];
  return ally || null;
};
/* ---------- 原生技能处理器 ---------- */
SGS.NATIVES['fanjian'] = async function(game, ctx) { // 反间
  const p = ctx.owner;
  const pool = game.players.filter(q => q !== p && q.alive && q.hand.length);
  if (!pool.length) return;
  const t = p.ai ? SGS.AI.bestTargetIn(game, p, pool)
    : await SGS.req(game, p, { type: 'chooseTarget', pool, prompt: '【反间】选择一名有手牌的角色' });
  if (!t) return;
  const card = SGS.pick(p.hand);
  const guess = t.ai ? await SGS.AI.chooseSuit(game, t)
    : await SGS.req(game, t, { type: 'chooseSuit', prompt: '【反间】' + p.name + ' 展示了一张牌，请猜其花色', options: ['♠', '♥', '♣', '♦'] });
  game.log('【反间】' + p.name + ' 展示 ' + card.suit + '【' + card.name + '】，' + t.name + ' 猜 ' + guess);
  await game.moveCard(card, p, 'hand', t, 'hand', '反间');
  if (card.suit !== guess) await game.dealDamage({ from: p, to: t, n: 1, card: SGS.virtualCard('反间'), skill: '反间' });
};
SGS.NATIVES['lijian'] = async function(game, ctx) { // 离间
  const p = ctx.owner;
  const males = game.players.filter(t => t !== p && t.alive && t.gender === 'male');
  if (males.length < 2) return;
  let a, b;
  if (p.ai) {
    const sorted = males.slice().sort((x, y) => SGS.AI.enemyScore(game, p, y) - SGS.AI.enemyScore(game, p, x));
    a = sorted[0]; b = sorted[1];
  } else {
    a = await SGS.req(game, p, { type: 'chooseTarget', pool: males, prompt: '【离间】选择先出【杀】的男性角色' });
    if (!a) return;
    b = await SGS.req(game, p, { type: 'chooseTarget', pool: males.filter(t => t !== a), prompt: '【离间】选择与其决斗的男性角色' });
    if (!b) return;
  }
  game.log('【离间】' + p.name + ' 挑拨 ' + a.name + ' 与 ' + b.name + ' 决斗');
  await game.duel(a, b, SGS.virtualCard('决斗'));
};
SGS.NATIVES['guicai'] = async function(game, ctx) { // 鬼才
  const p = ctx.owner, ec = ctx.data;
  const judged = ec.judged, card = ec.card;
  if (!p.hand.length || !judged || !card || card.zone !== 'proc') return;
  const want = p.ai ? SGS.AI.guicaiWant(game, p, judged, card, ec.reason)
    : await SGS.req(game, p, { type: 'yesNo', prompt: '【鬼才】是否打出一张手牌代替 ' + judged.name + ' 的判定牌（' + card.suit + '【' + card.name + '】）？' });
  if (!want) return;
  const rc = p.ai ? SGS.AI.guicaiPick(game, p, judged, card, ec.reason)
    : await SGS.req(game, p, { type: 'pickCards', n: 1, prompt: '【鬼才】选择一张手牌作为新的判定牌' });
  if (!rc || !rc.length) return;
  const nc = rc[0];
  if (game.ui) game.ui.say(p, '天机，尽在吾掌握之中！');
  await game.moveCard(card, null, 'proc', null, 'discard', '鬼才换下');
  await game.moveCard(nc, p, 'hand', null, 'proc', '鬼才改判');
  ec.card = nc;
  game.log('【鬼才】' + p.name + ' 以 ' + nc.suit + '【' + nc.name + '】代替判定牌');
};
SGS.NATIVES['ganglie'] = async function(game, ctx) { // 刚烈
  const p = ctx.owner, src = ctx.source;
  if (!src || !src.alive) return;
  const jc = await game.judge(p, '刚烈判定');
  if (jc.suit === '♥') { game.log('刚烈判定为♥，无效'); return; }
  const ch = await game.askChoose(src, '【刚烈】请选择：弃置两张手牌，或受到 1 点伤害', ['弃置两张手牌', '受到伤害']);
  if (ch === 0) await game.forceDiscard(src, 2, '刚烈');
  else await game.dealDamage({ from: p, to: src, n: 1 });
};
SGS.NATIVES['tuxi'] = async function(game, ctx) { // 突袭
  const p = ctx.owner;
  const pool = game.players.filter(t => t !== p && t.alive && t.hand.length);
  if (!pool.length) return;
  let targets;
  if (p.ai) targets = await SGS.AI.chooseTargets(game, p, { pool, count: 2 });
  else targets = await SGS.req(game, p, { type: 'chooseTargets', pool, count: 2, prompt: '【突袭】选择至多两名角色，各获得其一张手牌' });
  if (!targets || !targets.length) return;
  for (const t of targets) {
    const c = SGS.pick(t.hand);
    await game.moveCard(c, t, 'hand', p, 'hand', '突袭');
  }
  ctx.data.skipDraw = true; // 替代摸牌阶段
};
SGS.NATIVES['tiandu'] = async function(game, ctx) { // 天妒
  const p = ctx.owner, card = ctx.card || (ctx.data && ctx.data.card);
  if (card && card.zone === 'proc') await game.gainCard(p, card, '天妒');
};
SGS.NATIVES['yiji'] = async function(game, ctx) { // 遗计
  const p = ctx.owner;
  const before = p.hand.length;
  await game.drawCards(p, 2, '遗计');
  const cards = p.hand.slice(before);
  for (const c of cards) {
    if (c.zone !== 'hand') continue;
    let r;
    if (p.ai) r = SGS.AI.yijiTarget(game, p, c);
    else r = await SGS.req(game, p, { type: 'chooseTarget', pool: game.players.filter(q => q.alive), prompt: '【遗计】将 ' + c.suit + '【' + c.name + '】交给谁？（选择自己则保留）' });
    if (!r || r === p) continue;
    await game.moveCard(c, p, 'hand', r, 'hand', '遗计');
  }
};
SGS.NATIVES['luoying'] = async function(game, ctx) { // 落英
  const p = ctx.owner, ec = ctx.data;
  const disc = ec.player;
  if (!disc || disc === p) return;
  const clubs = (ec.cards || []).filter(c => c.suit === '♣' && c.zone === 'discard');
  if (!clubs.length) return;
  const c = clubs[0];
  const want = p.ai ? true
    : await SGS.req(game, p, { type: 'yesNo', prompt: '【落英】是否获得 ' + disc.name + ' 弃置的 ' + c.suit + '【' + c.name + '】？' });
  if (want) await game.gainCard(p, c, '落英');
};
SGS.NATIVES['pojun'] = async function(game, ctx) { // 破军
  const p = ctx.owner, t = ctx.target, c = ctx.card;
  if (!t || !t.alive || t === p) return;
  if (p.ai && SGS.AI.enemyScore(game, p, t) <= 0) return;
  const X = Math.max(0, t.hp);
  const options = [];
  t.hand.forEach(cd => options.push({ card: cd, zone: 'hand' }));
  for (const k of ['weapon', 'armor', 'horseP', 'horseM']) if (t.equips[k]) options.push({ card: t.equips[k], zone: 'equip' });
  if (!options.length) return;
  const max = Math.min(X, options.length);
  let sel;
  if (p.ai) {
    sel = options.slice().sort((o1, o2) => {
      const e1 = o1.zone === 'equip' ? 1 : 0, e2 = o2.zone === 'equip' ? 1 : 0;
      if (e1 !== e2) return e2 - e1;
      return SGS.AI.cardValue(o1.card, t) - SGS.AI.cardValue(o2.card, t);
    }).slice(0, max);
  } else {
    const want = await SGS.req(game, p, { type: 'yesNo', prompt: '【破军】是否扣置 ' + t.name + ' 至多 ' + X + ' 张牌，令此【杀】伤害 +1？' });
    if (!want) return;
    sel = await SGS.req(game, p, { type: 'pickCardsFrom', options, max, prompt: '【破军】选择要扣置的牌（最多 ' + max + ' 张）' });
    if (!sel || !sel.length) return;
  }
  t.jail = t.jail || [];
  for (const o of sel) { await game.moveCard(o.card, t, o.zone, t, 'jail', '破军'); }
  t.pojunInfo = { user: p, cardId: c.id };
  game.log('【破军】' + p.name + ' 扣置了 ' + t.name + ' ' + sel.length + ' 张牌，杀伤害 +1');
};
/* ---------- 武将数据 ---------- */
SGS.GENERALS = [
  { id: 'liubei', name: '刘备', title: '仁德之主', kingdom: 'shu', gender: 'male', maxHp: 4, skills: [
    { name: '仁德', skillClass: 'normal', type: 'active', trigger: { event: 'phasePlayStart' },
      desc: '出牌阶段限一次，你可以将至少两张手牌交给一名其他角色，然后回复1点体力。',
      quote: '同心同德，救困扶危！', targetRule: { type: 'other' }, cost: { type: 'give', min: 2 },
      effects: [{ op: 'recoverHp', target: 'self', count: 1 }], limit: { scope: 'phase', max: 1 } }
  ]},
  { id: 'guanyu', name: '关羽', title: '义薄云天', kingdom: 'shu', gender: 'male', maxHp: 4, skills: [
    { name: '武圣', skillClass: 'normal', type: 'conversion',
      desc: '你可以将一张红色牌当【杀】使用或打出。',
      quote: '取尔首级，如探囊取物！',
      convert: [{ as: '杀', filter: { op: 'isRed' }, regions: ['hand'] }] }
  ]},
  { id: 'zhangfei', name: '张飞', title: '万人之敌', kingdom: 'shu', gender: 'male', maxHp: 4, skills: [
    { name: '咆哮', skillClass: 'locked', type: 'passive',
      desc: '锁定技，你使用【杀】无次数限制。',
      quote: '喝！百万军中，取上将首级！', modify: { op: 'shaLimit', value: 'inf' } }
  ]},
  { id: 'zhaoyun', name: '赵云', title: '常胜将军', kingdom: 'shu', gender: 'male', maxHp: 4, skills: [
    { name: '龙胆', skillClass: 'normal', type: 'conversion',
      desc: '你可以将【杀】当【闪】、【闪】当【杀】使用或打出。',
      quote: '七进七出，胆识无双！',
      convert: [
        { as: '杀', filter: { op: 'isCard', name: '闪' }, regions: ['hand'] },
        { as: '闪', filter: { op: 'isCard', name: '杀' }, regions: ['hand'] }
      ] }
  ]},
  { id: 'machao', name: '马超', title: '西凉铁骑', kingdom: 'shu', gender: 'male', maxHp: 4, skills: [
    { name: '马术', skillClass: 'locked', type: 'passive',
      desc: '锁定技，你与其他角色的距离 -1。',
      quote: '西凉铁骑，踏破山河！', modify: { op: 'distance', delta: -1 } },
    { name: '铁骑', skillClass: 'normal', type: 'triggered', trigger: { event: 'cardTargetAfter', subj: 'player' },
      condition: { op: 'cardIs', filter: { op: 'isSha' } }, auto: true,
      desc: '你使用【杀】指定目标后判定：红色则此【杀】不可被【闪】响应。',
      quote: '铁骑踏阵，无人可挡！',
      targetRule: { type: 'eventTarget' },
      effects: [{ op: 'judge', target: 'self', on: 'red', then: [{ op: 'ironBlock', target: 'target' }] }] }
  ]},
  { id: 'huangyueying', name: '黄月英', title: '奇才夫人', kingdom: 'shu', gender: 'female', maxHp: 3, skills: [
    { name: '集智', skillClass: 'normal', type: 'triggered', trigger: { event: 'cardUseWhen' },
      condition: { op: 'cardIs', filter: { op: 'isTrick' } }, auto: true,
      desc: '当你使用普通锦囊牌时，你可以摸一张牌。',
      quote: '机关算尽，妙计无穷。', effects: [{ op: 'draw', target: 'self', count: 1 }] },
    { name: '奇才', skillClass: 'locked', type: 'passive',
      desc: '锁定技，你使用锦囊牌无距离限制。',
      quote: '奇谋在手，天下我有。', modify: { op: 'trickRange', value: 'inf' } }
  ]},
  { id: 'sunquan', name: '孙权', title: '江东之主', kingdom: 'wu', gender: 'male', maxHp: 4, skills: [
    { name: '制衡', skillClass: 'normal', type: 'active', trigger: { event: 'phasePlayStart' },
      desc: '出牌阶段限一次，你可以弃置任意张手牌，然后摸等量的牌。',
      quote: '权衡利弊，方可立于不败！',
      targetRule: { type: 'self' }, cost: { type: 'discardAny' },
      effects: [{ op: 'draw', target: 'self', count: '@cost' }], limit: { scope: 'phase', max: 1 } }
  ]},
  { id: 'ganning', name: '甘宁', title: '锦帆游侠', kingdom: 'wu', gender: 'male', maxHp: 4, skills: [
    { name: '奇袭', skillClass: 'normal', type: 'conversion',
      desc: '你可以将一张黑色牌当【过河拆桥】使用。',
      quote: '锦帆所至，片甲不留！',
      convert: [{ as: '过河拆桥', filter: { op: 'isBlack' }, regions: ['hand'] }] }
  ]},
  { id: 'huanggai', name: '黄盖', title: '苦肉先锋', kingdom: 'wu', gender: 'male', maxHp: 4, skills: [
    { name: '苦肉', skillClass: 'normal', type: 'active', trigger: { event: 'phasePlayStart' },
      desc: '出牌阶段，你可以失去1点体力，然后摸两张牌。',
      quote: '皮肉之苦，何足道哉！',
      targetRule: { type: 'self' }, cost: { type: 'loseHp', n: 1 },
      effects: [{ op: 'draw', target: 'self', count: 2 }], limit: { scope: 'never' } }
  ]},
  { id: 'zhouyu', name: '周瑜', title: '江东美郎', kingdom: 'wu', gender: 'male', maxHp: 3, skills: [
    { name: '英姿', skillClass: 'locked', type: 'passive',
      desc: '锁定技，摸牌阶段你多摸一张牌。',
      quote: '羽扇纶巾，谈笑破敌！', modify: { op: 'drawCount', delta: 1 } },
    { name: '反间', skillClass: 'normal', type: 'active', trigger: { event: 'phasePlayStart' },
      desc: '出牌阶段限一次，你可以令一名有手牌的角色猜你一张手牌的花色：猜错则受1点伤害，然后其获得此牌。',
      quote: '此计一出，尔等自乱！',
      targetRule: { type: 'self' }, effects: [{ op: 'native', arg: 'fanjian' }], limit: { scope: 'phase', max: 1 } }
  ]},
  { id: 'caocao', name: '曹操', title: '乱世枭雄', kingdom: 'wei', gender: 'male', maxHp: 4, skills: [
    { name: '奸雄', skillClass: 'normal', type: 'triggered', trigger: { event: 'damageTaken' }, auto: true,
      desc: '当你受到伤害后，你可以获得造成此伤害的牌。',
      quote: '成大事者，不拘小义！', effects: [{ op: 'gainDamageCard' }] }
  ]},
  { id: 'simayi', name: '司马懿', title: '狼顾之相', kingdom: 'wei', gender: 'male', maxHp: 3, skills: [
    { name: '反馈', skillClass: 'normal', type: 'triggered', trigger: { event: 'damageTaken' }, auto: true,
      desc: '当你受到伤害后，你可以获得伤害来源的一张手牌。',
      quote: '以彼之道，还施彼身！', effects: [{ op: 'stealFrom', target: 'source' }] },
    { name: '鬼才', skillClass: 'normal', type: 'triggered', trigger: { event: 'judgeAsk', subj: 'player' }, auto: true,
      desc: '当任意角色的判定牌生效前，你可以打出一张手牌代替之。',
      quote: '', effects: [{ op: 'native', arg: 'guicai' }] }
  ]},
  { id: 'xiahoudun', name: '夏侯惇', title: '独目将军', kingdom: 'wei', gender: 'male', maxHp: 4, skills: [
    { name: '刚烈', skillClass: 'normal', type: 'triggered', trigger: { event: 'damageTaken' }, auto: true,
      desc: '当你受到伤害后判定：不为♥则伤害来源弃两张牌或受1点伤害。',
      quote: '谁敢伤我，我必十倍奉还！', effects: [{ op: 'native', arg: 'ganglie' }] }
  ]},
  { id: 'zhangliao', name: '张辽', title: '威震逍遥津', kingdom: 'wei', gender: 'male', maxHp: 4, skills: [
    { name: '突袭', skillClass: 'normal', type: 'triggered', trigger: { event: 'phaseDrawStart' }, auto: true,
      desc: '摸牌阶段，你可以改为获得至多两名其他角色各一张手牌。',
      quote: '出其不意，攻其不备！', effects: [{ op: 'native', arg: 'tuxi' }] }
  ]},
  { id: 'guojia', name: '郭嘉', title: '鬼才军师', kingdom: 'wei', gender: 'male', maxHp: 3, skills: [
    { name: '天妒', skillClass: 'normal', type: 'triggered', trigger: { event: 'judgeAfter' }, auto: true,
      desc: '当你的判定牌生效后，你可以获得之。',
      quote: '天妒英才，岂可久留……', effects: [{ op: 'native', arg: 'tiandu' }] },
    { name: '遗计', skillClass: 'normal', type: 'triggered', trigger: { event: 'damageTaken' }, auto: true,
      desc: '当你受到伤害后，你可以摸两张牌并任意分配。',
      quote: '此计遗世，可安天下！', effects: [{ op: 'native', arg: 'yiji' }] }
  ]},
  { id: 'huatuo', name: '华佗', title: '妙手神医', kingdom: 'qun', gender: 'male', maxHp: 3, skills: [
    { name: '急救', skillClass: 'normal', type: 'conversion',
      desc: '你的回合外，你可以将一张红色牌当【桃】使用。',
      quote: '妙手回春，起死回生！',
      convert: [{ as: '桃', filter: { op: 'isRed' }, when: 'outsideTurn', regions: ['hand'] }] },
    { name: '青囊', skillClass: 'normal', type: 'active', trigger: { event: 'phasePlayStart' },
      desc: '出牌阶段限一次，你可以弃置一张手牌令一名角色回复1点体力。',
      quote: '病入膏肓，亦能医也！',
      targetRule: { type: 'any' }, cost: { type: 'discard', n: 1 },
      effects: [{ op: 'recoverHp', target: 'target', count: 1 }], limit: { scope: 'phase', max: 1 } }
  ]},
  { id: 'lvbu', name: '吕布', title: '天下无双', kingdom: 'qun', gender: 'male', maxHp: 4, skills: [
    { name: '无双', skillClass: 'locked', type: 'passive',
      desc: '锁定技，你使用的【杀】需两张【闪】抵消；与你决斗的角色需两张【杀】。',
      quote: '天下英雄，谁堪一战！', modify: { op: 'responsePlus', value: 1 } }
  ]},
  { id: 'diaochan', name: '貂蝉', title: '绝世舞姬', kingdom: 'qun', gender: 'female', maxHp: 3, skills: [
    { name: '离间', skillClass: 'normal', type: 'active', trigger: { event: 'phasePlayStart' },
      desc: '出牌阶段限一次，你可以令两名男性角色决斗。',
      quote: '美人之计，杀人于无形！',
      targetRule: { type: 'self' }, effects: [{ op: 'native', arg: 'lijian' }], limit: { scope: 'phase', max: 1 } },
    { name: '闭月', skillClass: 'normal', type: 'triggered', trigger: { event: 'phaseEndStart' }, auto: true,
      desc: '结束阶段开始时，你可以摸一张牌。',
      quote: '明月羞见，闭月之容。', effects: [{ op: 'draw', target: 'self', count: 1 }] }
  ]},
  { id: 'jxs', name: '界徐盛', title: '破军先锋', kingdom: 'wu', gender: 'male', maxHp: 4, skills: [
    { name: '破军', skillClass: 'normal', type: 'triggered', trigger: { event: 'cardTargetAfter', subj: 'player' },
      condition: { op: 'cardIs', filter: { op: 'isSha' } }, auto: true,
      desc: '你使用【杀】指定目标后，可扣置其至多X张牌（X为其体力值），此【杀】伤害+1；其回合结束时收回。',
      quote: '破军之势，一往无前！', targetRule: { type: 'eventTarget' }, effects: [{ op: 'native', arg: 'pojun' }] }
  ]},
  { id: 'caozhi', name: '曹植', title: '八斗之才', kingdom: 'wei', gender: 'male', maxHp: 3, skills: [
    { name: '落英', skillClass: 'normal', type: 'triggered', trigger: { event: 'discardAfter', subj: null }, selfOnly: false, auto: true,
      desc: '当其他角色的梅花牌因弃置或判定进入弃牌堆时，你可以获得其中一张。',
      quote: '落英缤纷，尽入我怀。', effects: [{ op: 'native', arg: 'luoying' }] },
    { name: '酒诗', skillClass: 'normal', type: 'active', trigger: { event: 'phasePlayStart' },
      desc: '出牌阶段限一次，你可以翻面，然后摸两张牌。',
      quote: '对酒当歌，人生几何！',
      targetRule: { type: 'self' },
      effects: [{ op: 'flip', target: 'self' }, { op: 'draw', target: 'self', count: 2 }],
      limit: { scope: 'phase', max: 1 } }
  ]}
];
console.log('√ 段6 已加载 ' + SGS.GENERALS.length + ' 名初始武将');
