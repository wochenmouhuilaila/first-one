'use strict';
const SGS = window.SGS = window.SGS || {};

/* ---------- 工具 ---------- */
SGS.uid = (() => { let i = 1; return () => 'c' + (i++); })();
SGS.rand = n => Math.floor(Math.random() * n);
SGS.shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = SGS.rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
SGS.pick = arr => arr[SGS.rand(arr.length)];
SGS.deepClone = obj => JSON.parse(JSON.stringify(obj));
SGS.sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- 事件总线（优先级队列，锁定技优先） ---------- */
SGS.bus = {
  _ls: {},
  on(event, fn, prio) {
    prio = prio || 0;
    const l = { fn, prio, id: SGS.uid() };
    (this._ls[event] = this._ls[event] || []).push(l);
    return l.id;
  },
  off(event, id) {
    const a = this._ls[event];
    if (!a) return;
    const i = a.findIndex(l => l.id === id);
    if (i >= 0) a.splice(i, 1);
  },
  async emit(event, ctx) {
    const a = this._ls[event];
    if (!a || !a.length) return ctx;
    const sorted = a.slice().sort((x, y) => y.prio - x.prio); // 高优先级（锁定技）先结算
    for (const l of sorted) {
      if (ctx && ctx.cancelled) break;
      try { await l.fn(ctx); } catch (e) { console.error('[事件异常]', event, e); }
    }
    return ctx;
  },
  clear() { this._ls = {}; }
};
SGS.bus.onPlayer = function(player) { // 为角色注册的监听器全部记录，供阵亡时卸载
  player._listenerIds = player._listenerIds || [];
  return function(ev, fn, prio) {
    const id = SGS.bus.on(ev, fn, prio);
    player._listenerIds.push([ev, id]);
  };
};
SGS.bus.offPlayer = function(player) {
  (player._listenerIds || []).forEach(([ev, id]) => SGS.bus.off(ev, id));
  player._listenerIds = [];
};

/* ---------- 请求分发桩（段4/9 注入实现：真人走 UI，AI 走启发式） ---------- */
SGS.req = async function(game, player, opts) { return null; };
SGS.reqAI = async function(game, player, opts) { return SGS.AI ? SGS.AI.answer(game, player, opts) : null; };

/* ---------- 条件求值器 ---------- */
SGS.cond = {
  /* —— 表达式语言：安全递归下降解析，无 eval —— */
  tokenize(expr) {
    const ts = []; let i = 0; const s = expr.trim();
    while (i < s.length) {
      const c = s[i];
      if (c === ' ') { i++; continue; }
      if ('()!'.includes(c)) { ts.push({ t: c }); i++; continue; }
      if (c === '&' && s[i + 1] === '&') { ts.push({ t: '&&' }); i += 2; continue; }
      if (c === '|' && s[i + 1] === '|') { ts.push({ t: '||' }); i += 2; continue; }
      if (c === '>' || c === '<' || c === '=' || c === '!') {
        let op = c; if (s[i + 1] === '=') { op += '='; i++; }
        ts.push({ t: 'op', v: op }); i++; continue;
      }
      if (c === "'" || c === '"') { let j = i + 1; while (j < s.length && s[j] !== c) j++; ts.push({ t: 'str', v: s.slice(i + 1, j) }); i = j + 1; continue; }
      if (/[0-9]/.test(c)) { let j = i; while (j < s.length && /[0-9]/.test(s[j])) j++; ts.push({ t: 'num', v: +s.slice(i, j) }); i = j; continue; }
      if (/[A-Za-z_]/.test(c)) { let j = i; while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++; ts.push({ t: 'id', v: s.slice(i, j) }); i = j; continue; }
      throw new Error('无法解析的字符: ' + c);
    }
    return ts;
  },
  parse(expr) {
    const ts = this.tokenize(expr); let p = 0;
    const peek = () => ts[p];
    const parseOr = () => { let L = parseAnd(); while (peek() && peek().t === '||') { p++; L = { o: '||', a: L, b: parseAnd() }; } return L; };
    const parseAnd = () => { let L = parseCmp(); while (peek() && peek().t === '&&') { p++; L = { o: '&&', a: L, b: parseCmp() }; } return L; };
    const parseCmp = () => { let L = parseUnary(); while (peek() && peek().t === 'op') { const op = ts[p++].v; L = { o: op, a: L, b: parseUnary() }; } return L; };
    const parseUnary = () => { if (peek() && peek().t === '!') { p++; return { o: '!', a: parseUnary() }; } return parsePrimary(); };
    const parsePrimary = () => {
      const t = peek();
      if (!t) throw new Error('表达式不完整');
      if (t.t === '(') { p++; const e = parseOr(); if (!peek() || peek().t !== ')') throw new Error('缺少右括号'); p++; return e; }
      if (t.t === 'num') { p++; return { v: t.v }; }
      if (t.t === 'str') { p++; return { v: t.v }; }
      if (t.t === 'id') { p++; return { path: t.v }; }
      throw new Error('意外的符号: ' + t.t);
    };
    const tree = parseOr();
    if (p < ts.length) throw new Error('表达式有多余内容');
    return tree;
  },
  val(node, get) {
    if (node == null) return true;
    if ('v' in node) return node.v;
    if (node.path) return get(node.path);
    if (node.o === '!') return !this.val(node.a, get);
    if (node.o === '&&') return this.val(node.a, get) && this.val(node.b, get);
    if (node.o === '||') return this.val(node.a, get) || this.val(node.b, get);
    const a = this.val(node.a, get), b = this.val(node.b, get);
    if (node.o === '==') return a == b;
    if (node.o === '!=') return a != b;
    if (node.o === '>') return a > b;
    if (node.o === '<') return a < b;
    if (node.o === '>=') return a >= b;
    if (node.o === '<=') return a <= b;
    return false;
  },
  _cache: {},
  evalStr(expr, get) {
    if (!expr) return true;
    try {
      const tree = this._cache[expr] || (this._cache[expr] = this.parse(expr));
      return this.val(tree, get);
    } catch (e) { console.warn('条件表达式错误:', expr, e.message); return false; }
  },
  /* —— 属性读取器 —— */
  mkGetter(ctx) {
    const G = ctx.game;
    const entGet = e => attr => {
      if (!e) return null;
      switch (attr) {
        case 'hp': return e.hp;
        case 'maxHp': return e.maxHp;
        case 'lostHp': return e.maxHp - e.hp;
        case 'handCount': return e.hand.length;
        case 'handLimit': return G.handLimit(e);
        case 'judgesCount': return e.judges.length;
        case 'equipsCount': return G.countEquips(e);
        case 'isWounded': return e.hp < e.maxHp;
        case 'isAlive': return !!e.alive;
        case 'isYourTurn': return G.turn === e.seat;
        case 'turned': return !!e.turned;
        case 'chained': return !!e.chained;
        case 'identity': return e.identity || '';
        case 'kingdom': return e.kingdom || '';
        case 'gender': return e.gender || 'male';
        case 'usedSha': return e.usedSha || 0;
        case 'distance': return G.distance(ctx.self, e);
      }
      return null;
    };
    const cardGet = c => attr => {
      if (!c) return null;
      switch (attr) {
        case 'cardName': case 'name': return c.name;
        case 'cardType': case 'type': return c.type;
        case 'isRed': return c.suit === '♥' || c.suit === '♦';
        case 'isBlack': return !(c.suit === '♥' || c.suit === '♦');
        case 'suit': return c.suit;
        case 'num': case 'number': return c.num;
      }
      return null;
    };
    const selfG = entGet(ctx.self), tarG = entGet(ctx.target), srcG = entGet(ctx.source), cardG = cardGet(ctx.card);
    const basics = ['hp', 'maxHp', 'lostHp', 'handCount', 'handLimit', 'judgesCount', 'equipsCount', 'isWounded', 'isAlive', 'isYourTurn', 'turned', 'chained', 'identity', 'kingdom', 'gender', 'usedSha', 'distance'];
    const cardAttrs = ['cardName', 'cardType', 'isRed', 'isBlack', 'suit', 'num', 'number', 'name'];
    return path => {
      const parts = path.split('.');
      if (parts.length === 2) {
        const base = { self: selfG, target: tarG, source: srcG, card: cardG }[parts[0]];
        return base ? base(parts[1]) : null;
      }
      const a = parts[0];
      if (basics.includes(a)) return selfG(a);
      if (cardAttrs.includes(a)) return cardG(a);
      switch (a) {
        case 'phase': return G.phase;
        case 'turn': return G.turn;
        case 'aliveCount': return G.aliveCount();
        case 'cost': return ctx.paid || 0;
        case 'round': return G.round || 0;
        case 'state': return ctx.skillSt ? ctx.skillSt.state : null;
        case 'judgeRed': return !!(ctx.lastJudge && (ctx.lastJudge.suit === '♥' || ctx.lastJudge.suit === '♦'));
        case 'judgeBlack': return !!(ctx.lastJudge && !(ctx.lastJudge.suit === '♥' || ctx.lastJudge.suit === '♦'));
        case 'judgeHeart': return !!(ctx.lastJudge && ctx.lastJudge.suit === '♥');
        case 'judgeNum': return ctx.lastJudge ? ctx.lastJudge.num : 0;
      }
      return null;
    };
  },
  /* —— 谓词树 / 字符串统一入口 —— */
  check(cond, ctx) {
    if (!cond) return true;
    if (typeof cond === 'string') return this.evalStr(cond, this.mkGetter(ctx));
    return this.checkOp(cond, ctx, this.mkGetter(ctx));
  },
  checkOp(op, ctx, get) {
    switch (op.op) {
      case 'always': return true;
      case 'and': return op.items.every(i => this.check(i, ctx));
      case 'or': return op.items.some(i => this.check(i, ctx));
      case 'not': return !this.check(op.item, ctx);
      case 'expr': return this.evalStr(op.expr, get);
      case 'phaseOnce': return !ctx.skillSt || ctx.skillSt.usedPhase === 0;
      case 'turnOnce': return !ctx.skillSt || ctx.skillSt.usedTurn === 0;
      case 'gameOnce': return !ctx.skillSt || ctx.skillSt.usedGame === 0;
      case 'handCountMin': return ctx.self.hand.length >= op.value;
      case 'isOther': return ctx.target && ctx.target !== ctx.self;
      case 'isWoundedTarget': return ctx.target && ctx.target.hp < ctx.target.maxHp;
      case 'hasCard': return ctx.self.hand.some(c => this.matchFilter(c, op.filter));
      case 'judgeIs': return !!ctx.lastJudge && this.matchFilter(ctx.lastJudge, op.filter);
      case 'identityIs': return ctx.self.identity === op.value;
      case 'notYourTurn': return ctx.game.turn !== ctx.self.seat;
      case 'isYourTurn': return ctx.game.turn === ctx.self.seat;
      case 'cardIs': return ctx.card && this.matchFilter(ctx.card, op.filter);
      case 'markMin': return (ctx.self.marks[op.mark] || 0) >= (op.value || 1);
      case 'compare': {
        const a = typeof op.a === 'string' ? get(op.a) : op.a;
        const b = typeof op.b === 'string' ? get(op.b) : op.b;
        switch (op.op2) {
          case '>': return a > b; case '<': return a < b;
          case '>=': return a >= b; case '<=': return a <= b;
          case '==': return a == b; case '!=': return a != b;
        }
        return false;
      }
    }
    return true;
  },
  /* —— 卡牌过滤器（转化技 / 条件共用的谓词） —— */
  matchFilter(card, f) {
    if (!f || !card) return true;
    switch (f.op || 'any') {
      case 'any': return true;
      case 'isRed': return card.suit === '♥' || card.suit === '♦';
      case 'isBlack': return !(card.suit === '♥' || card.suit === '♦');
      case 'isSuit': return card.suit === f.suit;
      case 'isHeart': return card.suit === '♥';
      case 'isDiamond': return card.suit === '♦';
      case 'isSpade': return card.suit === '♠';
      case 'isClub': return card.suit === '♣';
      case 'isType': return card.type === f.type;
      case 'isBasic': return card.type === 'basic';
      case 'isTrick': return card.type === 'trick';
      case 'isEquip': return card.type === 'equip';
      case 'isCard': return card.name === f.name;
      case 'isSha': return card.name === '杀';
      case 'isShan': return card.name === '闪';
      case 'isTao': return card.name === '桃';
      case 'numMin': return card.num >= f.value;
      case 'not': return !this.matchFilter(card, f.f);
      case 'or': return (f.f1 && this.matchFilter(card, f.f1)) || (f.f2 && this.matchFilter(card, f.f2));
    }
    return true;
  }
};

/* ---------- 效果原子注册表 ---------- */
SGS.FX = {};
SGS.NATIVES = {}; // 段6 注册的“原生技能”处理器（反间、离间、鬼才等）

/* ---------- 技能引擎：JSON → 监听器 ---------- */
SGS.skills = {
  PRIO_LOCKED: 300,
  PRIO_NORMAL: 100,
  /* 事件 → 技能拥有者主体字段映射（selfOnly 判定） */
  SUBJ: {
    damageTaken: 'to', damageTaking: 'to', damageEnd: 'to',
    damageDealt: 'from', damageDealing: 'from',
    cardUseWhen: 'player', cardUseEnd: 'player', cardUseAfterEffect: 'player',
    cardBecomeTargetWhen: 'target', cardTargetAfter: 'target',
    cardPlayWhen: 'player', cardPlayAfter: 'player',
    judgeBefore: 'player', judgeAfter: 'player', judgeWhen: 'player',
    drawBefore: 'player', drawAfter: 'player', discardAfter: 'player',
    gainAfter: 'player', loseAfter: 'player', recoverBefore: 'player', recoverAfter: 'player',
    loseHpAfter: 'player', nearDeathEnter: 'player', nearDeathDuring: 'player',
    deathBefore: 'player', deathWhen: 'player', deathAfter: 'player',
    phaseTurnStart: 'player', phaseTurnEnd: 'player', phasePrepareStart: 'player',
    phaseJudgeStart: 'player', phaseDrawStart: 'player', phasePlayStart: 'player',
    phaseDiscardStart: 'player', phaseEndStart: 'player', phaseTurnEndAfter: 'player',
    skillUsed: 'player'
  },
  /* 注册一名武将的全部技能 */
  register(game, player) {
    player.skillState = player.skillState || {};
    player._listenerIds = player._listenerIds || [];
    const reg = SGS.bus.onPlayer(player);
    (player.general.skills || []).forEach(skill => {
      player.skillState[skill.name] = player.skillState[skill.name] ||
        { usedPhase: 0, usedTurn: 0, usedGame: 0, state: 'yin', marked: false };
      const prio = skill.skillClass === 'locked' ? this.PRIO_LOCKED : this.PRIO_NORMAL;
      const st = player.skillState[skill.name];
      if (skill.type === 'active') {
        const ev = (skill.trigger && skill.trigger.event) || 'phasePlayStart';
        reg(ev, ctx => {
          if (ctx.player !== player || !this.active(game, player, skill, ctx)) return;
          (game.playActions = game.playActions || []).push({ player, skill });
        }, prio);
      } else if (skill.type === 'triggered') {
        const ev = skill.trigger.event;
        reg(ev, async ctx => {
          if (!player.alive) return;
          const f = this.SUBJ[ev];
          if (skill.selfOnly !== false && f && ctx[f] !== player) return;
          if (!this.active(game, player, skill, ctx)) return;
          const sctx = this.mkCtx(game, player, skill, ctx);
          if (!SGS.cond.check(skill.condition, sctx)) return;
          const forced = skill.auto || skill.skillClass === 'locked' || skill.skillClass === 'awaken';
          if (forced) { await this.run(game, player, skill, sctx); return; }
          const ok = await SGS.req(game, player, { type: 'skill', skill, sctx });
          if (ok) await this.run(game, player, skill, sctx);
        }, prio);
      } else if (skill.type === 'passive' && skill.modify) {
        const m = skill.modify;
        reg('query:' + m.op, ctx => {
          if (ctx.player !== player || !this.active(game, player, skill, ctx)) return;
          if (m.op === 'drawCount') ctx.value += m.delta || 0;
          else if (m.op === 'shaLimit') { if (m.value === 'inf') ctx.value = Infinity; else ctx.value += m.delta || 0; }
          else if (m.op === 'distance') ctx.value = Math.max(1, ctx.value + (m.delta || 0));
          else if (m.op === 'handLimit') ctx.value += m.delta || 0;
          else if (m.op === 'attackRange') ctx.value += m.delta || 0;
          else if (m.op === 'responsePlus') { /* 无双：需要多张响应牌 */ if (m.value) ctx.value += m.value; }
        }, prio);
      }
      // 转换技（阴/阳状态机）：发动后自动切态
      if (skill.switch) st.state = skill.switch.states[0];
    });
  },
  /* 技能是否可用（身份/限定/觉醒/activeWhen 校验） */
  active(game, player, skill, ctx) {
    if (!player || !player.alive) return false;
    if (skill.lordOnly && player.identity !== 'lord') return false;
    const st = player.skillState[skill.name];
    if ((skill.skillClass === 'limited' || skill.skillClass === 'awaken') && st && st.usedGame > 0) return false;
    if (skill.activeWhen) {
      const c = this.mkCtx(game, player, skill, ctx || {});
      if (!SGS.cond.check(skill.activeWhen, c)) return false;
    }
    return true;
  },
  /* 构建技能求值上下文 */
  mkCtx(game, player, skill, ec) {
    const e = ec || {};
    return {
      game, self: player, skill,
      skillSt: player.skillState[skill.name],
      event: e._ev,
      target: e.target !== undefined ? e.target : e.to,
      source: e.from !== undefined ? e.from : e.source,
      card: e.card, dmg: e.dmg,
      paid: 0, lastJudge: null, data: e
    };
  },
  /* 选择目标（按 targetRule） */
  async chooseTargets(game, player, skill, sctx, tr) {
    const alive = game.players.filter(p => p.alive);
    const ok = p => {
      if (!tr.filter) return true;
      return SGS.cond.check(tr.filter, Object.assign({}, sctx, { target: p }));
    };
    switch (tr.type) {
      case 'self': return [player];
      case 'all': return alive;
      case 'allOthers': return alive.filter(p => p !== player);
      case 'targets': return sctx.targets || [];
      case 'source': return sctx.source ? [sctx.source] : [];
      case 'other': {
        const pool = alive.filter(p => p !== player && ok(p));
        if (!pool.length) return false;
        const t = player.ai ? await SGS.reqAI(game, player, { type: 'chooseTarget', pool, skill, sctx, count: tr.count || 1 })
                            : await SGS.req(game, player, { type: 'chooseTarget', pool, skill, sctx, count: tr.count || 1 });
        return t == null ? false : [t];
      }
      case 'any': {
        const pool = alive.filter(ok);
        if (!pool.length) return false;
        const t = player.ai ? await SGS.reqAI(game, player, { type: 'chooseTarget', pool, skill, sctx, count: tr.count || 1 })
                            : await SGS.req(game, player, { type: 'chooseTarget', pool, skill, sctx, count: tr.count || 1 });
        return t == null ? false : [t];
      }
      case 'other2': { // 选至多两名其他角色（突袭）
        const pool = alive.filter(p => p !== player && p.hand.length && ok(p));
        if (!pool.length) return false;
        if (player.ai) { const ts = await SGS.reqAI(game, player, { type: 'chooseTargets', pool, skill, sctx, count: 2 }); return ts || []; }
        const ts = await SGS.req(game, player, { type: 'chooseTargets', pool, skill, sctx, count: 2 });
        return ts || [];
      }
    }
    return false;
  },
  /* 效果目标解析 */
  resolveTarget(ef, sctx) {
    const ty = ef.target || 'target';
    switch (ty) {
      case 'self': case 'owner': return sctx.self;
      case 'targets': return sctx.targets && sctx.targets.length ? sctx.targets : [sctx.self];
      case 'source': return sctx.source || sctx.self;
      case 'allOthers': return sctx.game.players.filter(p => p.alive && p !== sctx.self);
      case 'all': return sctx.game.players.filter(p => p.alive);
      default: return sctx.targets && sctx.targets.length ? sctx.targets[0] : (sctx.target || sctx.self);
    }
  },
  /* 执行技能：限制→消耗→目标→台词→效果序列→计数 */
  async run(game, player, skill, sctx) {
    const st = player.skillState[skill.name];
    if (skill.limit) {
      const s = skill.limit.scope, m = skill.limit.max || 1;
      if ((s === 'phase' && st.usedPhase >= m) || (s === 'turn' && st.usedTurn >= m) || (s === 'game' && st.usedGame >= m)) return false;
    }
    const cost = skill.cost || { type: 'none' };
    const tr = skill.targetRule || { type: 'self' };
    // 交牌类消耗需先选目标
    if (cost.type === 'give') {
      sctx.targets = await this.chooseTargets(game, player, skill, sctx, tr);
      if (sctx.targets === false) return false;
    }
    let paid = 0;
    if (cost.type === 'discard' || cost.type === 'discardAny') {
      const need = cost.type === 'discard' ? (cost.n || 1) : null;
      const picked = await SGS.req(game, player, {
        type: 'pickCards', n: need, allowZero: cost.type === 'discardAny',
        prompt: '请选择要弃置的手牌（发动【' + skill.name + '】）'
      });
      if (!picked || (need && picked.length < need)) return false;
      await game.discardCards(player, picked, '发动【' + skill.name + '】');
      paid = picked.length;
    } else if (cost.type === 'loseHp') {
      await game.loseHp(player, cost.n || 1, '发动【' + skill.name + '】');
      paid = cost.n || 1;
    } else if (cost.type === 'give') {
      const tgt = sctx.targets[0];
      const picked = await SGS.req(game, player, {
        type: 'pickCards', n: 'any', min: cost.min || 1, allowZero: false,
        prompt: '请选择交给 ' + tgt.name + ' 的手牌（至少 ' + (cost.min || 1) + ' 张）'
      });
      if (!picked || picked.length < (cost.min || 1)) return false;
      await game.giveCards(player, tgt, picked, '发动【' + skill.name + '】');
      paid = picked.length;
    }
    sctx.paid = paid;
    if (!sctx.targets) {
      sctx.targets = await this.chooseTargets(game, player, skill, sctx, tr);
      if (sctx.targets === false) return false;
    }
    if (skill.quote && SGS.ui) SGS.ui.say(player, skill.quote);
    for (const ef of skill.effects || []) {
      const t = this.resolveTarget(ef, sctx);
      const ctx2 = Object.assign({
        game, owner: player, skill, targets: sctx.targets || [], target: t,
        source: sctx.source, card: sctx.card, paid: sctx.paid,
        lastJudge: sctx.lastJudge, data: sctx.data, dmg: sctx.dmg, arg: ef.arg
      }); Object.assign(ctx2, ef); ctx2.target = t; if (sctx.source) ctx2.source = sctx.source;
      if (SGS.FX[ef.op]) await SGS.FX[ef.op](ctx2);
      else console.warn('未知效果原子:', ef.op);
      if (ef.op === 'judge') sctx.lastJudge = ctx2.lastJudge;
    }
    st.usedPhase++; st.usedTurn++; st.usedGame++;
    if (skill.switch) st.state = skill.switch.states[1 - skill.switch.states.indexOf(st.state)] || st.state;
    game.emit('skillUsed', { player, skill });
    return true;
  },
  /* 转化技查询：该角色可把某实体牌当什么用 */
  conversions(game, player, need, opts) {
    const out = [];
    for (const skill of player.general.skills || []) {
      if (skill.type !== 'conversion' || !this.active(game, player, skill)) continue;
      for (const cv of skill.convert || []) {
        if (need && cv.as !== need) continue;
        if (cv.when === 'outsideTurn' && game.turn === player.seat) continue;
        if (cv.when === 'insideTurn' && game.turn !== player.seat) continue;
        out.push({ skill, as: cv.as, filter: cv.filter, regions: cv.regions || ['hand'] });
      }
    }
    return out;
  },
  cardAs(game, player, card, need, opts) {
    const list = this.conversions(game, player, need, opts);
    for (const cv of list) {
      if (cv.regions && !cv.regions.includes(card.zone)) continue;
      if (SGS.cond.matchFilter(card, cv.filter)) return cv.as;
    }
    return null;
  },
  /* 回合/阶段重置技能计数 */
  resetTurn(player) {
    for (const k in player.skillState) {
      player.skillState[k].usedTurn = 0;
      player.skillState[k].usedPhase = 0;
    }
  },
  resetPhase(player) {
    for (const k in player.skillState) player.skillState[k].usedPhase = 0;
  },
  /* 查询事件（被动修正聚合） */
  async query(game, name, ctx) {
    await SGS.bus.emit('query:' + name, ctx);
    return ctx.value;
  }
};

/* ---------- 效果原子实现（依赖段4的 Game 方法，运行时调用） ---------- */
(function() {
  const asArr = t => Array.isArray(t) ? t : [t];
  const F = SGS.FX;
  F.draw = async ctx => {
    for (const t of asArr(ctx.target)) await ctx.game.drawCards(t, ctx.count || ctx.n || 1, ctx.reason);
  };
  F.drawToHandLimit = async ctx => { // 补至体力上限
    for (const t of asArr(ctx.target)) {
      const need = Math.max(0, t.maxHp - t.hand.length);
      if (need) await ctx.game.drawCards(t, need, ctx.reason);
    }
  };
  F.discard = async ctx => {
    for (const t of asArr(ctx.target)) {
      const n = Math.min(ctx.count || ctx.n || 1, t.hand.length);
      if (!n) continue;
      let cards;
      if (t.ai) cards = SGS.AI.pickDiscard(t, n);
      else cards = await SGS.req(ctx.game, t, { type: 'pickCards', n, prompt: '请弃置 ' + n + ' 张手牌（' + (ctx.reason || '技能效果') + '）' });
      if (cards && cards.length) await ctx.game.discardCards(t, cards, ctx.reason || '技能弃置');
    }
  };
  F.give = async ctx => {
    for (const t of asArr(ctx.target)) {
      const n = Math.min(ctx.count || ctx.n || 1, ctx.owner.hand.length);
      if (!n || t === ctx.owner) continue;
      let cards;
      if (ctx.owner.ai) cards = SGS.AI.pickDiscard(ctx.owner, n);
      else cards = await SGS.req(ctx.game, ctx.owner, { type: 'pickCards', n, prompt: '请选择 ' + n + ' 张手牌交给 ' + t.name });
      if (cards && cards.length) await ctx.game.giveCards(ctx.owner, t, cards, ctx.reason || '技能交予');
    }
  };
  F.stealFrom = async ctx => {
    for (const t of asArr(ctx.target)) {
      if (!t || !t.hand.length) continue;
      const c = SGS.pick(t.hand);
      await ctx.game.moveCard(c, t, 'hand', ctx.owner, 'hand', ctx.reason || '获得牌');
    }
  };
  F.drawFromOthers = async ctx => {
    const n = ctx.count || ctx.n || 2;
    const targets = asArr(ctx.target).filter(t => t && t !== ctx.owner && t.hand.length).slice(0, n);
    for (const t of targets) {
      const c = SGS.pick(t.hand);
      await ctx.game.moveCard(c, t, 'hand', ctx.owner, 'hand', ctx.reason || '突袭');
    }
  };
  F.gainDamageCard = async ctx => {
    const d = ctx.dmg || (ctx.data && ctx.data.dmg);
    const c = d && d.card;
    if (c && (c.zone === 'proc' || c.zone === 'discard' || c.zone === 'judge')) await ctx.game.gainCard(ctx.owner, c, '获得伤害牌');
  };
  F.loseHp = async ctx => {
    for (const t of asArr(ctx.target)) await ctx.game.loseHp(t, ctx.count || ctx.n || 1, ctx.reason || ('【' + (ctx.skill && ctx.skill.name || '技能') + '】'));
  };
  F.recoverHp = async ctx => {
    for (const t of asArr(ctx.target)) await ctx.game.recoverHp(t, ctx.count || ctx.n || 1, ctx.reason);
  };
  F.dealDamage = async ctx => {
    for (const t of asArr(ctx.target)) {
      if (t === ctx.owner && (ctx.noSelf)) continue;
      await ctx.game.dealDamage({ from: ctx.source || ctx.owner, to: t, n: ctx.count || ctx.n || 1, card: ctx.card, attr: ctx.attr || 'normal', skill: ctx.skill });
    }
  };
  F.changeMaxHp = async ctx => {
    for (const t of asArr(ctx.target)) await ctx.game.changeMaxHp(t, ctx.delta || ctx.count || 1);
  };
  F.flip = async ctx => { for (const t of asArr(ctx.target)) ctx.game.flip(t); };
  F.chainOn = async ctx => { for (const t of asArr(ctx.target)) ctx.game.setChained(t, true); };
  F.chainOff = async ctx => { for (const t of asArr(ctx.target)) ctx.game.setChained(t, false); };
  F.gainMark = async ctx => {
    for (const t of asArr(ctx.target)) {
      t.marks[ctx.mark || '权'] = (t.marks[ctx.mark || '权'] || 0) + (ctx.count || ctx.n || 1);
    }
  };
  F.judge = async ctx => {
    const who = asArr(ctx.target)[0] || ctx.owner;
    const card = await ctx.game.judge(who, ctx.reason || ('【' + (ctx.skill && ctx.skill.name || '技能') + '】判定'));
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
    if (list) for (const e of list) await SGS.FX[e.op](Object.assign({}, ctx, e));
  };
  F['if'] = async ctx => {
    const c = SGS.cond.check(ctx.cond, {
      game: ctx.game, self: ctx.owner,
      target: Array.isArray(ctx.target) ? ctx.target[0] : ctx.target,
      source: ctx.source, card: ctx.card, lastJudge: ctx.lastJudge, data: ctx.data, skillSt: ctx.skillSt
    });
    const list = c ? ctx.then : ctx.else;
    if (list) for (const e of list) await SGS.FX[e.op](Object.assign({}, ctx, e));
  };
  F.native = async ctx => {
    const fn = SGS.NATIVES[ctx.arg];
    if (fn) await fn(ctx.game, ctx);
  };
  F.viewCards = async ctx => {
    for (const t of asArr(ctx.target)) {
      const cards = t.hand.slice(0, ctx.count || ctx.n || 1);
      if (cards.length && ctx.game.ui) ctx.game.ui.showCards('查看 ' + t.name + ' 的手牌', cards, false);
    }
  };
})();

console.log('√ 段2 核心引擎已加载');
