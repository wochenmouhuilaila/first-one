const $ = id => document.getElementById(id);
const make = (tag, cls, html) => { const el = document.createElement(tag); if (cls) el.className = cls; if (html !== undefined) el.innerHTML = html; return el; };
SGS.showScreen = function(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
};
SGS.toast = function(msg) { if (SGS.ui && SGS.ui.toast) SGS.ui.toast(msg); else alert(msg); };

/* ---------- 自定义武将存储 ---------- */
SGS.customStore = {
  key: 'sgs_custom_generals_v1',
  load() { try { return JSON.parse(localStorage.getItem(this.key)) || []; } catch (e) { return []; } },
  save(list) { localStorage.setItem(this.key, JSON.stringify(list)); },
  add(g) { const list = this.load(); const i = list.findIndex(x => x.name === g.name); if (i >= 0) list[i] = g; else list.push(g); this.save(list); },
  remove(name) { this.save(this.load().filter(x => x.name !== name)); }
};
SGS.allGenerals = function() { return SGS.GENERALS.concat(SGS.customStore.load()); };

/* ---------- 引擎补丁：other2 放宽 + 新原子 ---------- */
(function() {
  const _ct = SGS.skills.chooseTargets;
  SGS.skills.chooseTargets = async function(game, player, skill, sctx, tr) {
    if (tr.type === 'other2') {
      const alive = game.players.filter(p => p.alive && p !== player);
      const ok = p => { if (!tr.filter) return true; return SGS.cond.check(tr.filter, Object.assign({}, sctx, { target: p })); };
      const pool = alive.filter(ok);
      if (!pool.length) return false;
      const ts = player.ai ? await SGS.reqAI(game, player, { type: 'chooseTargets', pool, skill, sctx, count: 2 })
                          : await SGS.req(game, player, { type: 'chooseTargets', pool, skill, sctx, count: 2, prompt: tr.prompt });
      return ts || [];
    }
    return _ct.call(this, game, player, skill, sctx, tr);
  };
  SGS.FX.modifyDamage = async ctx => { const d = ctx.dmg || (ctx.data && ctx.data.dmg); if (d && !d.prevented) d.n = Math.max(0, (d.n || 0) + (ctx.delta || ctx.count || 1)); };
  SGS.FX.preventDamage = async ctx => { const d = ctx.dmg || (ctx.data && ctx.data.dmg); if (d) d.prevented = true; };
  SGS.FX.skipDraw = async ctx => { if (ctx.data) ctx.data.skipDraw = true; };
  SGS.FX.skipPlay = async ctx => { ctx.owner.skipPlay = true; };
})();

/* ---------- 编辑器主体 ---------- */
SGS.editor = {
  skills: [], formIndex: -1,
  EVENT_OPTS: [
    ['phaseTurnStart', '回合开始时'], ['phasePrepareStart', '准备阶段开始时'], ['phaseJudgeStart', '判定阶段开始时'],
    ['phaseDrawStart', '摸牌阶段开始时'], ['phasePlayStart', '出牌阶段开始时'], ['phaseDiscardStart', '弃牌阶段开始时'],
    ['phaseEndStart', '结束阶段开始时'], ['phaseTurnEnd', '回合结束时'], ['gameStart', '游戏开始时'],
    ['cardUseWhen', '使用牌时'], ['cardBecomeTargetWhen', '成为牌的目标时'], ['cardTargetAfter', '成为目标后'],
    ['damageDealing', '造成伤害时（可改伤害值）'], ['damageTaking', '受到伤害时（可防止）'],
    ['damageDealt', '造成伤害后'], ['damageTaken', '受到伤害后'],
    ['recoverAfter', '回复体力后'], ['judgeBefore', '判定牌生效前'], ['judgeAfter', '判定牌生效后'],
    ['drawAfter', '摸牌后'], ['discardAfter', '弃置手牌后'], ['loseAfter', '失去手牌后'],
    ['gainAfter', '获得牌后'], ['nearDeathEnter', '进入濒死状态时'], ['deathAfter', '阵亡后']
  ],
  EVENT_LABEL: {
    phaseTurnStart: '回合开始时', phasePrepareStart: '准备阶段开始时', phaseJudgeStart: '判定阶段开始时',
    phaseDrawStart: '摸牌阶段开始时', phasePlayStart: '出牌阶段开始时', phaseDiscardStart: '弃牌阶段开始时',
    phaseEndStart: '结束阶段开始时', phaseTurnEnd: '回合结束时', gameStart: '游戏开始时',
    cardUseWhen: '当你使用牌时', cardBecomeTargetWhen: '当你成为牌的目标时', cardTargetAfter: '当你成为目标后',
    damageDealing: '当你造成伤害时', damageTaking: '当你受到伤害时', damageDealt: '当你造成伤害后',
    damageTaken: '当你受到伤害后', recoverAfter: '当你回复体力后', judgeBefore: '当你的判定牌生效前',
    judgeAfter: '当你的判定牌生效后', drawAfter: '当你摸牌后', discardAfter: '当你弃置手牌后',
    loseAfter: '当你失去手牌后', gainAfter: '当你获得牌后', nearDeathEnter: '当你进入濒死状态时', deathAfter: '当你阵亡后'
  },
  EFFECT_OPTS: [
    ['draw', '摸牌'], ['drawToHandLimit', '补牌至体力上限'], ['discard', '弃置手牌'], ['give', '交给手牌'],
    ['stealFrom', '获得其牌'], ['drawFromOthers', '获得两名角色各一张'], ['loseHp', '失去体力'],
    ['recoverHp', '回复体力'], ['dealDamage', '造成伤害'], ['modifyDamage', '伤害值修正（造成伤害时）'],
    ['preventDamage', '防止伤害（受伤时）'], ['changeMaxHp', '体力上限修正'], ['flip', '翻面'],
    ['chainOn', '横置'], ['gainMark', '获得标记'], ['gainDamageCard', '获得伤害牌'],
    ['ironBlock', '令其不可出【闪】'], ['skipDraw', '跳过摸牌阶段'], ['skipPlay', '跳过出牌阶段'], ['judge', '判定（分支）']
  ],
  TARGET_OPTS: [['self', '自己'], ['target', '目标'], ['targets', '所选目标'], ['source', '伤害来源'], ['allOthers', '其他所有角色'], ['all', '所有角色']],
  COST_OPTS: [['none', '无消耗'], ['discardN', '弃置 N 张手牌'], ['discardAny', '弃置任意张手牌'], ['loseHpN', '失去 N 点体力'], ['giveN', '交给目标至少 N 张手牌']],
  MODIFY_OPTS: [['drawCount', '摸牌阶段摸牌数修正'], ['shaLimit', '使用【杀】无次数限制'], ['distance', '与其他角色的距离修正'],
    ['handLimit', '手牌上限修正'], ['attackRange', '攻击范围修正'], ['trickRange', '使用锦囊无距离限制'], ['responsePlus', '对手响应需多打牌']],
  FILTER_OPTS: [['any', '任意手牌'], ['red', '红色牌'], ['black', '黑色牌'], ['heart', '♥'], ['diamond', '♦'], ['spade', '♠'], ['club', '♣']],
  filterToJSON(v) {
    return v === 'any' ? { op: 'any' } : v === 'red' ? { op: 'isRed' } : v === 'black' ? { op: 'isBlack' }
      : { op: 'isSuit', suit: { heart: '♥', diamond: '♦', spade: '♠', club: '♣' }[v] };
  },
  filterToVal(f) { return !f || f.op === 'any' ? 'any' : f.op === 'isRed' ? 'red' : f.op === 'isBlack' ? 'black' : { '♥': 'heart', '♦': 'diamond', '♠': 'spade', '♣': 'club' }[f.suit] || 'any'; },
  /* ---------- 初始化 ---------- */
  init() {
    const sel = (id, pairs, val) => { $(id).innerHTML = pairs.map(([v, l]) => '<option value="' + v + '"' + (v === val ? ' selected' : '') + '>' + l + '</option>').join(''); };
    sel('sk-trigger', this.EVENT_OPTS, 'phaseTurnStart');
    sel('sk-cost', this.COST_OPTS, 'none');
    // 注入：触发者/自动发动
    const bt = $('block-trigger');
    $('sk-active-phase').parentElement.style.display = 'none';
    const row1 = make('div', 'ed-field');
    row1.innerHTML = '<label>触发者</label><select id="sk-subj"><option value="">按事件默认</option><option value="player">自己/使用者</option><option value="target">目标</option><option value="from">伤害来源</option></select>';
    bt.appendChild(row1);
    const row2 = make('div', 'ed-field');
    row2.innerHTML = '<label>自动发动</label><label style="width:auto"><input id="sk-auto" type="checkbox" checked> 满足条件即发动（不询问）</label>';
    bt.appendChild(row2);
    // 注入：被动修正面板
    const bp = make('div', 'ed-block hidden');
    bp.id = 'block-passive';
    bp.innerHTML = '<h4>第二步 · 被动修正</h4><div class="ed-field"><label>修正项</label><select id="pm-op"></select></div>' +
      '<div class="ed-field"><label>修正值</label><input id="pm-delta" type="number" value="-1" style="width:80px" title="正负均可，如 -1"> <span style="color:var(--dim);font-size:12px">距离/摸牌数等填增减值</span></div>';
    $('block-convert').after(bp);
    sel('pm-op', this.MODIFY_OPTS, 'drawCount');
    // 条件帮助
    const help = make('div', 'ed-field');
    help.innerHTML = '<label>语法</label><span style="font-size:11px;color:var(--dim);line-height:1.5">属性：hp maxHp lostHp handCount handLimit isWounded isAlive isYourTurn identity kingdom gender distance phase turn aliveCount cost state judgeRed judgeHeart judgeNum cardType isRed suit num<br>前缀：target.（目标）source.（伤害来源）　运算符：&gt; &lt; &gt;= &lt;= == != &amp;&amp; || !　例：<b>handCount &gt; hp</b>、<b>target.isWounded</b>、<b>hp &lt;= 2 &amp;&amp; isWounded</b></span>';
    $('sk-cond-preset').parentElement.after(help);
    // 目标过滤表达式
    const tf = make('div', 'ed-field');
    tf.innerHTML = '<label>目标过滤</label><input id="sk-target-filter" placeholder="可空。如 target.isWounded / target.gender == \'male\' / target.handCount >= 1">';
    $('sk-target').parentElement.after(tf);
    // 次数上限
    const lm = make('div', 'ed-field');
    lm.innerHTML = '<label>次数上限</label><input id="sk-limit-max" type="number" value="1" min="1" style="width:80px">';
    $('sk-limit').parentElement.after(lm);
    // 模板载入
    const tp = make('div', 'ed-field');
    tp.innerHTML = '<label>载入模板</label><select id="ed-template"></select><button id="btn-load-tpl" class="btn btn-ghost btn-sm">载入</button>';
    $('ed-name').parentElement.before(tp);
    // 绑定
    $('btn-editor').addEventListener('click', () => { SGS.showScreen('screen-editor'); SGS.editor.refreshAll(); });
    $('ed-back').addEventListener('click', () => SGS.showScreen('screen-menu'));
    $('btn-add-skill').addEventListener('click', () => this.openSkill(-1));
    $('btn-add-effect').addEventListener('click', () => { $('sk-effects').appendChild(this.buildEffectRow()); this.refreshPreview(); });
    $('ed-save').addEventListener('click', () => this.saveGeneral());
    $('ed-test').addEventListener('click', () => this.testGeneral());
    $('ed-export').addEventListener('click', () => this.exportJSON());
    $('ed-import').addEventListener('click', () => $('import-file').click());
    $('import-file').addEventListener('change', e => this.importJSON(e.target.files[0]));
    $('sk-save').addEventListener('click', () => this.commitSkill());
    $('sk-cancel').addEventListener('click', () => this.closeSkill());
    $('btn-load-tpl').addEventListener('click', () => this.loadTemplate());
    $('sk-type').addEventListener('change', () => this.toggleTypeUI());
    $('sk-cond-preset').addEventListener('change', () => { const v = $('sk-cond-preset').value; if (v) $('sk-cond').value = v; });
    $('sk-cost').addEventListener('change', () => this.rebuildCostN());
    $('pm-op').addEventListener('change', () => this.togglePassiveUI());
    ['ed-name', 'ed-title', 'ed-maxhp', 'ed-kingdom', 'ed-gender', 'sk-name', 'sk-class', 'sk-type', 'sk-trigger', 'sk-cond', 'sk-cost', 'sk-target', 'sk-limit', 'sk-quote', 'sk-mark'].forEach(id => {
      $(id).addEventListener('input', () => this.refreshPreview());
      $(id).addEventListener('change', () => this.refreshPreview());
    });
    this.rebuildCostN();
    this.refreshAll();
    console.log('√ 段7 编辑器已初始化');
  },
  /* ---------- 基础 UI ---------- */
  refreshAll() { this.renderSkillList(); this.refreshCustomList(); this.refreshTemplate(); this.refreshPreview(); this.refreshCharGrid(); },
  renderSkillList() {
    const box = $('ed-skill-list');
    box.innerHTML = '';
    this.skills.forEach((s, i) => {
      const row = make('div', 'ed-skill-item');
      row.innerHTML = '<span><b>' + s.name + '</b>　<span style="font-size:11px;color:var(--dim)">' + this.typeName(s) + '</span></span>' +
        '<span><button class="sk-del" data-i="' + i + '">✕</button></span>';
      row.onclick = e => { if (e.target.classList.contains('sk-del')) { this.skills.splice(i, 1); this.refreshAll(); } else this.openSkill(i); };
      box.appendChild(row);
    });
    if (!this.skills.length) box.innerHTML = '<div style="color:var(--dim);font-size:13px">暂无技能，点击下方「＋ 添加技能」</div>';
  },
  typeName(s) {
    const c = { normal: '普通技', locked: '锁定技', limited: '限定技', awaken: '觉醒技', lord: '主公技' }[s.skillClass];
    const t = { active: '主动', triggered: '触发', passive: '被动', conversion: '转化' }[s.type];
    return (c || '') + t + '技';
  },
  refreshTemplate() {
    const sel = $('ed-template');
    sel.innerHTML = '<option value="">— 选择一个武将作为模板 —</option>' +
      SGS.allGenerals().map(g => '<option value="' + g.name + '">' + g.name + '（' + SGS.KINGDOM[g.kingdom] + '）</option>').join('');
  },
  refreshCustomList() {
    const box = $('ed-custom-list');
    const list = SGS.customStore.load();
    box.innerHTML = list.length ? '' : '<div style="color:var(--dim);font-size:13px">还没有自定义武将</div>';
    list.forEach(g => {
      const row = make('div', 'ed-custom-row');
      row.innerHTML = '<span><b>' + g.name + '</b>（' + SGS.KINGDOM[g.kingdom] + ' · ' + g.maxHp + '血 · ' + (g.skills || []).length + '技能）</span>' +
        '<span><button class="btn btn-ghost btn-sm c-load">载入编辑</button> <button class="btn btn-danger btn-sm c-del">删除</button></span>';
      row.querySelector('.c-load').onclick = () => this.fillGeneral(g);
      row.querySelector('.c-del').onclick = () => { SGS.customStore.remove(g.name); this.refreshAll(); };
      box.appendChild(row);
    });
  },
  refreshCharGrid() {
    const box = $('char-select');
    if (!box) return;
    box.innerHTML = SGS.allGenerals().map((g, i) =>
      '<div class="char-card cc-king-' + g.kingdom + '" data-name="' + g.name + '">' +
      '<div class="cc-ava cc-king-' + g.kingdom + '">' + (g.gender === 'female' ? '♀' : '♂') + '</div>' +
      '<div class="cc-name">' + g.name + '</div>' +
      '<div class="cc-tag">' + (g.title || '') + '</div>' +
      '<div class="cc-hp">' + '❤'.repeat(g.maxHp) + '</div>' +
      '<div class="cc-tag">' + (g.skills || []).map(s => s.name).join(' ') + '</div></div>'
    ).join('');
  },
  /* ---------- 技能表单 ---------- */
  openSkill(i) {
    this.formIndex = i;
    const s = i >= 0 ? this.skills[i] : {
      name: '新技能', skillClass: 'normal', type: 'triggered', trigger: { event: 'phaseTurnStart' },
      condition: '', cost: { type: 'none' }, targetRule: { type: 'self' },
      effects: [{ op: 'draw', target: 'self', count: 1 }], limit: { scope: 'turn', max: 1 }, quote: '', auto: true
    };
    $('ed-skill-form').classList.remove('hidden');
    $('sk-name').value = s.name;
    $('sk-class').value = s.skillClass;
    $('sk-type').value = s.type;
    $('sk-trigger').value = (s.trigger && s.trigger.event) || 'phaseTurnStart';
    $('sk-subj').value = (s.trigger && s.trigger.subj) || '';
    $('sk-auto').checked = s.auto !== false;
    $('sk-cond').value = typeof s.condition === 'string' ? s.condition : '';
    if (s.activeWhen) $('sk-cond').value = typeof s.activeWhen === 'string' ? s.activeWhen : '';
    const cost = s.cost || { type: 'none' };
    $('sk-cost').value = cost.type === 'discard' ? 'discardN' : cost.type === 'loseHp' ? 'loseHpN' : cost.type === 'give' ? 'giveN' : cost.type || 'none';
    $('sk-cost-n').value = cost.n || cost.min || 1;
    $('sk-target').value = (s.targetRule && s.targetRule.type) || 'self';
    $('sk-target-filter').value = (s.targetRule && s.targetRule.filter && s.targetRule.filter.expr) || '';
    $('sk-limit').value = s.limit ? s.limit.scope : 'never';
    $('sk-limit-max').value = (s.limit && s.limit.max) || 1;
    $('sk-quote').value = s.quote || '';
    $('sk-mark').value = '';
    // 效果行
    $('sk-effects').innerHTML = '';
    (s.effects || []).forEach(e => $('sk-effects').appendChild(this.buildEffectRow(e)));
    // 转化条目
    $('cv-rows').innerHTML = '';
    (s.convert || []).forEach(cv => this.addConvertRow(cv));
    if (!(s.convert || []).length) this.addConvertRow();
    // 被动
    if (s.modify) {
      $('pm-op').value = s.modify.op;
      $('pm-delta').value = s.modify.delta !== undefined ? s.modify.delta : 1;
    }
    this.toggleTypeUI();
    this.rebuildCostN();
    this.togglePassiveUI();
    this.refreshPreview();
  },
  closeSkill() { this.formIndex = -1; $('ed-skill-form').classList.add('hidden'); this.refreshPreview(); },
  commitSkill() {
    const s = this.collectSkill();
    if (!s.name) { SGS.toast('请填写技能名'); return; }
    if (this.formIndex >= 0) this.skills[this.formIndex] = s;
    else this.skills.push(s);
    this.closeSkill();
    this.renderSkillList();
    this.refreshPreview();
    SGS.toast('技能「' + s.name + '」已保存到技能列表');
  },
  toggleTypeUI() {
    const t = $('sk-type').value;
    $('block-trigger').style.display = t === 'triggered' ? '' : 'none';
    $('block-convert').style.display = t === 'conversion' ? '' : 'none';
    $('block-passive').classList.toggle('hidden', t !== 'passive');
  },
  togglePassiveUI() {
    const op = $('pm-op').value;
    $('pm-delta').parentElement.style.display = (op === 'shaLimit' || op === 'trickRange') ? 'none' : '';
  },
  rebuildCostN() {
    const c = $('sk-cost').value;
    let el = $('sk-cost-n');
    if (!el) { el = make('input', ''); el.id = 'sk-cost-n'; el.type = 'number'; el.min = '1'; el.value = '1'; el.style.width = '80px'; $('sk-cost').after(el); }
    el.style.display = (c === 'none' || c === 'discardAny') ? 'none' : '';
  },
  /* ---------- 效果行 ---------- */
  buildEffectRow(e) {
    e = e || { op: 'draw', target: 'self', count: 1 };
    const row = make('div', 'effect-row');
    const NO_TARGET = ['skipDraw', 'skipPlay', 'gainDamageCard'];
    const NO_NUM = ['flip', 'chainOn', 'gainDamageCard', 'ironBlock', 'skipDraw', 'skipPlay', 'preventDamage', 'drawToHandLimit'];
    const JUDGE_FX = [['none', '无效果'], ['draw', '摸牌'], ['recoverHp', '回复体力'], ['dealDamage', '造成伤害'], ['loseHp', '失去体力'], ['discard', '弃置手牌'], ['gainMark', '获得标记'], ['ironBlock', '不可出闪']];
    const render = () => {
      let html = '<select class="ef-op">' + this.EFFECT_OPTS.map(([v, l]) => '<option value="' + v + '"' + (v === e.op ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>';
      if (!NO_TARGET.includes(e.op)) {
        html += '<select class="ef-target">' + this.TARGET_OPTS.map(([v, l]) => '<option value="' + v + '"' + (v === (e.target || 'self') ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>';
      }
      if (e.op === 'gainMark') html += '<input class="ef-mark" placeholder="标记名" value="' + (e.mark || '') + '">';
      if (!NO_NUM.includes(e.op) && e.op !== 'gainMark') {
        const val = e.delta !== undefined ? e.delta : (e.count || 1);
        html += '<input class="ef-num" type="number" value="' + val + '" title="数值，可负">';
      }
      if (e.op === 'judge') {
        const onSel = [['red', '红色'], ['black', '黑色'], ['heart', '♥'], ['diamond', '♦'], ['spade', '♠'], ['club', '♣'], ['numGE8', '点数≥8']];
        html += '<select class="j-on">' + onSel.map(([v, l]) => '<option value="' + v + '"' + (v === (e.on || 'red') ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>';
        const yes = e.then && e.then[0], no = e.else && e.else[0];
        html += '<span style="font-size:11px">成功→</span><select class="j-yes">' + JUDGE_FX.map(([v, l]) => '<option value="' + v + '"' + (v === (yes ? yes.op : 'dealDamage') ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' +
          '<input class="j-yes-num" type="number" value="' + ((yes && yes.count) || 1) + '">';
        html += '<span style="font-size:11px">失败→</span><select class="j-no">' + JUDGE_FX.map(([v, l]) => '<option value="' + v + '"' + (v === (no ? no.op : 'none') ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' +
          '<input class="j-no-num" type="number" value="' + ((no && no.count) || 1) + '">';
      }
      html += '<button class="ef-del btn btn-ghost btn-sm">✕</button>';
      row.innerHTML = html;
      row.querySelector('.ef-op').addEventListener('change', ev => { e.op = ev.target.value; render(); });
      row.querySelectorAll('select, input').forEach(el => el.addEventListener('change', () => { row.collect(); SGS.editor.refreshPreview(); }));
      row.querySelector('.ef-del').onclick = () => { row.remove(); SGS.editor.refreshPreview(); };
    };
    row.collect = () => {
      const os = row.querySelector('.ef-op'); if (!os) return e;
      e.op = os.value;
      const ts = row.querySelector('.ef-target'); if (ts) e.target = ts.value;
      const mk = row.querySelector('.ef-mark'); if (mk) e.mark = mk.value.trim() || '权';
      const nm = row.querySelector('.ef-num');
      if (nm) { const v = +nm.value || 0; if (['changeMaxHp', 'modifyDamage'].includes(e.op)) e.delta = v; else e.count = v; }
      if (e.op === 'judge') {
        e.on = row.querySelector('.j-on').value;
        const y = row.querySelector('.j-yes').value, yn = +row.querySelector('.j-yes-num').value || 0;
        const n2 = row.querySelector('.j-no').value, nn = +row.querySelector('.j-no-num').value || 0;
        e.then = y === 'none' ? undefined : [{ op: y, target: 'target', count: yn }];
        e.else = n2 === 'none' ? undefined : [{ op: n2, target: 'target', count: nn }];
      }
      return e;
    };
    render();
    return row;
  },
  /* ---------- 转化条目 ---------- */
  addConvertRow(cv) {
    cv = cv || { as: '杀', filter: { op: 'any' }, when: 'any' };
    const box = $('cv-rows');
    const row = make('div', 'ed-field');
    row.innerHTML = '<select class="cv-as">' + Object.keys(SGS.CARD_INFO).map(n => '<option' + (n === cv.as ? ' selected' : '') + '>' + n + '</option>').join('') + '</select>' +
      '<select class="cv-filter">' + this.FILTER_OPTS.map(([v, l]) => '<option value="' + v + '"' + (v === this.filterToVal(cv.filter) ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' +
      '<select class="cv-when"><option value="any"' + (cv.when !== 'outsideTurn' && cv.when !== 'insideTurn' ? ' selected' : '') + '>任何时候</option>' +
      '<option value="outsideTurn"' + (cv.when === 'outsideTurn' ? ' selected' : '') + '>仅回合外</option>' +
      '<option value="insideTurn"' + (cv.when === 'insideTurn' ? ' selected' : '') + '>仅回合内</option></select>' +
      '<button class="cv-del btn btn-ghost btn-sm">✕</button>';
    row.querySelector('.cv-del').onclick = () => { row.remove(); SGS.editor.refreshPreview(); };
    row.querySelectorAll('select').forEach(el => el.addEventListener('change', () => SGS.editor.refreshPreview()));
    box.appendChild(row);
    return row;
  },
  /* ---------- 收集表单数据 ---------- */
  condExpr() { const p = $('sk-cond-preset').value, c = $('sk-cond').value.trim(); return c || p; },
  collectSkill() {
    const type = $('sk-type').value;
    const skill = { name: $('sk-name').value.trim() || '未命名', skillClass: $('sk-class').value, type, desc: '' };
    const cond = this.condExpr();
    if (type === 'active') {
      skill.trigger = { event: 'phasePlayStart' };
      if (cond) skill.activeWhen = cond;
    } else if (type === 'triggered') {
      skill.trigger = { event: $('sk-trigger').value };
      const subj = $('sk-subj').value;
      if (subj) skill.trigger.subj = subj;
      skill.auto = $('sk-auto').checked;
      if (cond) skill.condition = cond;
    } else if (type === 'passive') {
      skill.modify = this.collectModify();
      if (cond) skill.activeWhen = cond;
    } else if (type === 'conversion') {
      skill.convert = [];
      [...document.querySelectorAll('#cv-rows .ed-field')].forEach(r => {
        skill.convert.push({ as: r.querySelector('.cv-as').value, filter: this.filterToJSON(r.querySelector('.cv-filter').value), when: r.querySelector('.cv-when').value, regions: ['hand'] });
      });
      if (cond) skill.activeWhen = cond;
    }
    const costT = $('sk-cost').value;
    if (costT === 'discardN') skill.cost = { type: 'discard', n: +$('sk-cost-n').value || 1 };
    else if (costT === 'loseHpN') skill.cost = { type: 'loseHp', n: +$('sk-cost-n').value || 1 };
    else if (costT === 'giveN') skill.cost = { type: 'give', min: +$('sk-cost-n').value || 1 };
    else if (costT === 'discardAny') skill.cost = { type: 'discardAny' };
    skill.targetRule = { type: $('sk-target').value };
    const tf = $('sk-target-filter').value.trim();
    if (tf) skill.targetRule.filter = { op: 'expr', expr: tf };
    if ($('sk-target').value === 'other2') skill.targetRule.prompt = '选择至多两名角色';
    skill.effects = [...document.querySelectorAll('#sk-effects .effect-row')].map(r => r.collect()).filter(Boolean);
    const scope = $('sk-limit').value;
    if (scope !== 'never') skill.limit = { scope, max: +$('sk-limit-max').value || 1 };
    const q = $('sk-quote').value.trim();
    skill.quote = q || $('ed-line').value.trim() || '';
    if (skill.skillClass === 'lord') skill.lordOnly = true;
    if (skill.skillClass === 'awaken') skill.auto = true;
    skill.desc = this.genDesc(skill);
    return skill;
  },
  collectModify() {
    const op = $('pm-op').value;
    if (op === 'shaLimit' || op === 'trickRange') return { op, value: 'inf' };
    return { op, delta: +$('pm-delta').value || 0 };
  },
  /* ---------- 自动生成技能描述 ---------- */
  effectText(e) {
    const n = e.delta !== undefined ? e.delta : (e.count || 1);
    switch (e.op) {
      case 'draw': return '摸' + n + '张牌';
      case 'drawToHandLimit': return '将手牌补至体力上限';
      case 'discard': return '弃置' + n + '张手牌';
      case 'give': return '交给其' + n + '张手牌';
      case 'stealFrom': return '获得其' + n + '张牌';
      case 'drawFromOthers': return '获得至多两名其他角色各一张牌';
      case 'loseHp': return '失去' + n + '点体力';
      case 'recoverHp': return '回复' + n + '点体力';
      case 'dealDamage': return '对其造成' + n + '点伤害';
      case 'modifyDamage': return '此伤害' + (n >= 0 ? '+' : '') + n;
      case 'preventDamage': return '防止此伤害';
      case 'changeMaxHp': return '体力上限' + (n >= 0 ? '+' : '') + n;
      case 'flip': return '翻面';
      case 'chainOn': return '横置';
      case 'gainMark': return '获得' + n + '个「' + (e.mark || '权') + '」标记';
      case 'gainDamageCard': return '获得造成伤害的牌';
      case 'ironBlock': return '令其不能出【闪】';
      case 'skipDraw': return '跳过摸牌阶段';
      case 'skipPlay': return '跳过出牌阶段';
      case 'judge': {
        const onT = { red: '红色', black: '黑色', heart: '♥', diamond: '♦', spade: '♠', club: '♣', numGE8: '点数≥8' }[e.on] || '红色';
        const y = e.then && e.then.length ? this.effectText(e.then[0]) : '无效果';
        const no = e.else && e.else.length ? this.effectText(e.else[0]) : '无效果';
        return '判定：' + onT + '则' + y + '，否则' + no;
      }
    }
    return '';
  },
  genDesc(skill) {
    const CLS = { locked: '锁定技，', limited: '限定技，', awaken: '觉醒技，', lord: '主公技，' };
    const LIM = { phase: '限一次', turn: '每回合限一次', game: '整局限一次', never: '' };
    const prefix = CLS[skill.skillClass] || '';
    const lim = skill.limit ? (LIM[skill.limit.scope] || '') : '';
    if (skill.type === 'conversion') {
      const parts = (skill.convert || []).map(cv => {
        const f = { any: '任意手牌', isRed: '红色牌', isBlack: '黑色牌' }[cv.filter.op] || (cv.filter.op === 'isSuit' ? cv.filter.suit : '牌');
        const when = cv.when === 'outsideTurn' ? '，仅回合外' : cv.when === 'insideTurn' ? '，仅回合内' : '';
        return '你可以将' + f + '当【' + cv.as + '】使用或打出' + when;
      });
      return prefix + parts.join('；') + '。';
    }
    if (skill.type === 'passive') {
      const m = skill.modify, d = m.delta;
      const text = {
        drawCount: '摸牌阶段摸牌数' + (d >= 0 ? '+' : '') + d,
        shaLimit: '使用【杀】无次数限制',
        distance: '与其他角色的距离' + (d >= 0 ? '+' : '') + d,
        handLimit: '手牌上限' + (d >= 0 ? '+' : '') + d,
        attackRange: '攻击范围' + (d >= 0 ? '+' : '') + d,
        trickRange: '使用锦囊无距离限制',
        responsePlus: '对手需多打' + (Math.abs(d) || 1) + '张牌响应'
      }[m.op];
      return prefix + text + '。';
    }
    const costT = {
      none: '', discardN: '你可以弃置' + skill.cost.n + '张手牌，', discardAny: '你可以弃置任意张手牌，',
      loseHpN: '你可以失去' + skill.cost.n + '点体力，', giveN: '你可以将至少' + (skill.cost.min || 1) + '张手牌交给目标，'
    }[skill.cost ? skill.cost.type : 'none'];
    const tgtT = {
      self: '', other: '选择一名其他角色，', any: '选择一名角色，', allOthers: '令所有其他角色',
      source: '令伤害来源', all: '令所有角色', other2: '选择至多两名其他角色，'
    }[skill.targetRule ? skill.targetRule.type : 'self'];
    const effT = (skill.effects || []).map(e => this.effectText(e)).join('，');
    const head = skill.type === 'active' ? '出牌阶段' + (lim ? lim + '，' : '，') : (this.EVENT_LABEL[skill.trigger.event] || '') + '，';
    return prefix + head + costT + tgtT + (effT || '无效果') + '。';
  },
  /* ---------- 整个武将的收集/校验 ---------- */
  collectGeneral() {
    const name = $('ed-name').value.trim();
    if (!name) { SGS.toast('请填写武将名'); return null; }
    const skills = this.skills.slice();
    if (this.formIndex >= 0) skills[this.formIndex] = this.collectSkill();
    const hp = Math.min(8, Math.max(1, +$('ed-maxhp').value || 3));
    return {
      id: 'custom_' + name, name, title: $('ed-title').value.trim() || '自创武将',
      kingdom: $('ed-kingdom').value, gender: $('ed-gender').value, maxHp: hp,
      quote: $('ed-line').value.trim() || '', skills, custom: true
    };
  },
  refreshPreview() {
    const g = this.collectGeneral();
    $('ed-preview').textContent = g ? JSON.stringify(g, null, 1) : '尚未生成…（请先填写武将名）';
  },
  fillGeneral(g) {
    $('ed-name').value = g.name; $('ed-title').value = g.title || '';
    $('ed-kingdom').value = g.kingdom; $('ed-gender').value = g.gender || 'male';
    $('ed-maxhp').value = g.maxHp; $('ed-line').value = g.quote || '';
    this.skills = SGS.deepClone(g.skills || []);
    this.closeSkill();
    this.refreshAll();
    SGS.toast('已载入模板：' + g.name);
  },
  loadTemplate() {
    const name = $('ed-template').value;
    const g = SGS.allGenerals().find(x => x.name === name);
    if (g) this.fillGeneral(g);
  },
  /* ---------- 保存 / 测试 / 导入导出 ---------- */
  saveGeneral() {
    const g = this.collectGeneral();
    if (!g) return;
    if (!g.skills.length && !confirm('该武将没有任何技能，仍要保存吗？')) return;
    SGS.customStore.add(g);
    this.refreshAll();
    SGS.toast('✔ 武将「' + g.name + '」已保存到本地（localStorage）');
  },
  testGeneral() {
    const g = this.collectGeneral();
    if (!g) return;
    SGS.customStore.add(g);
    this.refreshAll();
    SGS.toast('🧪 进入 1v1 实战测试：' + g.name + ' 对战随机 AI');
    setTimeout(() => {
      if (SGS.startGame) SGS.startGame('1v1', g);
      else SGS.toast('游戏模块未就绪');
    }, 600);
  },
  exportJSON() {
    const g = this.collectGeneral();
    if (!g) return;
    const blob = new Blob([JSON.stringify(g, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'general_' + g.name + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    SGS.toast('已导出 JSON 文件');
  },
  importJSON(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const g = JSON.parse(reader.result);
        if (!g || !g.name || typeof g.maxHp !== 'number' || !Array.isArray(g.skills)) throw new Error('结构不合法');
        g.maxHp = Math.min(8, Math.max(1, g.maxHp));
        g.kingdom = g.kingdom || 'wei';
        this.fillGeneral(g);
        SGS.toast('已导入武将「' + g.name + '」，请检查并保存');
      } catch (e) {
        SGS.toast('导入失败：' + e.message);
      }
    };
    reader.readAsText(file);
    $('import-file').value = '';
  }
};
SGS.editor.init();
