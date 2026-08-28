/* ================= 段10C：修复补丁 + 按钮兜底 ================= */
(function() {
  var $id = function(x) { return document.getElementById(x); };
  /* ---------- 修复1：创建缺失的动态元素（cv-rows 等） ---------- */
  try {
    var bc = $id('block-convert');
    if (bc && !$id('cv-rows')) {
      var cvs = document.createElement('div'); cvs.id = 'cv-rows';
      var addBtn = document.createElement('button');
      addBtn.className = 'btn btn-skill btn-sm'; addBtn.type = 'button';
      addBtn.textContent = '＋ 添加转化条目';
      addBtn.onclick = function() { SGS.editor.addConvertRow(); SGS.editor.refreshPreview(); };
      bc.appendChild(cvs); bc.appendChild(addBtn);
    }
    if (!$id('sk-cost-n')) {
      var cn = document.createElement('input');
      cn.id = 'sk-cost-n'; cn.type = 'number'; cn.min = '1'; cn.value = '1'; cn.style.width = '80px';
      $id('sk-cost').parentNode.appendChild(cn);
    }
  } catch (e) { window.__sgBanner('修复1失败: ' + e.message); }
  /* ---------- 修复2：localStorage 写入保护 ---------- */
  try {
    SGS.customStore.save = function(list) {
      try { localStorage.setItem(this.key, JSON.stringify(list)); return true; }
      catch (e) { SGS.toast('⚠ 本地存储不可用，本次编辑仅本次会话有效'); return false; }
    };
  } catch (e) { window.__sgBanner('修复2失败: ' + e.message); }
  /* ---------- 修复3：toast 硬化 ---------- */
  try {
    SGS.toast = function(msg) {
      try { if (SGS.ui && SGS.ui.toast) { SGS.ui.toast(msg); return; } } catch (e) {}
      try { alert(msg); } catch (e) { try { console.log('[toast]', msg); } catch (e2) {} }
    };
  } catch (e) { window.__sgBanner('修复3失败: ' + e.message); }
  /* ---------- 修复4：请求/结算补丁（带 pend 捕获的修复版） ---------- */
  try {
    SGS.ui.request = function(player, opts) {
      var G = this.game;
      if (!G || player.ai) return Promise.resolve(null);
      return new Promise(function(res) {
        var ui = SGS.ui;
        ui.sel = { cards: [], targets: [], usages: [], usage: null };
        var pend = { player: player, opts: opts, resolve: function(v) { ui.pending = null; ui.refreshAll(); res(v); } };
        ui.pending = pend;
        if (['yesNo', 'choose', 'chooseSuit', 'pickCard', 'skill'].indexOf(opts.type) >= 0) {
          ui.pending = null;
          ui.modalRequest(opts, pend);
        } else ui.refreshAll();
      });
    };
    SGS.ui.modalRequest = function(opts, pend) {
      var box = this.showModal('<div class="panel" style="padding:14px">' +
        '<div style="margin-bottom:12px;font-weight:700;color:var(--gold);letter-spacing:.1em">' + (opts.prompt || '') + '</div>' +
        '<div id="m-body"></div></div>');
      var body = box.querySelector('#m-body');
      if (opts.type === 'yesNo') {
        body.innerHTML = '<button class="btn btn-main" id="m-y">确定</button> <button class="btn btn-ghost" id="m-n">取消</button>';
        body.querySelector('#m-y').onclick = function() { SGS.ui.closeModal(); pend.resolve(true); };
        body.querySelector('#m-n').onclick = function() { SGS.ui.closeModal(); pend.resolve(false); };
      } else if (opts.type === 'skill') {
        body.innerHTML = '<div style="font-size:13px;color:var(--dim);margin-bottom:10px">' + (opts.skill.desc || '') + '</div>' +
          '<button class="btn btn-main" id="m-y">发动【' + opts.skill.name + '】</button> <button class="btn btn-ghost" id="m-n">不发动</button>';
        body.querySelector('#m-y').onclick = function() { SGS.ui.closeModal(); pend.resolve(true); };
        body.querySelector('#m-n').onclick = function() { SGS.ui.closeModal(); pend.resolve(false); };
      } else if (opts.type === 'chooseSuit') {
        body.innerHTML = (opts.options || ['♠', '♥', '♣', '♦']).map(function(s) {
          return '<button class="btn btn-ghost" data-s="' + s + '" style="font-size:22px;width:56px;margin:4px;' + (s === '♥' || s === '♦' ? 'color:var(--red)' : '') + '">' + s + '</button>';
        }).join('');
        body.querySelectorAll('button').forEach(function(b) {
          b.onclick = function() { SGS.ui.closeModal(); pend.resolve(b.dataset.s); };
        });
      } else if (opts.type === 'choose') {
        body.innerHTML = (opts.options || []).map(function(o, i) {
          return '<button class="btn btn-main" data-i="' + i + '" style="margin:4px;display:block;width:100%">' + o + '</button>';
        }).join('');
        body.querySelectorAll('button').forEach(function(b) {
          b.onclick = function() { SGS.ui.closeModal(); pend.resolve(+b.dataset.i); };
        });
      } else if (opts.type === 'pickCard') {
        body.innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">' +
          opts.options.map(function(o, i) { return '<div data-i="' + i + '" style="cursor:pointer">' + SGS.cardView(o.card) + '</div>'; }).join('') + '</div>';
        body.querySelectorAll('[data-i]').forEach(function(d) {
          d.onclick = function() { SGS.ui.closeModal(); pend.resolve(opts.options[+d.dataset.i]); };
        });
      }
    };
    SGS.ui.showResult = function(title) {
      if (this.pending) { var p = this.pending; this.pending = null; p.resolve(null); }
      var G = this.game, rows = '';
      G.players.forEach(function(p) {
        var id = G.mode === '8p' ? SGS.IDENT[p.identity] : G.mode === '2v2' ? (p.team === 0 ? '一队' : '二队') : (p.human ? '你' : '敌方');
        rows += '<div style="font-size:13px;padding:3px">' + p.name + '（' + id + '）' + (p.alive ? ' · 存活' : ' · 阵亡') + '</div>';
      });
      var box = this.showModal('<div class="panel" style="padding:18px"><h3 style="font-size:26px">🏁 ' + title + '</h3>' +
        '<div style="margin:10px 0;text-align:left">' + rows + '</div>' +
        '<div><button class="btn btn-main" id="r-again">再来一局</button> <button class="btn btn-ghost" id="r-menu">返回主菜单</button></div></div>');
      box.querySelector('#r-again').onclick = function() { SGS.ui.closeModal(); SGS.startGame(SGS.ui.game.mode, SGS.ui.game.players[0].general); };
      box.querySelector('#r-menu').onclick = function() { SGS.ui.closeModal(); SGS.showScreen('screen-menu'); };
    };
    SGS.allGenerals = function() {
      return SGS.GENERALS.concat(SGS.customStore.load().filter(function(g) { return g && g.name && Array.isArray(g.skills); }));
    };
  } catch (e) { window.__sgBanner('修复4失败: ' + e.message); }
  /* ---------- 修复5：编辑器关键函数加固 ---------- */
  try {
    var E = SGS.editor;
    E.collectGeneral = function() {
      var name = $id('ed-name').value.trim();
      if (!name) return null;
      var skills = this.skills.slice();
      if (this.formIndex >= 0) skills[this.formIndex] = this.collectSkill();
      var hp = Math.min(8, Math.max(1, +$id('ed-maxhp').value || 3));
      return {
        id: 'custom_' + name, name: name, title: $id('ed-title').value.trim() || '自创武将',
        kingdom: $id('ed-kingdom').value, gender: $id('ed-gender').value, maxHp: hp,
        quote: $id('ed-line').value.trim() || '', skills: skills, custom: true
      };
    };
    E.refreshPreview = function() {
      var g = this.collectGeneral();
      $id('ed-preview').textContent = g ? JSON.stringify(g, null, 1) : '尚未生成…（请先填写武将名）';
    };
    E.saveGeneral = function() {
      var g = this.collectGeneral();
      if (!g) { SGS.toast('请填写武将名'); return; }
      var names = g.skills.map(function(s) { return s.name; });
      if (new Set(names).size !== names.length) { SGS.toast('技能名不能重复'); return; }
      if (SGS.customStore.add(g)) { this.refreshAll(); SGS.toast('✔ 武将「' + g.name + '」已保存到本地'); }
    };
    E.testGeneral = function() {
      var g = this.collectGeneral();
      if (!g) { SGS.toast('请填写武将名'); return; }
      SGS.customStore.add(g);
      this.refreshAll();
      SGS.toast('🧪 进入 1v1 实战测试：' + g.name);
      setTimeout(function() {
        try { SGS.startGame('1v1', g); } catch (e) { window.__sgBanner('测试开局失败: ' + e.message); }
      }, 500);
    };
    E.openSkill = function(i) {
      this.formIndex = i;
      var s = i >= 0 ? this.skills[i] : {
        name: '新技能', skillClass: 'normal', type: 'triggered', trigger: { event: 'phaseTurnStart' },
        condition: '', cost: { type: 'none' }, targetRule: { type: 'self' },
        effects: [{ op: 'draw', target: 'self', count: 1 }], limit: { scope: 'turn', max: 1 }, quote: '', auto: true
      };
      try {
        $id('ed-skill-form').classList.remove('hidden');
        $id('sk-name').value = s.name;
        $id('sk-class').value = s.skillClass;
        $id('sk-type').value = s.type;
        $id('sk-trigger').value = (s.trigger && s.trigger.event) || 'phaseTurnStart';
        if ($id('sk-subj')) $id('sk-subj').value = (s.trigger && s.trigger.subj) || '';
        if ($id('sk-auto')) $id('sk-auto').checked = s.auto !== false;
        $id('sk-cond').value = typeof s.condition === 'string' ? s.condition : (typeof s.activeWhen === 'string' ? s.activeWhen : '');
        var cost = s.cost || { type: 'none' };
        $id('sk-cost').value = cost.type === 'discard' ? 'discardN' : cost.type === 'loseHp' ? 'loseHpN' : cost.type === 'give' ? 'giveN' : cost.type || 'none';
        var cn = $id('sk-cost-n');
        if (!cn) { cn = document.createElement('input'); cn.id = 'sk-cost-n'; cn.type = 'number'; cn.min = '1'; cn.style.width = '80px'; $id('sk-cost').parentNode.appendChild(cn); }
        cn.value = cost.n || cost.min || 1;
        $id('sk-target').value = (s.targetRule && s.targetRule.type) || 'self';
        if ($id('sk-target-filter')) $id('sk-target-filter').value = (s.targetRule && s.targetRule.filter && s.targetRule.filter.expr) || '';
        $id('sk-limit').value = s.limit ? s.limit.scope : 'never';
        if ($id('sk-limit-max')) $id('sk-limit-max').value = (s.limit && s.limit.max) || 1;
        $id('sk-quote').value = s.quote || '';
        $id('sk-effects').innerHTML = '';
        (s.effects || []).forEach(function(e) { $id('sk-effects').appendChild(SGS.editor.buildEffectRow(e)); });
        var cvs = $id('cv-rows');
        if (!cvs) { cvs = document.createElement('div'); cvs.id = 'cv-rows'; $id('block-convert').appendChild(cvs); }
        cvs.innerHTML = '';
        (s.convert || []).forEach(function(cv) { SGS.editor.addConvertRow(cv); });
        if (!(s.convert || []).length) SGS.editor.addConvertRow();
        if ($id('pm-op') && s.modify) { $id('pm-op').value = s.modify.op; $id('pm-delta').value = s.modify.delta !== undefined ? s.modify.delta : 1; }
        this.toggleTypeUI();
        this.rebuildCostN();
        if (this.togglePassiveUI) this.togglePassiveUI();
        this.refreshPreview();
      } catch (e) { window.__sgBanner('打开技能面板失败: ' + e.message); }
    };
    E.refreshAll = function() {
      var steps = ['renderSkillList', 'refreshCustomList', 'refreshTemplate', 'refreshPreview', 'refreshCharGrid'];
      for (var i = 0; i < steps.length; i++) {
        try { this[steps[i]](); } catch (e) { window.__sgBanner('刷新「' + steps[i] + '」失败: ' + e.message); }
      }
    };
  } catch (e) { window.__sgBanner('修复5失败: ' + e.message); }
  /* ---------- 修复6：startGame 兜底 ---------- */
  try {
    if (typeof SGS.startGame !== 'function') {
      SGS.lastGame = null;
      SGS.startGame = async function(mode, humanG) {
        humanG = humanG || SGS.menuPick.general || SGS.allGenerals()[0];
        if (SGS.lastGame) SGS.lastGame.players.forEach(function(p) { SGS.bus.offPlayer(p); });
        SGS.AI.reset();
        var all = SGS.allGenerals();
        var pool = SGS.shuffle(all.filter(function(g) { return g.name !== humanG.name; }));
        var nAI = mode === '1v1' ? 1 : mode === '2v2' ? 3 : 7;
        var game = new SGS.Game();
        SGS.game = game;
        game.ui = SGS.ui;
        await game.init(mode, { humanGeneral: humanG, aiGenerals: pool.slice(0, nAI) });
        if (mode === '8p') { var lord = game.players.find(function(p) { return p.identity === 'lord'; }); if (lord) lord.revealed = true; }
        SGS.ui.bind(game);
        SGS.lastGame = game;
        SGS.showScreen('screen-game');
        await game.start();
      };
    }
  } catch (e) { window.__sgBanner('修复6失败: ' + e.message); }
  /* ---------- 修复7：关键按钮委托兜底（300ms 防抖） ---------- */
  try {
    var lastClick = {};
    var acts = {
      'btn-editor': function() { SGS.showScreen('screen-editor'); SGS.editor.refreshAll(); },
      'ed-back': function() { SGS.showScreen('screen-menu'); SGS.menuRefresh(); },
      'btn-add-skill': function() { SGS.editor.openSkill(-1); },
      'ed-save': function() { SGS.editor.saveGeneral(); },
      'ed-test': function() { SGS.editor.testGeneral(); },
      'ed-export': function() { SGS.editor.exportJSON(); },
      'ed-import': function() { $id('import-file').click(); },
      'btn-load-tpl': function() { SGS.editor.loadTemplate(); },
      'sk-save': function() { SGS.editor.commitSkill(); },
      'sk-cancel': function() { SGS.editor.closeSkill(); },
      'btn-add-effect': function() { $id('sk-effects').appendChild(SGS.editor.buildEffectRow()); SGS.editor.refreshPreview(); },
      'btn-end': function() { SGS.ui.endTurn(); },
      'btn-ok': function() { SGS.ui.ok(); },
      'btn-cancel': function() { SGS.ui.cancel(); }
    };
    document.addEventListener('click', function(ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest('button') : null;
      if (!t || !t.id) return;
      var fn = acts[t.id];
      if (!fn) return;
      var now = Date.now();
      if (now - (lastClick[t.id] || 0) < 300) return;
      lastClick[t.id] = now;
      try { fn(); } catch (e) { window.__sgBanner('按钮 [' + t.id + '] 处理失败: ' + e.message); }
    });
    $id('char-select').addEventListener('click', function(ev) {
      var el = ev.target && ev.target.closest ? ev.target.closest('.char-card') : null;
      if (!el) return;
      var now = Date.now();
      if (now - (lastClick['char' + el.dataset.name] || 0) < 300) return;
      lastClick['char' + el.dataset.name] = now;
      try {
        var g = SGS.allGenerals().find(function(x) { return x.name === el.dataset.name; });
        if (g) { SGS.menuPick.general = g; SGS.menuRefresh(); SGS.toast('已选择武将：' + g.name); }
      } catch (e) { window.__sgBanner('选择武将失败: ' + e.message); }
    });
    var modeBtns = document.querySelectorAll('.mode-btn');
    for (var i = 0; i < modeBtns.length; i++) {
      (function(btn) {
        btn.addEventListener('click', function() {
          var mode = btn.dataset.mode;
          var now = Date.now();
          if (now - (lastClick['mode' + mode] || 0) < 300) return;
          lastClick['mode' + mode] = now;
          try {
            var g = SGS.menuPick.general || SGS.allGenerals()[0];
            if (g) SGS.startGame(mode, g);
            else SGS.toast('请先在下方选择武将');
          } catch (e) { window.__sgBanner('开局失败: ' + e.message); }
        });
      })(modeBtns[i]);
    }
  } catch (e) { window.__sgBanner('修复7失败: ' + e.message); }
  /* ---------- 修复8：编辑器初始化兜底 + 菜单渲染 ---------- */
  try {
    if (!SGS.menuPick) SGS.menuPick = { general: null };
    if (!SGS.menuRefresh) SGS.menuRefresh = function() { SGS.editor.refreshCharGrid(); };
    var trig = $id('sk-trigger');
    var initRan = trig && trig.options && trig.options.length > 20;
    if (!initRan) { try { SGS.editor.init(); } catch (e) { window.__sgBanner('编辑器初始化失败: ' + e.message); } }
    try { SGS.menuRefresh(); } catch (e) { window.__sgBanner('菜单刷新失败: ' + e.message); }
    SGS.showScreen('screen-menu');
  } catch (e) { window.__sgBanner('修复8失败: ' + e.message); }
  /* ---------- 就绪徽标 ---------- */
  try {
    var b = document.createElement('div');
    b.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:99999;background:rgba(20,60,30,.95);border:1px solid #3ecf7e;color:#8ff0bb;font:12px Consolas,monospace;padding:6px 12px;border-radius:8px';
    b.textContent = '√ 全部模块就绪';
    document.body.appendChild(b);
  } catch (e) {}
  console.log('√ 段10C 修复补丁已应用');
})();
