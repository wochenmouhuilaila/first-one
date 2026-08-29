/* ================= 段4（重发完整版）：模式规则与回合流程 ================= */
SGS.IDENT = { lord: '主公', loyal: '忠臣', rebel: '反贼', traitor: '内奸' };
SGS.KINGDOM = { wei: '魏', shu: '蜀', wu: '吴', qun: '群', shen: '神' };

SGS.Game = class {
  constructor() {
    this.mode = '1v1';
    this.players = []; this.deck = []; this.discard = [];
    this.turn = 0; this.phase = 'idle'; this.round = 0;
    this.playActions = []; this.over = false;
    this.ui = null; this.uiAct = null;
  }
  /* ---------- 初始化 ---------- */
  async init(mode, opts) {
    this.mode = mode; this.over = false; this.turn = 0; this.phase = 'idle';
    this.deck = SGS.shuffle(SGS.buildDeck()); this.discard = [];
    this.players = []; this.playActions = [];
    const n = mode === '1v1' ? 2 : mode === '2v2' ? 4 : 8;
    let ids = [];
    if (mode === '8p') ids = SGS.shuffle(['lord', 'loyal', 'loyal', 'rebel', 'rebel', 'rebel', 'rebel', 'traitor']);
    for (let seat = 0; seat < n; seat++) {
      const g = seat === 0 ? opts.humanGeneral : opts.aiGenerals[seat - 1];
      const isLord = mode === '8p' && ids[seat] === 'lord';
      const p = {
        seat, name: g.name, title: g.title || '', general: g, kingdom: g.kingdom, gender: g.gender || 'male',
        maxHp: g.maxHp + (isLord ? 1 : 0), hp: g.maxHp + (isLord ? 1 : 0),
        identity: mode === '8p' ? ids[seat] : null,
        team: mode === '2v2' ? seat % 2 : null,
        hand: [], equips: { weapon: null, armor: null, horseP: null, horseM: null }, judges: [],
        alive: true, turned: false, chained: false, usedSha: 0, marks: {},
        revealed: false, skipPlay: false, dying: false,
        ai: seat !== 0, human: seat === 0
      };
      this.players.push(p);
    }
    for (const p of this.players) SGS.skills.register(this, p);
    for (const p of this.players) await this.drawCards(p, 4, '初始手牌');
    if (mode === '8p') {
      const lord = this.players.find(p => p.identity === 'lord');
      this.log('👑 ' + lord.name + ' 为主公（体力上限 +1），其余身份隐藏');
    }
    this.log('═══ ' + (mode === '1v1' ? '1v1 单挑' : mode === '2v2' ? '2v2 团战（1、3 号 vs 2、4 号）' : '八人身份局') + ' 开始 ═══', 'sys');
  }
  /* ---------- 主循环 ---------- */
  async start() {
    await this.emit('gameStart', {});
    if (this.ui) this.ui.refreshAll();
    let i = (this.mode === '8p' ? Math.max(0, this.players.findIndex(function(x){ return x.identity === 'lord'; })) : 0), guard = 0;
    while (!this.over && guard++ < 1000) {
      const p = this.players[i % this.players.length];
      if (p.alive) await this.playTurn(p);
      i++;
    }
    if (!this.over && this.ui) this.ui.showResult('牌堆耗尽，游戏平局');
  }
  /* ---------- 事件与日志 ---------- */
  emit(name, ctx) { ctx = ctx || {}; ctx._ev = name; ctx.game = this; return SGS.bus.emit(name, ctx); }
  log(msg, cls) { if (this.ui) this.ui.log(msg, cls); }
  hasSkill(p, name) { const s = (p.general.skills || []).find(x => x.name === name); return !!s && SGS.skills.active(this, p, s); }
  countEquips(p) { return ['weapon', 'armor', 'horseP', 'horseM'].filter(k => p.equips[k]).length; }
  aliveCount() { return this.players.filter(p => p.alive).length; }
  seatOrderFrom(p) { const n = this.players.length; const a = []; for (let k = 0; k < n; k++) a.push(this.players[(p.seat + k) % n]); return a; }
  nextAlive(p) { const arr = this.seatOrderFrom(p); return arr.find(q => q !== p && q.alive) || p; }
  playerAt(seat) { return this.players.find(p => p.seat === seat); }
  isAlly(a, b) {
    if (a === b) return true;
    if (this.mode === '2v2') return a.team === b.team;
    if (this.mode === '8p') {
      if (a.identity === 'lord') return b.identity === 'loyal';
      if (a.identity === 'loyal') return b.identity === 'lord' || b.identity === 'loyal';
      if (a.identity === 'rebel') return b.identity === 'rebel';
      return false;
    }
    return false;
  }
  isEnemy(a, b) { return !this.isAlly(a, b); }
  /* ---------- 查询类（被动修正总线） ---------- */
  async distance(a, b) {
    if (a === b) return 0;
    if (this.mode === '1v1') return 1;
    const n = this.players.length;
    let d = Math.min((b.seat - a.seat + n) % n, (a.seat - b.seat + n) % n);
    d = Math.max(1, d);
    d += b.equips.horseM ? 1 : 0;
    d -= a.equips.horseP ? 1 : 0;
    // player 字段指向“距离来源”，马术等被动以此判定归属
    return await SGS.skills.query(this, 'distance', { player: a, from: a, to: b, value: d });
  }
  async attackRange(p) {
    let v = 1;
    if (p.equips.weapon) v = p.equips.weapon.range || 1;
    return await SGS.skills.query(this, 'attackRange', { player: p, value: v });
  }
  async trickRange(p) {
    let v = 1;
    for (const s of p.general.skills || []) {
      if (s.type === 'passive' && s.modify && s.modify.op === 'trickRange' && SGS.skills.active(this, p, s)) {
        if (s.modify.value === 'inf') v = Infinity;
      }
    }
    return v;
  }
  async drawCount(p) { return await SGS.skills.query(this, 'drawCount', { player: p, value: 2 }); }
  async shaLimit(p) {
    let v = 1;
    if (p.equips.weapon && p.equips.weapon.name === '诸葛连弩') v = Infinity;
    return await SGS.skills.query(this, 'shaLimit', { player: p, value: v });
  }
  async handLimit(p) { return await SGS.skills.query(this, 'handLimit', { player: p, value: Math.max(0, p.hp) }); }
  async responsePlus(p, kind) { return await SGS.skills.query(this, 'responsePlus', { player: p, kind, value: 0 }); }
  /* ---------- 牌移动 ---------- */
  removeFromZone(card) {
    const p = card.owner;
    switch (card.zone) {
      case 'hand': if (p) p.hand.splice(p.hand.indexOf(card), 1); break;
      case 'judge': if (p) p.judges.splice(p.judges.indexOf(card), 1); break;
      case 'equip': if (p) { for (const k in p.equips) if (p.equips[k] === card) p.equips[k] = null; } break;
    }
  }
  async moveCard(card, fromP, fromZone, toP, toZone, reason) {
    this.removeFromZone(card);
    card.zone = toZone;
    if (toZone === 'hand') { toP.hand.push(card); card.owner = toP; }
    else if (toZone === 'judge') { toP.judges.push(card); card.owner = toP; }
    else if (toZone === 'equip') { const slot = { weapon: 'weapon', armor: 'armor', horseP: 'horseP', horseM: 'horseM' }[card.sub]; if (slot) toP.equips[slot] = card; card.owner = toP; }
    else if (toZone === 'discard') { this.discard.push(card); card.owner = null; }
    else if (toZone === 'proc') { card.owner = null; }
    else if (toZone === 'deck') { this.deck.push(card); card.owner = null; }
    if (fromZone === 'hand' && fromP) await this.emit('loseAfter', { player: fromP, cards: [card], reason });
    if (toZone === 'hand' && toP) await this.emit('gainAfter', { player: toP, cards: [card], reason });
  }
  async discardCard(card, reason) {
    if (!card || card.zone === 'discard' || card.zone === 'deck') return;
    await this.moveCard(card, card.owner, card.zone, null, 'discard', reason);
  }
  async discardCards(p, cards, reason) {
    for (const c of cards || []) await this.discardCard(c, reason);
    if (cards && cards.length) await this.emit('discardAfter', { player: p, cards, reason });
  }
  async giveCards(from, to, cards, reason) {
    for (const c of cards) await this.moveCard(c, from, 'hand', to, 'hand', reason);
    this.log(from.name + ' 交给 ' + to.name + ' ' + cards.length + ' 张牌（' + reason + '）');
  }
  async gainCard(p, card, reason) {
    await this.moveCard(card, card.owner, card.zone, p, 'hand', reason);
    this.log(p.name + ' 获得了 ' + card.suit + SGS.numStr(card.num) + '【' + card.name + '】（' + reason + '）');
  }
  async discardAll(p) {
    const all = [...p.hand, ...Object.values(p.equips).filter(Boolean), ...p.judges];
    for (const c of all) await this.discardCard(c, '阵亡弃置');
    this.log(p.name + ' 弃置了所有牌');
  }
  reshuffle() {
    if (!this.discard.length) { this.log('牌堆与弃牌堆均已耗尽', 'sys'); return; }
    this.deck = SGS.shuffle(this.discard); this.discard = [];
    this.log('♻ 弃牌堆重洗为牌堆', 'sys');
  }
  /* ---------- 摸牌 ---------- */
  async drawCards(p, n, reason) {
    if (!p.alive || n <= 0) return;
    const c = { player: p, n }; await this.emit('drawBefore', c); n = Math.max(0, c.n);
    const cards = [];
    for (let i = 0; i < n; i++) {
      if (!this.deck.length) this.reshuffle();
      if (!this.deck.length) break;
      const card = this.deck.pop(); card.zone = 'hand'; card.owner = p; p.hand.push(card); cards.push(card);
    }
    if (cards.length) {
      this.log(p.name + ' 摸了 ' + cards.length + ' 张牌' + (reason ? '（' + reason + '）' : ''));
      if (this.ui) this.ui.fxDraw(p, cards.length);
      await this.emit('drawAfter', { player: p, n: cards.length, cards });
    }
  }
  /* ---------- 体力变化 ---------- */
  async loseHp(p, n, reason) {
    await this.emit('loseHpBefore', { player: p, n, reason });
    if (!p.alive || p.hp <= 0) return;
    p.hp -= n;
    this.log('💔 ' + p.name + ' 失去 ' + n + ' 点体力（' + reason + '）', 'hurt');
    if (this.ui) this.ui.fxShake(p);
    await this.emit('loseHpAfter', { player: p, n, reason });
    if (p.hp <= 0) await this.checkDying(p, null);
  }
  async recoverHp(p, n, reason) {
    const c = { player: p, n }; await this.emit('recoverBefore', c); n = c.n;
    if (!p.alive || n <= 0 || p.hp >= p.maxHp) return;
    p.hp = Math.min(p.maxHp, p.hp + n);
    this.log('💚 ' + p.name + ' 回复 ' + n + ' 点体力（' + reason + '）', 'heal');
    if (this.ui) this.ui.fxFloat(p, '+' + n, '#3ecf7e');
    await this.emit('recoverAfter', { player: p, n, reason });
  }
  async changeMaxHp(p, delta) {
    p.maxHp += delta; p.hp = Math.min(p.hp, p.maxHp);
    this.log(p.name + ' 体力上限变为 ' + p.maxHp);
    if (p.hp <= 0) await this.checkDying(p, null);
  }
  flip(p) { p.turned = !p.turned; this.log(p.name + (p.turned ? ' 翻面' : ' 翻回正面'), 'sys'); if (this.ui) this.ui.refreshSeats(); }
  setChained(p, v) { p.chained = v; this.log(p.name + (v ? ' 被横置' : ' 被重置'), 'sys'); if (this.ui) this.ui.refreshSeats(); }
  /* ---------- 伤害结算（六要素事件流） ---------- */
  async dealDamage(dmg) {
    dmg = Object.assign({ from: null, n: 1, card: null, attr: 'normal', skill: null }, dmg);
    if (!dmg.to.alive) return;
    const c1 = { from: dmg.from, to: dmg.to, dmg };
    await this.emit('damageStart', c1);
    if (c1.cancelled || this.over) return;
    await this.emit('damageDealing', c1);
    if (dmg.prevented || this.over) return;
    await this.emit('damageTaking', c1);
    if (dmg.prevented || this.over) return;
    dmg.to.hp -= dmg.n;
    this.log('⚔ ' + (dmg.from ? dmg.from.name : '天灾') + ' 对 ' + dmg.to.name + ' 造成 ' + dmg.n + ' 点' +
      (dmg.attr !== 'normal' ? ({ fire: '火焰', thunder: '雷电' }[dmg.attr] || '') : '') + '伤害' + (dmg.card ? '（' + dmg.card.name + '）' : ''), 'hurt');
    if (this.ui) { this.ui.fxShake(dmg.to); this.ui.fxFloat(dmg.to, '-' + dmg.n, '#ff5a5a'); }
    await this.emit('damageDealt', c1);
    if (this.over) return;
    await this.emit('damageTaken', c1);
    if (dmg.to.hp <= 0) await this.checkDying(dmg.to, dmg.from);
    await this.emit('damageEnd', c1);
  }
  /* ---------- 濒死与死亡 ---------- */
  async useTaoOnDying(p, dying) {
    await this.recoverHp(dying, 1, p.name + ' 的【桃】');
  }
  async checkDying(p, source) {
    if (!p.alive || p.hp > 0 || p.dying) return;
    p.dying = true;
    await this.emit('nearDeathEnter', { player: p, source });
    while (p.hp <= 0 && p.alive && !this.over) {
      this.log('⚡ ' + p.name + ' 濒死，需 ' + (1 - p.hp) + ' 个【桃】', 'hurt');
      if (this.ui) this.ui.dyingShow(p);
      for (const q of this.seatOrderFrom(p)) {
        if (!q.alive || this.over) continue;
        const r = await this.askResponse(q, 'tao', { dying: p });
        if (r && r.length) {
          for (const c of r) {
            await this.useTaoOnDying(q, p);
            if (p.hp > 0) break;
          }
        }
        if (p.hp > 0) break;
      }
      if (p.hp > 0) { this.log(p.name + ' 脱离濒死（体力 ' + p.hp + '）', 'heal'); break; }
      break;
    }
    p.dying = false;
    if (this.ui) this.ui.dyingHide();
    if (p.hp <= 0 && p.alive) await this.kill(p, source);
  }
  async kill(p, source) {
    p.alive = false; p.revealed = true;
    await this.emit('deathBefore', { player: p, source });
    await this.emit('deathWhen', { player: p, source });
    const idStr = this.mode === '8p' ? '（' + SGS.IDENT[p.identity] + '）' : (this.mode === '2v2' ? '（' + (p.team === 0 ? '一队' : '二队') + '）' : '');
    this.log('💀 ' + p.name + idStr + ' 阵亡' + (source ? '，凶手是 ' + source.name : ''), 'hurt');
    if (this.ui) this.ui.say(p, '呃啊……');
    if (this.mode === '8p') {
      if (p.identity === 'rebel' && source && source.alive) { this.log('💰 ' + source.name + ' 击杀反贼，摸三张牌', 'sys'); await this.drawCards(source, 3, '击杀反贼奖励'); }
      if (p.identity === 'loyal' && source && source.identity === 'lord') { this.log('😱 主公误杀忠臣，弃置所有牌', 'sys'); await this.discardAll(source); }
    }
    await this.discardAll(p);
    SGS.bus.offPlayer(p);
    await this.emit('deathAfter', { player: p, source });
    if (this.ui) this.ui.refreshSeats();
    await this.checkWin();
  }
  /* ---------- 判定 ---------- */
  async judge(p, reason) {
    if (!this.deck.length) this.reshuffle();
    let card = this.deck.pop(); card.zone = 'proc';
    this.log('⚖ ' + p.name + ' ' + (reason || '判定') + '，亮出 ' + card.suit + SGS.numStr(card.num) + '【' + card.name + '】', 'sys');
    if (this.ui) this.ui.judgeShow(card);
    await this.emit('judgeWhen', { player: p, card });
    const start = this.players[this.turn] || p;
    for (const q of this.seatOrderFrom(start)) {
      if (!q.alive) continue;
      const ctx = { player: q, judged: p, card };
      await this.emit('judgeAsk', ctx);
      if (ctx.card !== card) card = ctx.card;
    }
    await this.emit('judgeBefore', { player: p, card });
    await this.emit('judgeAfter', { player: p, card });
    if (card.zone === 'proc') { card.zone = 'discard'; this.discard.push(card); }
    if (this.ui) this.ui.judgeHide();
    return card;
  }
  /* ---------- 响应系统（真人/AI 双通道） ---------- */
  async askResponse(p, kind, opts) {
    opts = opts || {};
    if (kind === 'shan' && p.equips.armor && p.equips.armor.name === '八卦阵' && !opts.ignoreArmor) {
      const jc = await this.judge(p, '八卦阵判定');
      if (SGS.isRed(jc)) { this.log(p.name + ' 八卦阵判定红色，视为打出【闪】'); return [SGS.virtualCard('闪', jc)]; }
      this.log(p.name + ' 八卦阵判定黑色，无效');
    }
    let r;
    if (p.ai) r = await SGS.AI.respond(this, p, kind, opts);
    else r = await SGS.req(this, p, Object.assign({ type: 'respond', kind }, opts));
    if (r && r.length) {
      for (const c of r) if (c && !c.virtual) await this.discardCard(c, '响应打出');
      this.log(p.name + ' 打出 ' + r.map(x => '【' + x.name + '】').join(''));
    }
    return r;
  }
  async askWuxie(user, card, target) {
    for (const q of this.seatOrderFrom(user)) {
      if (q === user || !q.alive) continue;
      const r = await this.askResponse(q, 'wuxie', { card, target, user });
      if (r && r.length) {
        this.log('【无懈可击】抵消了【' + card.name + '】对 ' + target.name + ' 的效果');
        return true;
      }
    }
    return false;
  }
  async askYesNo(p, prompt) {
    if (p.ai) return SGS.AI.yesNo(this, p, prompt);
    return SGS.req(this, p, { type: 'yesNo', prompt });
  }
  async askChoose(p, prompt, options) {
    if (p.ai) return SGS.AI.choose(this, p, prompt, options);
    return SGS.req(this, p, { type: 'choose', prompt, options });
  }
  /* ---------- 决斗 ---------- */
  async duel(a, b, card) {
    this.log('⚔ ' + a.name + ' 与 ' + b.name + ' 进入决斗！');
    let cur = b, opp = a;
    while (cur.alive && opp.alive && !this.over) {
      const need = 1 + await this.responsePlus(opp, 'sha');
      const r = await this.askResponse(cur, 'sha', { card, duel: true, need });
      if (!r || r.length < need) {
        await this.dealDamage({ from: opp, to: cur, n: 1, card });
        return;
      }
      this.log(cur.name + ' 打出【杀】' + (r.length > 1 ? ' ×' + r.length : '') + ' 应战');
      const t = cur; cur = opp; opp = t;
    }
  }
  /* ---------- 区域牌选择（过拆/顺手共用） ---------- */
  async pickCardFrom(p, t, why) {
    const options = [];
    t.hand.forEach(c => options.push({ card: c, zone: 'hand' }));
    for (const k of ['weapon', 'armor', 'horseP', 'horseM']) if (t.equips[k]) options.push({ card: t.equips[k], zone: 'equip' });
    t.judges.forEach(c => options.push({ card: c, zone: 'judge' }));
    if (!options.length) return null;
    if (p.ai) return SGS.AI.pickCardTarget(this, p, options, t, why);
    return await SGS.req(this, p, { type: 'pickCard', options, prompt: '请选择 ' + t.name + ' 区域里的一张牌（' + why + '）' });
  }
  async forceDiscard(p, n, reason) {
    let need = n;
    while (need > 0 && p.hand.length) {
      const take = Math.min(need, p.hand.length);
      let cs;
      if (p.ai) cs = SGS.AI.pickDiscard(p, take);
      else cs = await SGS.req(this, p, { type: 'pickCards', n: take, prompt: reason + '：请弃置 ' + take + ' 张手牌' });
      await this.discardCards(p, cs || p.hand.slice(0, take), reason);
      need -= take;
    }
    while (need > 0 && this.countEquips(p)) {
      for (const k of ['horseP', 'horseM', 'armor', 'weapon']) if (p.equips[k]) { await this.discardCard(p.equips[k], reason); break; }
      need--;
    }
  }
  /* ---------- 回合与阶段 ---------- */
  async playTurn(p) {
    if (this.over) return;
    p.usedSha = 0;
    SGS.skills.resetTurn(p);
    if (p.turned) { p.turned = false; this.log(p.name + ' 翻回正面，跳过本回合', 'sys'); if (this.ui) this.ui.refreshSeats(); return; }
    this.turn = p.seat;
    this.log('─── ' + p.name + ' 的回合开始 ───', 'sys');
    await this.emit('phaseTurnStart', { player: p });
    if (this.ui) this.ui.refreshAll();
    const phases = [['prepare', 'Prepare'], ['judge', 'Judge'], ['draw', 'Draw'], ['play', 'Play'], ['discard', 'Discard'], ['end', 'End']];
    for (const [ph, name] of phases) {
      if (this.over || !p.alive) break;
      this.phase = ph;
      await this.emit('phaseStart', { player: p, phase: ph });
      const pctx = { player: p, phase: ph };
      await this.emit('phase' + name + 'Start', pctx);
      if (!pctx.skip) await this['phase_' + ph](p, pctx);
      await this.emit('phase' + name + 'End', { player: p, phase: ph });
      await this.emit('phaseEnd', { player: p, phase: ph });
      if (this.ui) this.ui.refreshAll();
    }
    this.phase = 'idle';
    await this.emit('phaseTurnEnd', { player: p });
    await this.emit('phaseTurnEndAfter', { player: p });
  }
  async phase_prepare(p) { }
  async phase_judge(p) {
    while (p.judges.length && !this.over && p.alive) {
      const card = p.judges.shift();
      card.zone = 'proc';
      this.log('⚖ ' + p.name + ' 的判定阶段处理【' + card.name + '】');
      const jc = await this.judge(p, '【' + card.name + '】判定');
      if (card.name === '乐不思蜀') {
        if (jc.suit !== '♥') { p.skipPlay = true; this.log('【乐不思蜀】判定生效，' + p.name + ' 跳过出牌阶段'); }
        else this.log('【乐不思蜀】判定为♥，失效');
      } else if (card.name === '闪电') {
        if (jc.suit === '♠' && jc.num >= 2 && jc.num <= 9) {
          this.log('⚡ 闪电劈中 ' + p.name + '！', 'hurt');
          await this.dealDamage({ from: null, to: p, n: 3, card, attr: 'thunder' });
        } else {
          const next = this.nextAlive(p);
          this.log('闪电未命中，移至 ' + next.name + ' 的判定区');
          await this.moveCard(card, p, 'proc', next, 'judge', '闪电传递');
        }
      }
      if (card.zone === 'proc') await this.discardCard(card, '延时锦囊结算');
    }
  }
  async phase_draw(p, ctx) {
    if (ctx.skipDraw) return;
    const n = await this.drawCount(p);
    await this.drawCards(p, n, '摸牌阶段');
  }
  async phase_play(p) {
    if (p.skipPlay) { p.skipPlay = false; this.log(p.name + ' 跳过出牌阶段'); return; }
    this.playActions = this.playActions.filter(a => a.player === p);
    if (p.ai) { await SGS.AI.playPhase(this, p); return; }
    let over = false;
    while (!over && p.alive && !this.over && this.phase === 'play') {
      this.ui.refreshAll();
      const act = await new Promise(res => { this.uiAct = res; });
      this.uiAct = null;
      if (!act) continue;
      if (act.type === 'end') over = true;
      else if (act.type === 'skill') {
        const sctx = SGS.skills.mkCtx(this, p, act.skill, {});
        const okc = await SGS.skills.run(this, p, act.skill, sctx);
        if (!okc) this.ui.toast('无法发动【' + act.skill.name + '】（条件不满足或已达次数上限）');
      }
      else if (act.type === 'use') {
        await this.useCard(p, act.card, act.targets, act.opts || {});
      }
    }
    this.uiAct = null;
  }
  async phase_discard(p) {
    const limit = await this.handLimit(p);
    if (p.hand.length <= limit) return;
    const n = p.hand.length - limit;
    this.log(p.name + ' 手牌数 ' + p.hand.length + ' 超过上限 ' + limit + '，需弃置 ' + n + ' 张');
    if (p.ai) { await this.discardCards(p, SGS.AI.pickDiscard(p, n), '弃牌阶段'); return; }
    const cs = await SGS.req(this, p, { type: 'pickCards', n, prompt: '弃牌阶段：请弃置 ' + n + ' 张手牌（手牌上限 ' + limit + '）' });
    await this.discardCards(p, cs || p.hand.slice(0, n), '弃牌阶段');
  }
  async phase_end(p) { }
  /* ---------- 使用牌：目标与用途枚举 ---------- */
  needsTarget(name) { return ['杀', '决斗', '过河拆桥', '顺手牵羊', '乐不思蜀'].includes(name); }
  async getUsages(p, card) {
    const us = [];
    const addTrick = async (name, opts) => {
      if (name === '顺手牵羊') {
        const tr = await this.trickRange(p);
        const targets = this.players.filter(async t => t !== p && t.alive && (t.hand.length || this.countEquips(t) || t.judges.length) && (await this.distance(p, t)) <= tr);
        if (targets.length) us.push(Object.assign({ name, targets, needSelect: true }, opts));
      } else if (name === '决斗') { const targets = this.players.filter(function(t){ return t !== p && t.alive; }); if (targets.length) us.push(Object.assign({ name, targets, needSelect: true }, opts)); } else if (name === '过河拆桥') {
        const targets = this.players.filter(t => t !== p && t.alive && (t.hand.length || this.countEquips(t) || t.judges.length));
        if (targets.length) us.push(Object.assign({ name, targets, needSelect: true }, opts));
      } else if (name === '乐不思蜀') {
        const targets = this.players.filter(t => t !== p && t.alive && !t.judges.some(j => j.name === '乐不思蜀'));
        if (targets.length) us.push(Object.assign({ name, targets, needSelect: true }, opts));
      } else if (name === '无中生有') us.push(Object.assign({ name, self: true }, opts));
      else if (name === '南蛮入侵' || name === '万箭齐发') us.push(Object.assign({ name, auto: 'others' }, opts));
      else if (name === '桃园结义') us.push(Object.assign({ name, auto: 'all' }, opts));
    };
    if (card.type === 'basic') {
      if (card.name === '杀') {
        const range = await this.attackRange(p), lim = await this.shaLimit(p);
        const targets = this.players.filter(async t => t !== p && t.alive && (await this.distance(p, t)) <= range);
        if (p.usedSha < lim && targets.length) us.push({ name: '杀', targets, needSelect: true });
      } else if (card.name === '桃' && p.hp < p.maxHp) us.push({ name: '桃', self: true });
    } else if (card.type === 'trick' && !card.sub) {
      await addTrick(card.name, {});
    } else if (card.type === 'trick' && card.sub === 'delayed') {
      if (card.name === '闪电') { if (!p.judges.some(j => j.name === '闪电')) us.push({ name: '闪电', self: true }); }
      else await addTrick(card.name, {});
    } else if (card.type === 'equip') {
      us.push({ name: card.name, self: true, equip: card.sub });
    }
    for (const cv of SGS.skills.conversions(this, p, null)) {
      if (!cv.regions.includes(card.zone)) continue;
      if (!SGS.cond.matchFilter(card, cv.filter)) continue;
      if (cv.as === '杀') {
        const range = await this.attackRange(p), lim = await this.shaLimit(p);
        const targets = this.players.filter(async t => t !== p && t.alive && (await this.distance(p, t)) <= range);
        if (p.usedSha < lim && targets.length) us.push({ name: '杀', asName: '杀', via: cv.skill.name, targets, needSelect: true });
      } else if (cv.as === '桃' && p.hp < p.maxHp) us.push({ name: '桃', asName: '桃', via: cv.skill.name, self: true });
      else if (['过河拆桥', '无中生有', '乐不思蜀', '决斗', '顺手牵羊'].includes(cv.as)) await addTrick(cv.as, { asName: cv.as, via: cv.skill.name });
    }
    if (p.equips.weapon && p.equips.weapon.name === '丈八蛇矛' && p.hand.length >= 2) {
      const lim = await this.shaLimit(p);
      const range = await this.attackRange(p);
      const targets = this.players.filter(async t => t !== p && t.alive && (await this.distance(p, t)) <= range);
      if (p.usedSha < lim && targets.length) us.push({ name: '杀', via: '丈八蛇矛', pair: true, targets, needSelect: true });
    }
    return us;
  }
  /* ---------- 使用牌主流程 ---------- */
  async useCard(p, card, targets, opts) {
    opts = opts || {};
    if (!p.alive || this.over) return false;
    const c = opts.asName ? Object.assign({}, card, { name: opts.asName }) : card;
    const physical = opts.physical || card;
    if (opts.pairCards && opts.pairCards.length === 2) {
      for (const pc of opts.pairCards) await this.moveCard(pc, p, 'hand', null, 'proc', '丈八蛇矛');
      c.virtual = true; c.suit = null; c.num = 0;
    } else {
      await this.moveCard(physical, p, physical.zone, null, 'proc', '使用');
    }
    if (c.type === 'equip') {
      await this.equipCard(p, physical, c);
      await this.emit('cardUseWhen', { player: p, card: c, targets: [] });
      await this.emit('cardUseEnd', { player: p, card: c });
      return true;
    }
    let tgts = targets || [];
    if (c.name === '南蛮入侵' || c.name === '万箭齐发') tgts = this.players.filter(t => t !== p && t.alive);
    if (c.name === '桃园结义') tgts = this.players.filter(t => t.alive);
    tgts = await this.filterTargets(p, c, tgts);
    if (this.needsTarget(c.name) && !tgts.length) {
      await this.moveCard(physical, null, 'proc', p, 'hand', '取消使用');
      if (opts.pairCards) for (const pc of opts.pairCards) await this.moveCard(pc, null, 'proc', p, 'hand', '取消使用');
      return false;
    }
    if (c.name === '杀' && !p._buffedUse) p.usedSha++; this.log('🃏 ' + p.name + ' 使用了 ' + (c.suit ? c.suit + SGS.numStr(c.num) : '') + '【' + c.name + '】' + (opts.via ? '（' + opts.via + '）' : '') +
      (tgts.length ? ' → ' + tgts.map(t => t.name).join('、') : ''), 'sys');
    if (this.ui) this.ui.fxUseCard(p, c);
    await this.emit('cardUseWhen', { player: p, card: c, targets: tgts });
    await this.emit('cardPlayWhen', { player: p, card: c, targets: tgts });
    for (const t of tgts.slice()) {
      const ctx = { player: p, card: c, target: t, targets: tgts };
      await this.emit('cardBecomeTargetWhen', ctx);
      if (ctx.newTarget && ctx.newTarget !== t) {
        const i = tgts.indexOf(t);
        if (i >= 0) tgts[i] = ctx.newTarget;
      }
    }
    for (const t of tgts) {
      if (t.alive && !this.over) {
        await this.emit('cardTargetAfter', { player: p, card: c, target: t });
        if (c.name === '杀' && p.equips.weapon && p.equips.weapon.name === '雌雄双股剑' && t.gender !== p.gender && t.alive) {
          const ch = await this.askChoose(t, '【雌雄双股剑】请选择：弃置一张手牌，或令 ' + p.name + ' 摸一张牌', ['弃置一张手牌', '令其摸牌']);
          if (ch === 0) await this.forceDiscard(t, 1, '雌雄双股剑');
          else await this.drawCards(p, 1, '雌雄双股剑');
        }
      }
    }
    const multi = ['南蛮入侵', '万箭齐发', '桃园结义'];
    if (multi.includes(c.name)) {
      for (const t of tgts.slice()) {
        if (!t.alive || this.over) continue;
        const wx = await this.askWuxie(p, c, t);
        if (wx) continue;
        if (c.name === '南蛮入侵') {
          const r = await this.askResponse(t, 'sha', { card: c });
          if (r && r.length) this.log(t.name + ' 打出【杀】响应南蛮');
          else await this.dealDamage({ from: p, to: t, n: 1, card: c });
        } else if (c.name === '万箭齐发') {
          const r = await this.askResponse(t, 'shan', { card: c, user: p, ignoreArmor: p.equips.weapon && p.equips.weapon.name === '青釭剑' });
          if (r && r.length) this.log(t.name + ' 打出【闪】响应万箭');
          else await this.dealDamage({ from: p, to: t, n: 1, card: c });
        } else {
          await this.recoverHp(t, 1, '【桃园结义】');
        }
      }
    } else if (tgts.length) {
      for (const t of tgts) {
        if (!t.alive || this.over) continue;
        const ctx = { player: p, card: c, target: t, targets: tgts };
        await this.emit('cardUseResolveStart', ctx);
        if (c.name === '杀' && SGS.isBlack(c) && t.equips.armor && t.equips.armor.name === '仁王盾' && !(p.equips.weapon && p.equips.weapon.name === '青釭剑')) {
          this.log(t.name + ' 的【仁王盾】抵挡了黑色【杀】');
          continue;
        }
        if (ctx.invalid) continue;
        let cancelled = false;
        if (c.type === 'trick' && c.name !== '闪电') {
          cancelled = await this.askWuxie(p, c, t);
        }
        if (!cancelled && c.name === '杀') {
          if (t.ironBlock) {
            this.log('【铁骑】判定成功，' + t.name + ' 不能打出【闪】！');
          } else {
            const need = 1 + await this.responsePlus(p, 'shan');
            const r = await this.askResponse(t, 'shan', { card: c, user: p, need, ignoreArmor: p.equips.weapon && p.equips.weapon.name === '青釭剑' });
            if (r && r.length >= need) { this.log(t.name + ' 打出【闪】' + (r.length > 1 ? ' ×' + r.length : '') + '，抵消了【杀】'); cancelled = true; }
          }
          t.ironBlock = false; if (cancelled && p.equips.weapon && p.equips.weapon.name === '贯石斧' && (p.hand.length + this.countEquips(p)) >= 2) {
            const go = await this.askYesNo(p, '【贯石斧】是否弃置两张牌，使此【杀】不可闪避？');
            if (go) { await this.forceDiscard(p, 2, '贯石斧'); cancelled = false; this.log(p.name + ' 发动贯石斧，强制命中！'); }
          }
        }
        await this.emit('cardUseBeforeEffect', { player: p, card: c, target: t, cancelled });
        if (!cancelled) {
          await this.emit('cardUseWhenEffect', { player: p, card: c, target: t });
          await this.applyCardEffect(p, c, t, physical);
          await this.emit('cardUseAfterEffect', { player: p, card: c, target: t });
        }
      }
    } else {
      await this.emit('cardUseWhenEffect', { player: p, card: c, target: p });
      await this.applyCardEffect(p, c, p, physical);
      await this.emit('cardUseAfterEffect', { player: p, card: c, target: p });
    }
    await this.emit('cardUseEnd', { player: p, card: c });
    await this.emit('cardPlayAfter', { player: p, card: c });
    if (physical.zone === 'proc') await this.discardCard(physical, '使用后弃置');
    if (opts.pairCards) for (const pc of opts.pairCards) if (pc.zone === 'proc') await this.discardCard(pc, '丈八蛇矛弃置');
    if (this.ui) this.ui.updateDiscard();
    return true;
  }
  async filterTargets(p, c, tgts) {
    if (c.name === '杀') {
      const range = await this.attackRange(p);
      const out = [];
      for (const t of tgts) {
        if (t !== p && t.alive && (await this.distance(p, t)) <= range) out.push(t);
      }
      return out;
    }
    return tgts.filter(t => t.alive);
  }
  async equipCard(p, physical, c) {
    const slot = { weapon: 'weapon', armor: 'armor', horseP: 'horseP', horseM: 'horseM' }[c.sub];
    if (!slot) return;
    const old = p.equips[slot];
    if (old) { await this.discardCard(old, '替换装备'); this.log(p.name + ' 替换了装备【' + old.name + '】'); }
    await this.moveCard(physical, null, 'proc', p, 'equip', '装备');
    this.log(p.name + ' 装备了【' + c.name + '】');
  }
  /* ---------- 牌的效果 ---------- */
  async applyCardEffect(p, c, t, physical) {
    switch (c.name) {
      case '杀':
        await this.dealDamage({ from: p, to: t, n: 1, card: c });
        break;
      case '桃':
        await this.recoverHp(p, 1, '【桃】');
        break;
      case '决斗':
        await this.duel(p, t, c);
        break;
      case '过河拆桥': {
        const sel = await this.pickCardFrom(p, t, '过河拆桥');
        if (sel) { this.log(p.name + ' 弃置了 ' + t.name + ' 的 ' + sel.card.suit + SGS.numStr(sel.card.num) + '【' + sel.card.name + '】'); await this.discardCard(sel.card, '被【过河拆桥】弃置'); }
        break;
      }
      case '顺手牵羊': {
        const sel = await this.pickCardFrom(p, t, '顺手牵羊');
        if (sel) await this.moveCard(sel.card, t, sel.zone, p, 'hand', '被【顺手牵羊】获得');
        break;
      }
      case '无中生有':
        await this.drawCards(p, 2, '无中生有');
        break;
      case '乐不思蜀':
        await this.moveCard(physical, null, 'proc', t, 'judge', '乐不思蜀');
        break;
      case '闪电':
        await this.moveCard(physical, null, 'proc', p, 'judge', '闪电');
        break;
    }
  }
  /* ---------- 胜负判定 ---------- */
  async checkWin() {
    if (this.over) return;
    const alive = this.players.filter(p => p.alive);
    if (this.mode === '1v1') {
      if (alive.length <= 1) await this.endGame(alive[0] ? alive[0].name + ' 获胜！' : '无人存活');
    } else if (this.mode === '2v2') {
      const t0 = alive.some(p => p.team === 0), t1 = alive.some(p => p.team === 1);
      if (!t0) await this.endGame('二队（2、4 号）获胜！');
      else if (!t1) await this.endGame('一队（1、3 号）获胜！');
    } else if (this.mode === '8p') {
      const lord = this.players.find(p => p.identity === 'lord');
      const rebels = alive.filter(p => p.identity === 'rebel').length;
      const traitor = alive.some(p => p.identity === 'traitor');
      if (!lord.alive) {
        if (alive.length === 1 && alive[0].identity === 'traitor') await this.endGame('内奸获胜！');
        else await this.endGame('反贼获胜！');
      } else if (rebels === 0 && !traitor) {
        await this.endGame('主公与忠臣获胜！');
      }
    }
  }
  async endGame(title) {
    if (this.over) return;
    this.over = true;
    for (const p of this.players) p.revealed = true;
    this.log('🏁 游戏结束：' + title, 'sys');
    if (this.ui) this.ui.showResult(title);
  }
};
console.log('√ 段4（重发完整版）游戏规则与流程已加载');
