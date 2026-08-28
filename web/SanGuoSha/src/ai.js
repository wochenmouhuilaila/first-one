/* 补丁1：AI 的请求分发（真人分发由段9覆盖 SGS.req） */
SGS.req = async function(game, player, opts) {
  if (player.ai) return await SGS.AI.answer(game, player, opts);
  return null;
};
/* 补丁2：效果数值支持 '@cost'（制衡：弃几张摸几张） */
SGS.FX.draw = async function(ctx) {
  const n = ctx.count === '@cost' ? (ctx.paid || 0) : (ctx.count || ctx.n || 1);
  for (const t of Array.isArray(ctx.target) ? ctx.target : [ctx.target]) {
    if (t) await ctx.game.drawCards(t, n, ctx.reason);
  }
};

SGS.AI = {
  _obs: [],
  reset() { // 新对局时清除旧观察者
    this._obs.forEach(([ev, id]) => SGS.bus.off(ev, id));
    this._obs = [];
  },
  /* ---------- 身份认知：观察行为，推断敌我 ---------- */
  initPlayer(game, p) {
    if (p.aiKnow) return;
    p.aiKnow = {};
    const score = (q, delta) => { p.aiKnow[q.seat] = (p.aiKnow[q.seat] || 0) + delta; };
    const lord = game.players.find(x => x.identity === 'lord');
    if (!lord) return;
    const lordSeat = lord.seat;
    const loyalSide = p.identity === 'lord' || p.identity === 'loyal';
    const obs = (ev, fn) => this._obs.push([ev, SGS.bus.on(ev, fn)]);
    // 有人对主公造成伤害/使用攻击牌 → 视为敌对（忠臣视角）或友军（反贼视角）
    obs('damageDealt', ctx => {
      const { from, to } = ctx;
      if (to && to.seat === lordSeat && from && from !== p) score(from, loyalSide ? 3 : -3);
    });
    obs('cardUseWhen', ctx => {
      const { player, card, targets } = ctx;
      if (['杀', '决斗', '南蛮入侵', '万箭齐发', '过河拆桥', '顺手牵羊', '乐不思蜀'].includes(card.name)) {
        for (const t of targets || []) if (t.seat === lordSeat && player !== p) score(player, loyalSide ? 3 : -3);
      }
    });
    // 有人救护主公 → 忠臣视角视为友军，反贼视角视为敌人
    obs('recoverAfter', ctx => {
      const { player, reason } = ctx;
      if (player.seat !== lordSeat) return;
      let healer = player;
      const m = reason && reason.match(/^(.+) 的/);
      if (m) healer = game.players.find(q => q.name === m[1]) || player;
      if (healer !== player && healer !== p) score(healer, loyalSide ? -3 : 3);
    });
  },
  /* ---------- 敌友判断 ---------- */
  enemyScore(game, p, t) {
    if (!t || t === p || !t.alive) return -99;
    if (game.mode === '1v1') return 1;
    if (game.mode === '2v2') return p.team === t.team ? -9 : 1;
    let s = (p.aiKnow && p.aiKnow[t.seat]) || 0;
    if (p.identity === 'rebel') { if (t.identity === 'lord') s += 5; }       // 反贼集火主公
    else if (p.identity === 'loyal') { if (t.identity === 'lord') s -= 9; }  // 忠臣绝不伤主
    return s;
  },
  isFriend(game, p, t) {
    if (t === p) return true;
    if (game.mode === '1v1') return false;
    if (game.mode === '2v2') return p.team === t.team;
    const k = (p.aiKnow && p.aiKnow[t.seat]) || 0;
    if (p.identity === 'lord') return k < -1;
    if (p.identity === 'loyal') return t.identity === 'lord' || t.identity === 'loyal' || k < -2;
    if (p.identity === 'rebel') return k < -2;
    return false;
  },
  /* ---------- 选牌估值 ---------- */
  cardValue(c, p) {
    let v = 0;
    if (c.name === '桃') v += 8;
    else if (c.name === '闪') v += 6;
    else if (c.name === '杀') v += 5;
    else if (c.name === '无懈可击') v += 4;
    else if (c.name === '无中生有') v += 4;
    else if (c.name === '过河拆桥' || c.name === '顺手牵羊' || c.name === '决斗') v += 3;
    else if (c.name === '乐不思蜀') v += 3;
    else if (c.name === '南蛮入侵' || c.name === '万箭齐发' || c.name === '桃园结义') v += 2;
    else if (c.name === '闪电') v += 1;
    else if (c.type === 'equip') {
      v += c.sub === 'weapon' ? 3 : c.sub === 'armor' ? 4 : 2;
      const slot = { weapon: 'weapon', armor: 'armor', horseP: 'horseP', horseM: 'horseM' }[c.sub];
      if (p && p.equips && p.equips[slot]) v -= 4; // 已有同槽装备则贬值
    }
    return v;
  },
  pickDiscard(p, n) {
    return p.hand.slice().sort((a, b) => this.cardValue(a, p) - this.cardValue(b, p)).slice(0, n);
  },
  equipValue(c) {
    switch (c.name) {
      case '诸葛连弩': return 5;
      case '青釭剑': case '贯石斧': return 4;
      case '丈八蛇矛': case '雌雄双股剑': return 3;
      case '八卦阵': return 5;
      case '仁王盾': return 4;
      case '赤兔': case '的卢': return 3;
    }
    return 2;
  },
  canRespondAs(game, p, card, name) {
    if (card.zone !== 'hand') return false;
    if (card.name === name) return true;
    return !!SGS.skills.cardAs(game, p, card, name);
  },
  hasRespond(game, t, need) {
    return t.hand.some(c => this.canRespondAs(game, t, c, need));
  },
  /* ---------- 目标选择 ---------- */
  async bestTarget(game, p, opts) {
    opts = opts || {};
    let pool = game.players.filter(t => t !== p && t.alive);
    if (opts.rangeOK) {
      const ok = [];
      for (const t of pool) if (await opts.rangeOK(t)) ok.push(t);
      pool = ok;
    }
    if (!pool.length) return null;
    // 内奸：前期隐藏身份打最弱非主公；后期（≤3人）斩主
    if (p.identity === 'traitor' && game.mode === '8p') {
      if (game.aliveCount() <= 3) {
        const lord = game.players.find(q => q.identity === 'lord');
        if (lord && lord.alive && pool.includes(lord)) return lord;
      }
      const nonLord = pool.filter(t => t.identity !== 'lord');
      const sel = nonLord.length ? nonLord : pool;
      return sel.slice().sort((a, b) => (a.hp * 3 + a.hand.length) - (b.hp * 3 + b.hand.length))[0];
    }
    const score = t => {
      let s = -(t.hp * 3) - t.hand.length + this.enemyScore(game, p, t) * 2;
      if (t.equips.armor || t.equips.weapon) s -= 1;
      if (opts.judgeArea && t.judges.length) s -= 2;
      if (opts.preferLowHand && t.hand.length <= 2) s += 3;
      return s;
    };
    return pool.slice().sort((a, b) => score(b) - score(a))[0];
  },
  bestTargetIn(game, p, pool) {
    const score = t => -(t.hp * 3) - t.hand.length + this.enemyScore(game, p, t) * 2;
    return pool.slice().sort((a, b) => score(b) - score(a))[0];
  },
  /* ---------- 响应决策 ---------- */
  async respond(game, p, kind, opts) {
    this.initPlayer(game, p);
    await SGS.sleep(320);
    opts = opts || {};
    if (kind === 'shan') {
      const need = opts.need || 1;
      const shans = p.hand.filter(c => this.canRespondAs(game, p, c, '闪'));
      if (shans.length >= need) return shans.slice(0, need);
      return null; // 凑不齐所需张数则不浪费
    }
    if (kind === 'sha') {
      const need = opts.need || 1;
      const shas = p.hand.filter(c => this.canRespondAs(game, p, c, '杀'));
      if (shas.length >= need) return shas.slice(0, need);
      return null;
    }
    if (kind === 'tao') {
      const dying = opts.dying;
      if (dying !== p && !this.wantSave(game, p, dying)) return null;
      const needN = Math.max(1, 1 - dying.hp);
      const taos = p.hand.filter(c => this.canRespondAs(game, p, c, '桃'));
      if (!taos.length) return null;
      return taos.slice(0, Math.min(needN, taos.length)); // 只用到脱离濒死为止
    }
    if (kind === 'wuxie') {
      const card = opts.card, target = opts.target || p;
      const harmful = ['决斗', '过河拆桥', '顺手牵羊', '南蛮入侵', '万箭齐发', '乐不思蜀'];
      const beneficial = ['无中生有', '桃园结义'];
      const wx = p.hand.find(c => c.name === '无懈可击');
      if (!wx) return null;
      if (harmful.includes(card.name) && this.isFriend(game, p, target)) return [wx];
      if (beneficial.includes(card.name) && this.enemyScore(game, p, target) > 0) return [wx];
      return null;
    }
    return null;
  },
  wantSave(game, p, dying) {
    if (dying === p) return true; // 自救必救
    if (game.mode === '1v1') return false;
    if (game.mode === '2v2') return p.team === dying.team;
    const k = (p.aiKnow && p.aiKnow[dying.seat]) || 0;
    if (p.identity === 'lord') return k < -1 || dying.identity === 'loyal';
    if (p.identity === 'loyal') return dying.identity === 'lord' || dying.identity === 'loyal';
    if (p.identity === 'rebel') return k < -2; // 行为友善者才救
    return false; // 内奸只救自己
  },
  /* ---------- 通用应答分发 ---------- */
  async answer(game, p, req) {
    this.initPlayer(game, p);
    switch (req.type) {
      case 'skill': return this.optionalSkill(game, p, req.skill, req.sctx);
      case 'chooseTarget': return this.chooseTarget(game, p, req);
      case 'chooseTargets': return this.chooseTargets(game, p, req);
      case 'pickCards': return this.pickCards(game, p, req);
      case 'respond': return this.respond(game, p, req.kind, req);
      case 'yesNo': return this.yesNo(game, p, req.prompt);
      case 'choose': return this.choose(game, p, req.prompt, req.options);
    }
    return null;
  },
  async optionalSkill(game, p, skill, sctx) {
    await SGS.sleep(300);
    const txt = JSON.stringify(skill.effects || []);
    if (/draw|recoverHp|stealFrom|gainMark|changeMaxHp/.test(txt)) return true; // 有收益就发动
    if (/loseHp/.test(txt)) return p.hp > 2;
    return false;
  },
  async chooseTarget(game, p, req) {
    await SGS.sleep(300);
    const pool = req.pool || [];
    const skill = req.skill || {};
    const eff = JSON.stringify(skill.effects || []);
    const cost = skill.cost || {};
    if (cost.type === 'give') { // 仁德类：交牌给受伤最重的友军
      const friends = pool.filter(t => this.isFriend(game, p, t));
      const sel = friends.length ? friends : pool;
      return sel.slice().sort((a, b) => (b.maxHp - b.hp) - (a.maxHp - a.hp))[0];
    }
    if (eff.includes('recoverHp')) { // 治疗类：优先受伤友军
      const friends = pool.filter(t => this.isFriend(game, p, t) && t.hp < t.maxHp);
      const sel = friends.length ? friends : pool;
      return sel.slice().sort((a, b) => (b.maxHp - b.hp) - (a.maxHp - a.hp))[0];
    }
    return this.bestTargetIn(game, p, pool);
  },
  async chooseTargets(game, p, req) {
    await SGS.sleep(300);
    const pool = (req.pool || []).slice()
      .sort((a, b) => this.enemyScore(game, p, b) - this.enemyScore(game, p, a));
    return pool.slice(0, req.count || 2);
  },
  async pickCards(game, p, req) {
    await SGS.sleep(300);
    if (req.n === 'any') {
      if (req.prompt && req.prompt.includes('交给')) { // 仁德：给出最差的两张
        const min = req.min || 2;
        return p.hand.slice().sort((a, b) => this.cardValue(a, p) - this.cardValue(b, p)).slice(0, Math.min(min, p.hand.length));
      }
      if (req.prompt && req.prompt.includes('弃置')) { // 制衡：弃废牌
        const bad = p.hand.filter(c => this.cardValue(c, p) <= 2);
        return bad.length ? bad : [p.hand[0]];
      }
      return [];
    }
    return this.pickDiscard(p, req.n || 1);
  },
  async pickCardTarget(game, p, options, t, why) {
    await SGS.sleep(300);
    if (this.enemyScore(game, p, t) > 0) { // 拆敌方：优先防具/武器/加一马，其次乐
      const eq = options.find(o => o.zone === 'equip');
      if (eq) return eq;
    } else { // 帮友军：优先拆乐不思蜀
      const jd = options.find(o => o.zone === 'judge' && o.card.name === '乐不思蜀');
      if (jd) return jd;
    }
    return options[SGS.rand(options.length)];
  },
  async yesNo(game, p, prompt) {
    await SGS.sleep(300);
    if (prompt && prompt.includes('贯石斧')) return true;
    return true;
  },
  async choose(game, p, prompt, options) {
    await SGS.sleep(300);
    if (prompt && prompt.includes('雌雄双股剑')) {
      return p.hand.some(c => this.cardValue(c, p) <= 2) ? 0 : 1;
    }
    return SGS.rand(options.length);
  },
  async chooseSuit(game, p) {
    await SGS.sleep(300);
    return SGS.pick(['♠', '♥', '♣', '♦']);
  },
  /* ---------- 出牌阶段 ---------- */
  async playPhase(game, p) {
    this.initPlayer(game, p);
    await SGS.sleep(420);
    const step = async () => { await SGS.sleep(330); };
    // 1) 受伤吃桃
    let g = 0;
    while (p.hp < p.maxHp && g++ < 5 && !game.over && p.alive) {
      const tao = p.hand.find(c => c.name === '桃');
      if (!tao) break;
      await game.useCard(p, tao, []);
      await step();
    }
    // 2) 乐不思蜀 → 最佳敌方目标
    const le = p.hand.find(c => c.name === '乐不思蜀');
    if (le) {
      const t = await this.bestTarget(game, p);
      if (t) { await game.useCard(p, le, [t]); await step(); }
    }
    // 3) 闪电（小概率，判定区为空时）
    const sd = p.hand.find(c => c.name === '闪电');
    if (sd && !p.judges.some(j => j.name === '闪电') && Math.random() < 0.3) { await game.useCard(p, sd, []); await step(); }
    // 4) 装备（比现有更好才换）
    for (const c of p.hand.slice()) {
      if (game.over || !p.alive) return;
      if (c.type !== 'equip' || c.zone !== 'hand') continue;
      const slot = { weapon: 'weapon', armor: 'armor', horseP: 'horseP', horseM: 'horseM' }[c.sub];
      const cur = p.equips[slot];
      if (!cur || this.equipValue(c) > this.equipValue(cur)) { await game.useCard(p, c, []); await step(); }
    }
    // 5) 无中生有
    for (let k = 0; k < 3; k++) {
      const c = p.hand.find(x => x.name === '无中生有');
      if (!c) break;
      await game.useCard(p, c, []);
      await step();
    }
    // 6) 过河拆桥 / 顺手牵羊 → 敌方
    for (const name of ['过河拆桥', '顺手牵羊']) {
      if (game.over || !p.alive) return;
      const c = p.hand.find(x => x.name === name);
      if (!c) continue;
      const rangeOK = name === '顺手牵羊' ? async t => (await game.distance(p, t)) <= await game.trickRange(p) : null;
      const t = await this.bestTarget(game, p, { rangeOK });
      if (t) { await game.useCard(p, c, [t]); await step(); }
    }
    // 7) 决斗 → 手牌少的敌人
    const dj = p.hand.find(c => c.name === '决斗');
    if (dj) {
      const rangeOK = async t => (await game.distance(p, t)) <= await game.trickRange(p);
      const t = await this.bestTarget(game, p, { preferLowHand: true });
      if (t && t.hand.length <= 2) { await game.useCard(p, dj, [t]); await step(); }
    }
    // 8) 南蛮 / 万箭（净收益才放）
    for (const name of ['南蛮入侵', '万箭齐发']) {
      if (game.over || !p.alive) return;
      const c = p.hand.find(x => x.name === name);
      if (c && this.aoeWorth(game, p, name)) { await game.useCard(p, c, []); await step(); }
    }
    // 9) 桃园结义（己方受伤多于敌方）
    const ty = p.hand.find(c => c.name === '桃园结义');
    if (ty) {
      let ha = 0, he = 0;
      for (const t of game.players) {
        if (!t.alive || t.hp >= t.maxHp) continue;
        if (this.isFriend(game, p, t)) ha++;
        else if (this.enemyScore(game, p, t) > 0) he++;
      }
      if (ha > he) { await game.useCard(p, ty, []); await step(); }
    }
    // 10) 主动技能（制衡/苦肉/仁德/青囊/离间/反间等）
    for (const skill of p.general.skills || []) {
      if (game.over || !p.alive) return;
      if (skill.type !== 'active') continue;
      if (!SGS.skills.active(game, p, skill)) continue;
      await this.useActiveSkill(game, p, skill);
    }
    // 11) 杀（实体杀 → 转化杀 → 丈八蛇矛）
    await this.trySha(game, p);
  },
  async useActiveSkill(game, p, skill) {
    const st = p.skillState[skill.name];
    if (skill.limit) {
      const s = skill.limit.scope, m = skill.limit.max || 1;
      if ((s === 'phase' && st.usedPhase >= m) || (s === 'turn' && st.usedTurn >= m) || (s === 'game' && st.usedGame >= m)) return false;
    }
    const cost = skill.cost || { type: 'none' };
    if (cost.type === 'loseHp' && p.hp <= 2) return false; // 血量低不苦肉
    if ((cost.type === 'discard' || cost.type === 'discardAny') && p.hand.length < (cost.n || 1)) return false;
    if (cost.type === 'discardAny') {
      const bad = p.hand.filter(c => this.cardValue(c, p) <= 2).length;
      if (!bad) return false; // 没有废牌不制衡
    }
    if (cost.type === 'give') {
      if (p.hand.length < (cost.min || 1)) return false;
      const allyW = game.players.some(t => t !== p && t.alive && this.isFriend(game, p, t) && t.hp < t.maxHp);
      if (!allyW) return false;
    }
    const sctx = SGS.skills.mkCtx(game, p, skill, {});
    const ok = await SGS.skills.run(game, p, skill, sctx);
    await SGS.sleep(330);
    return ok;
  },
  aoeWorth(game, p, name) {
    let score = 0;
    for (const t of game.players) {
      if (t === p || !t.alive) continue;
      const can = this.hasRespond(game, t, name === '南蛮入侵' ? '杀' : '闪');
      if (this.enemyScore(game, p, t) > 0) score += can ? 0.5 : 2.5;
      else score -= can ? 0.2 : 1.5;
    }
    return score > 0;
  },
  async trySha(game, p) {
    const lim = await game.shaLimit(p);
    const range = await game.attackRange(p);
    while (p.usedSha < lim && !game.over && p.alive) {
      const t = await this.bestTarget(game, p, { rangeOK: async x => (await game.distance(p, x)) <= range });
      if (!t) break;
      let sha = p.hand.find(c => c.name === '杀');
      let asName = null;
      if (!sha) {
        for (const c of p.hand) {
          if (['桃', '无懈可击'].includes(c.name)) continue; // 不拿关键牌转化
          if (SGS.skills.cardAs(game, p, c, '杀')) { sha = c; asName = '杀'; break; }
        }
      }
      if (sha) {
        await game.useCard(p, sha, [t], asName ? { asName, via: '技能转化' } : {});
        await SGS.sleep(330);
        continue;
      }
      if (p.equips.weapon && p.equips.weapon.name === '丈八蛇矛' && p.hand.length >= 2) {
        const pair = this.pickDiscard(p, 2);
        if (pair.length === 2) {
          await game.useCard(p, pair[0], [t], { pairCards: pair, via: '丈八蛇矛' });
          await SGS.sleep(330);
          continue;
        }
      }
      break;
    }
  }
};
console.log('√ 段5 AI 已加载');
