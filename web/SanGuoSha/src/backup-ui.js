/* ================= 段10B：内置备份 · 段8 界面 + 自愈 ================= */
(function() {
  window.__sgBanner = window.__sgBanner || function(msg) {
    try {
      var el = document.getElementById('sg-banner');
      if (!el) {
        el = document.createElement('div');
        el.id = 'sg-banner';
        el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#7e1d1d;color:#fff;font:12px/1.7 Consolas,monospace;padding:6px 10px;white-space:pre-wrap;max-height:32vh;overflow:auto;text-align:left';
        document.body.appendChild(el);
      }
      if (el.dataset.msgs && el.dataset.msgs.indexOf(msg) >= 0) return;
      el.dataset.msgs = (el.dataset.msgs || '') + msg + '\n';
      el.textContent = el.dataset.msgs + '（按 F12 → Console 查看细节）';
    } catch (e) {}
  };
  if (!window.__sgHooked) {
    window.__sgHooked = true;
    window.addEventListener('error', function(ev) {
      window.__sgBanner('JS错误: ' + (ev.message || '未知') + (ev.lineno ? ' (第' + ev.lineno + '行)' : ''));
    });
    window.addEventListener('unhandledrejection', function(ev) {
      var r = ev.reason;
      window.__sgBanner('异步错误: ' + ((r && (r.message || r.stack)) || r));
    });
  }
  /* ---------- 内置备份：段8 界面 ---------- */
  if (!(window.SGS && SGS.ui)) {
    try {
      (function() {
        var st = document.createElement('style');
        st.textContent = '.seat-sel .s-panel{border-color:var(--gold)!important;box-shadow:0 0 16px rgba(245,194,90,.95)!important}.usage-chip{display:inline-block;padding:3px 10px;margin:0 4px;border-radius:12px;background:#3a2a05;color:var(--gold);border:1px solid #8a6118;cursor:pointer;font-size:12px;font-weight:700}.usage-chip.on{background:var(--gold);color:#3a2a05}#dying-banner{position:fixed;top:22%;left:50%;transform:translateX(-50%);z-index:110;pointer-events:none;font-size:22px;color:var(--red);font-weight:900;letter-spacing:.25em;text-shadow:0 0 16px rgba(255,60,60,.9);animation:dyingBlink .8s infinite}';
        document.head.appendChild(st);
      })();
      SGS.Game.prototype.phase_play = async function(p) {
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
          } else if (act.type === 'use') {
            await this.useCard(p, act.card, act.targets, act.opts || {});
          }
        }
        this.uiAct = null;
      };
      SGS.req = async function(game, player, opts) {
        if (player.ai) return await SGS.AI.answer(game, player, opts);
        return await SGS.ui.request(player, opts);
      };
      SGS.ui = {
        game: null, sel: { cards: [], targets: [], usages: [], usage: null },
        pending: null, seatEls: {}, judgeEl: null, dyingEl: null,
        PHASE_NAME: { prepare: '准备阶段', judge: '判定阶段', draw: '摸牌阶段', play: '出牌阶段', discard: '弃牌阶段', end: '结束阶段', idle: '等待中' },
        bind(game) {
          this.game = game;
          this.pending = null;
          this.sel = { cards: [], targets: [], usages: [], usage: null };
          document.getElementById('log').innerHTML = '';
          this.renderSeats();
          this.refreshAll();
        },
        seatPositions() {
          const m = this.game.mode;
          const n = m === '1v1' ? 2 : m === '2v2' ? 4 : 8;
          const pos = [];
          if (n === 2) { pos[0] = { x: 50, y: 84 }; pos[1] = { x: 50, y: 16 }; }
          else if (n === 4) { pos[0] = { x: 50, y: 84 }; pos[1] = { x: 85, y: 50 }; pos[2] = { x: 50, y: 14 }; pos[3] = { x: 15, y: 50 }; }
          else {
            const rx = 45, ry = 42;
            for (let i = 0; i < 8; i++) {
              const ang = (90 + i * 45) * Math.PI / 180;
              pos[i] = { x: 50 + rx * Math.cos(ang), y: 50 + ry * Math.sin(ang) };
            }
          }
          return pos;
        },
        avatarSVG(g, seat) {
          const c = { wei: '#4d8dff', shu: '#ff5a5a', wu: '#3ecf7e', qun: '#c06bff', shen: '#e6c13d' }[g.kingdom];
          const hair = g.gender === 'female' ? '<path d="M11 13 Q11 4 20 4 Q29 4 29 13 L29 10 Q20 2 11 10 Z" fill="#7a4a2a"/>' : '';
          return '<svg viewBox="0 0 40 40" width="40" height="40">' + hair +
            '<circle cx="20" cy="14" r="9" fill="#f0d9b0" stroke="' + c + '" stroke-width="2"/>' +
            '<path d="M8 40 Q8 26 20 26 Q32 26 32 40 Z" fill="' + c + '" opacity="0.88"/>' +
            '<circle cx="17" cy="13" r="1.6" fill="#333"/><circle cx="23" cy="13" r="1.6" fill="#333"/>' +
            '<path d="M17 19 Q20 21 23 19" stroke="#333" fill="none" stroke-width="1.2"/></svg>';
        },
        renderSeats() {
          const box = document.getElementById('seats');
          box.innerHTML = '';
          this.seatEls = {};
          const pos = this.seatPositions();
          this.game.players.forEach(p => {
            const el = document.createElement('div');
            el.className = 'seat king-' + p.kingdom;
            el.id = 'seat-' + p.seat;
            el.style.left = pos[p.seat].x + '%';
            el.style.top = pos[p.seat].y + '%';
            el.addEventListener('click', () => this.seatClick(p));
            box.appendChild(el);
            this.seatEls[p.seat] = el;
          });
          this.refreshSeats();
        },
        refreshSeats() {
          const G = this.game;
          G.players.forEach(p => {
            const el = this.seatEls[p.seat];
            if (!el) return;
            const cls = ['seat', 'king-' + p.kingdom];
            if (G.turn === p.seat && !G.over) cls.push('turn');
            if (!p.alive) cls.push('dead');
            const isTgt = this.pending && ['chooseTarget', 'chooseTargets'].indexOf(this.pending.opts.type) >= 0 &&
              (this.pending.opts.pool || []).indexOf(p) >= 0;
            const playTgt = !this.pending && this.sel.usage && this.sel.usage.needSelect &&
              (this.sel.usage.targets || []).indexOf(p) >= 0 && G.turn === 0 && G.phase === 'play';
            if (isTgt || playTgt) cls.push('targetable');
            if (!this.pending && this.sel.targets.indexOf(p) >= 0) cls.push('seat-sel');
            el.className = cls.join(' ');
            let ident = '';
            if (G.mode === '8p') {
              const vis = p.revealed || p.human;
              ident = '<span class="ident ' + (vis ? 'ident-' + p.identity : 'ident-unknown') + '">' + (vis ? SGS.IDENT[p.identity] : '身份不明') + '</span>';
            } else if (G.mode === '2v2') {
              ident = '<span class="ident ident-' + (p.team === 0 ? 'loyal' : 'rebel') + '">' + (p.team === 0 ? '一队' : '二队') + '</span>';
            }
            const eq = [];
            for (const k of ['weapon', 'armor', 'horseP', 'horseM']) if (p.equips[k]) eq.push('<span class="mark-chip">' + p.equips[k].name + '</span>');
            p.judges.forEach(j => eq.push('<span class="mark-chip" style="color:#9a86ff">⚖' + j.name + '</span>'));
            for (const mk in p.marks) if (p.marks[mk]) eq.push('<span class="mark-chip">' + mk + '×' + p.marks[mk] + '</span>');
            if (p.jail && p.jail.length) eq.push('<span class="mark-chip" style="color:#ffd77a">扣' + p.jail.length + '</span>');
            const status = [];
            if (p.turned) status.push('<span class="s-turned">翻面</span>');
            if (p.chained) status.push('<span class="s-chained">连环</span>');
            el.innerHTML =
              '<div class="s-panel">' +
              '<div class="avatar">' + this.avatarSVG(p.general, p.seat) + '</div>' +
              '<div class="s-info">' +
              '<div class="s-name">' + p.name + (p.human ? '<span style="font-size:10px;color:var(--gold)">(我)</span>' : '') + ident + '</div>' +
              '<div class="s-hp">' + '♥'.repeat(Math.max(0, p.hp)) + '♡'.repeat(Math.max(0, p.maxHp - p.hp)) + '</div>' +
              (eq.length ? '<div class="s-extra">' + eq.join('') + '</div>' : '') +
              '</div>' +
              '<div class="s-hand">' + p.hand.length + '</div>' +
              (status.length ? '<div class="status">' + status.join('') + '</div>' : '') +
              '</div>';
          });
        },
        renderPiles() {
          const G = this.game;
          const deckEl = document.getElementById('deck');
          let deckHtml = '';
          for (let i = 0; i < Math.min(3, G.deck.length); i++) deckHtml += '<div class="card card-back" style="top:' + (i * 2) + 'px;left:' + (i * 2) + 'px"></div>';
          deckHtml += '<div class="pile-label">牌堆 ' + G.deck.length + '</div>';
          deckEl.innerHTML = deckHtml;
          const dcEl = document.getElementById('discard');
          const top = G.discard.length ? G.discard[G.discard.length - 1] : null;
          dcEl.innerHTML = (top ? SGS.cardView(top, { small: true }) : '<div class="card card-sm card-back"></div>') +
            '<div class="pile-label">弃牌堆 ' + G.discard.length + '</div>';
        },
        refreshHand() {
          const G = this.game;
          const me = G.players[0];
          const box = document.getElementById('hand');
          if (!me.alive) { box.innerHTML = '<div style="color:var(--dim);align-self:center">你已阵亡</div>'; return; }
          let validIds = null;
          if (this.pending) {
            const t = this.pending.opts.type;
            if (t === 'respond') validIds = new Set(me.hand.filter(c => this.validRespond(c, this.pending.opts)).map(c => c.id));
            else if (t === 'pickCards' || t === 'pickCardsFrom') validIds = new Set(me.hand.map(c => c.id));
          }
          const selIds = new Set(this.sel.cards.map(c => c.id));
          box.innerHTML = me.hand.map(c => {
            const interactive = !!this.pending || (G.turn === 0 && G.phase === 'play');
            const sel = selIds.has(c.id);
            const dim = interactive && validIds && !validIds.has(c.id) && this.pending;
            return SGS.cardView(c, { hand: interactive, sel: sel, dim: dim });
          }).join('');
        },
        refreshSkillbar() {
          const G = this.game;
          const box = document.getElementById('skillbar');
          const me = G.players[0];
          if (!this.pending && G.turn === 0 && G.phase === 'play' && me.alive) {
            box.innerHTML = (G.playActions || []).map(a =>
              '<button class="btn btn-skill" data-skill="' + a.skill.name + '" title="' + (a.skill.desc || '') + '">' + a.skill.name + '</button>').join('');
          } else box.innerHTML = '';
        },
        refreshControls() {
          const G = this.game;
          const me = G.players[0];
          const ok = document.getElementById('btn-ok'), cancel = document.getElementById('btn-cancel'), end = document.getElementById('btn-end');
          const inPlay = !this.pending && G.turn === 0 && G.phase === 'play' && me.alive && !G.over;
          const p = this.pending;
          const okShow = (p && ['respond', 'pickCards', 'pickCardsFrom', 'chooseTargets'].indexOf(p.opts.type) >= 0) || (inPlay && this.sel.usage);
          const cancelShow = (p && ['respond', 'pickCards', 'pickCardsFrom', 'chooseTargets', 'chooseTarget'].indexOf(p.opts.type) >= 0) || (inPlay && this.sel.cards.length);
          ok.classList.toggle('hidden', !okShow);
          cancel.classList.toggle('hidden', !cancelShow);
          end.classList.toggle('hidden', !(inPlay && !this.sel.cards.length));
        },
        renderPrompt() {
          const G = this.game;
          const me = G.players[0];
          const el = document.getElementById('prompt');
          if (this.pending) {
            const o = this.pending.opts;
            let hint = '';
            if (o.type === 'respond') hint = this.respondHint(o);
            else if (o.type === 'pickCards') hint = (o.n === 'any' || o.n == null) ? '选择任意张手牌后点确定（取消=放弃）' : '选择 ' + o.n + ' 张手牌后点确定（取消=放弃）';
            else if (o.type === 'pickCardsFrom') hint = '点击选择至多 ' + o.max + ' 张牌，点确定';
            else if (o.type === 'chooseTarget') hint = '点击目标角色座位';
            else if (o.type === 'chooseTargets') hint = '点击选择至多 ' + (o.count || 2) + ' 名角色，点确定';
            el.innerHTML = (o.prompt || '') + '<br><span style="color:var(--dim);font-size:12px">' + hint + '</span>';
            return;
          }
          if (G.turn === 0 && G.phase === 'play' && me.alive && !G.over) {
            const s = this.sel;
            if (!s.cards.length) {
              el.innerHTML = '出牌阶段：点击手牌使用 / 发动技能 / 结束回合';
              return;
            }
            let html = '';
            if (s.usages.length > 1) {
              html = '请选择用法：' + s.usages.map((u, i) =>
                '<span class="usage-chip' + (s.usage === u ? ' on' : '') + '" data-u="' + i + '">' +
                '【' + u.name + '】' + (u.via ? '(' + u.via + ')' : '') + (u.pair ? '(两张)' : '') + '</span>').join('');
            } else if (s.usage) {
              html = '将使用【' + s.usage.name + '】' + (s.usage.via ? '（' + s.usage.via + '）' : '');
              if (s.usage.needSelect) html += s.targets.length ? '，目标：' + s.targets[0].name : '：点击高亮角色选择目标';
            }
            el.innerHTML = html;
            return;
          }
          const cur = G.players[G.turn] || me;
          el.innerHTML = G.over ? '游戏已结束' : (cur.name + ' 的回合 · ' + (this.PHASE_NAME[G.phase] || G.phase));
        },
        respondHint(o) {
          const name = { shan: '闪', sha: '杀', tao: '桃', wuxie: '无懈可击' }[o.kind];
          const need = o.need || 1;
          if (o.kind === 'tao') return '选择【桃】救 ' + o.dying.name + '（可多张），点确定；取消=放弃救援';
          if (o.kind === 'wuxie') return '选择【无懈可击】抵消（取消=不出）';
          return '选择 ' + (need > 1 ? need + ' 张' : '1 张') + '【' + name + '】，点确定；取消=不响应';
        },
        refreshAll() {
          if (!this.game) return;
          this.refreshSeats();
          this.renderPiles();
          this.refreshHand();
          this.refreshSkillbar();
          this.refreshControls();
          this.renderPrompt();
          document.getElementById('phase-txt').textContent = this.game.over ? '游戏结束' :
            ((this.game.players[this.game.turn] || this.game.players[0]).name + ' · ' + (this.PHASE_NAME[this.game.phase] || ''));
        },
        updateDiscard() { this.renderPiles(); },
        validRespond(card, o) {
          const name = { shan: '闪', sha: '杀', tao: '桃', wuxie: '无懈可击' }[o.kind];
          if (!name) return false;
          if (card.name === name) return true;
          return !!SGS.skills.cardAs(this.game, this.game.players[0], card, name);
        },
        async handClick(cid) {
          const G = this.game;
          const me = G.players[0];
          const card = me.hand.find(c => c.id === cid);
          if (!card) return;
          const p = this.pending;
          if (p) {
            const t = p.opts.type;
            if (t === 'respond') {
              if (!this.validRespond(card, p.opts)) { this.toast('此牌不能响应'); return; }
              const need = p.opts.need || 1;
              const idx = this.sel.cards.indexOf(card);
              if (idx >= 0) this.sel.cards.splice(idx, 1);
              else if (this.sel.cards.length < Math.max(need, 1)) this.sel.cards.push(card);
              this.refreshAll();
            } else if (t === 'pickCards') {
              const idx = this.sel.cards.indexOf(card);
              if (idx >= 0) this.sel.cards.splice(idx, 1);
              else {
                const max = (p.opts.n === 'any' || p.opts.n == null) ? me.hand.length : (p.opts.n || 1); 
                if (this.sel.cards.length < max) this.sel.cards.push(card);
                else this.toast('最多选择 ' + max + ' 张');
              }
              this.refreshAll();
            }
            return;
          }
          if (G.turn !== 0 || G.phase !== 'play' || !me.alive) return;
          const idx = this.sel.cards.indexOf(card);
          if (idx >= 0) { this.sel.cards.splice(idx, 1); this.sel.targets = []; this.sel.usage = null; this.sel.usages = []; }
          else {
            if (this.sel.cards.length >= 2) { this.toast('最多选择两张牌'); return; }
            this.sel.cards.push(card);
            this.sel.targets = []; this.sel.usage = null; this.sel.usages = [];
          }
          await this.computeUsage();
          this.refreshAll();
        },
        async computeUsage() {
          const G = this.game;
          const me = G.players[0];
          const s = this.sel;
          s.usages = []; s.usage = null;
          if (!s.cards.length) return;
          if (s.cards.length === 1) {
            s.usages = await G.getUsages(me, s.cards[0]);
          } else if (s.cards.length === 2 && me.equips.weapon && me.equips.weapon.name === '丈八蛇矛') {
            const lim = await G.shaLimit(me), range = await G.attackRange(me);
            const targets = G.players.filter(async t => t !== me && t.alive && (await G.distance(me, t)) <= range);
            if (me.usedSha < lim && targets.length) s.usages = [{ name: '杀', via: '丈八蛇矛', pair: true, targets, needSelect: true }];
          }
          if (s.usages.length) s.usage = s.usages[0];
          else if (s.cards.length) this.toast('此牌现在无法使用');
        },
        seatClick(p) {
          const G = this.game;
          if (!p || !p.alive) return;
          const pend = this.pending;
          if (pend) {
            const t = pend.opts.type;
            if (t === 'chooseTarget' && (pend.opts.pool || []).indexOf(p) >= 0) { pend.resolve(p); return; }
            if (t === 'chooseTargets' && (pend.opts.pool || []).indexOf(p) >= 0) {
              const idx = this.sel.cards.indexOf(p);
              if (idx >= 0) this.sel.cards.splice(idx, 1);
              else if (this.sel.cards.length < (pend.opts.count || 2)) this.sel.cards.push(p);
              else this.toast('最多选择 ' + (pend.opts.count || 2) + ' 名角色');
              this.refreshAll();
              return;
            }
            return;
          }
          if (G.turn !== 0 || G.phase !== 'play' || !this.sel.usage) return;
          if (this.sel.usage.needSelect && (this.sel.usage.targets || []).indexOf(p) >= 0) {
            this.sel.targets = [p];
            this.refreshAll();
          }
        },
        ok() {
          const pend = this.pending;
          if (pend) {
            const t = pend.opts.type;
            if (t === 'respond') {
              if (!this.sel.cards.length) { this.toast('请选择要打出的牌，或点取消不响应'); return; }
              pend.resolve(this.sel.cards.slice());
            } else if (t === 'pickCards') {
              const o = pend.opts;
              if (o.n != null && o.n !== 'any' && this.sel.cards.length !== o.n) { this.toast('需选择 ' + o.n + ' 张'); return; }
              if (o.n === 'any' && o.min && this.sel.cards.length < o.min) { this.toast('至少选择 ' + o.min + ' 张'); return; }
              pend.resolve(this.sel.cards.slice());
            } else if (t === 'pickCardsFrom') {
              pend.resolve(this.sel.cards.slice());
            } else if (t === 'chooseTargets') {
              pend.resolve(this.sel.cards.slice());
            }
            return;
          }
          const G = this.game;
          const me = G.players[0];
          const s = this.sel;
          if (!s.usage) return;
          if (s.usage.needSelect && !s.targets.length) { this.toast('请先选择目标（点击高亮角色）'); return; }
          let targets;
          if (s.usage.auto === 'others') targets = G.players.filter(t => t !== me && t.alive);
          else if (s.usage.auto === 'all') targets = G.players.filter(t => t.alive);
          else targets = s.targets.slice();
          const act = { type: 'use', card: s.cards[0], targets: targets, opts: {} };
          if (s.usage.pair) act.opts.pairCards = s.cards.slice();
          if (s.usage.asName) { act.opts.asName = s.usage.asName; act.opts.via = s.usage.via; }
          if (s.usage.via && !s.usage.pair && !s.usage.asName) act.opts.via = s.usage.via;
          this.sel = { cards: [], targets: [], usages: [], usage: null };
          this.game.uiAct && this.game.uiAct(act);
        },
        cancel() {
          const pend = this.pending;
          if (pend) {
            if (pend.opts.type === 'pickCards' && pend.opts.allowZero) pend.resolve([]);
            else pend.resolve(null);
            return;
          }
          this.sel = { cards: [], targets: [], usages: [], usage: null };
          this.refreshAll();
        },
        endTurn() {
          if (!this.pending && this.game.turn === 0 && this.game.phase === 'play') {
            this.game.uiAct && this.game.uiAct({ type: 'end' });
          }
        },
        request(player, opts) {
          const G = this.game;
          if (!G || player.ai) return Promise.resolve(null);
          return new Promise(res => {
            this.sel = { cards: [], targets: [], usages: [], usage: null };
            const pend = { player: player, opts: opts, resolve: function(v) { SGS.ui.pending = null; SGS.ui.refreshAll(); res(v); } };
            this.pending = pend;
            if (['yesNo', 'choose', 'chooseSuit', 'pickCard', 'skill'].indexOf(opts.type) >= 0) {
              this.pending = null;
              this.modalRequest(opts, pend);
            } else this.refreshAll();
          });
        },
        modalRequest(opts, pend) {
          const box = this.showModal('<div class="panel" style="padding:14px">' +
            '<div style="margin-bottom:12px;font-weight:700;color:var(--gold);letter-spacing:.1em">' + (opts.prompt || '') + '</div>' +
            '<div id="m-body"></div></div>');
          const body = box.querySelector('#m-body');
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
        },
        showModal(html) {
          const modal = document.getElementById('modal');
          const box = document.getElementById('modal-box');
          box.innerHTML = html;
          modal.classList.remove('hidden');
          return box;
        },
        closeModal() { document.getElementById('modal').classList.add('hidden'); },
        log(msg, cls) {
          const box = document.getElementById('log');
          const line = document.createElement('div');
          line.className = 'log-line' + (cls ? ' ' + cls : '');
          line.innerHTML = msg;
          box.appendChild(line);
          while (box.children.length > 120) box.removeChild(box.firstChild);
          box.scrollTop = box.scrollHeight;
        },
        toast(msg) {
          const t = document.getElementById('toast');
          t.textContent = msg;
          t.classList.remove('hidden');
          clearTimeout(this._toastTimer);
          this._toastTimer = setTimeout(function() { t.classList.add('hidden'); }, 2200);
        },
        seatRect(p) {
          const el = this.seatEls[p.seat];
          return el ? el.getBoundingClientRect() : { left: 0, top: 0, width: 0 };
        },
        say(p, text) {
          if (!text) return;
          const r = this.seatRect(p);
          const b = document.createElement('div');
          b.className = 'bubble';
          b.textContent = text;
          b.style.left = Math.max(10, Math.min(window.innerWidth - 220, r.left + r.width * 0.4)) + 'px';
          b.style.top = Math.max(20, r.top - 16) + 'px';
          document.getElementById('bubble-layer').appendChild(b);
          setTimeout(function() { b.remove(); }, 1600);
        },
        fxFloat(p, text, color) {
          const r = this.seatRect(p);
          const el = document.createElement('div');
          el.className = 'float-txt';
          el.textContent = text;
          el.style.color = color || '#f5c25a';
          el.style.left = (r.left + r.width / 2) + 'px';
          el.style.top = (r.top - 8) + 'px';
          el.style.transform = 'translateX(-50%)';
          document.getElementById('fx-layer').appendChild(el);
          setTimeout(function() { el.remove(); }, 1300);
        },
        fxDraw(p, n) {
          if (!this.seatEls || !this.seatEls[p.seat]) return;
          this.fxFloat(p, '+' + n + ' 牌', '#f5c25a');
          const r = this.seatRect(p);
          const card = document.createElement('div');
          card.className = 'card card-sm card-back';
          card.style.position = 'absolute';
          card.style.left = (r.left + r.width / 2) + 'px';
          card.style.top = (r.top + 40) + 'px';
          document.getElementById('fx-layer').appendChild(card);
          setTimeout(function() { card.remove(); }, 700);
        },
        fxShake(p) {
          const el = this.seatEls[p.seat];
          if (!el) return;
          const panel = el.querySelector('.s-panel');
          if (!panel) return;
          panel.classList.remove('shock');
          void panel.offsetWidth;
          panel.classList.add('shock');
          setTimeout(function() { panel.classList.remove('shock'); }, 650);
        },
        fxUseCard(p, card) {
          const el = document.createElement('div');
          el.className = 'flying';
          el.innerHTML = SGS.cardView(card, { name: card.name });
          el.style.left = '50%';
          el.style.top = '78%';
          document.getElementById('fx-layer').appendChild(el);
          requestAnimationFrame(function() {
            requestAnimationFrame(function() {
              el.style.left = '50%';
              el.style.top = '44%';
              el.style.transform = 'translate(-50%,-50%) scale(.72)';
              el.style.opacity = '.9';
            });
          });
          setTimeout(function() { el.remove(); }, 800);
        },
        judgeShow(card) {
          clearTimeout(this._judgeT);
          if (this.judgeEl) this.judgeEl.remove();
          const el = document.createElement('div');
          el.className = 'judge-card';
          el.id = 'judge-float';
          el.innerHTML = SGS.cardView(card);
          el.style.cssText = 'position:fixed;left:50%;top:30%;transform:translateX(-50%);z-index:115';
          document.body.appendChild(el);
          this.judgeEl = el;
          this._judgeT = setTimeout(function() { if (SGS.ui.judgeEl) { SGS.ui.judgeEl.remove(); SGS.ui.judgeEl = null; } }, 1600);
        },
        judgeHide() { },
        dyingShow(p) {
          this.dyingHide();
          const el = document.createElement('div');
          el.id = 'dying-banner';
          el.textContent = '⚡ ' + p.name + ' 濒死！等待救援……';
          document.body.appendChild(el);
          this.dyingEl = el;
        },
        dyingHide() { if (this.dyingEl) { this.dyingEl.remove(); this.dyingEl = null; } },
        showCards(title, cards, selectable) {
          const box = this.showModal('<div class="panel" style="padding:14px"><div style="margin-bottom:10px;font-weight:700;color:var(--gold)">' + title + '</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">' +
            cards.map(function(c) { return SGS.cardView(c); }).join('') + '</div>' +
            '<button class="btn btn-main" id="m-close" style="margin-top:12px">确定</button></div>');
          box.querySelector('#m-close').onclick = function() { SGS.ui.closeModal(); };
        },
        showResult(title) {
          if (this.pending) { var p = this.pending; this.pending = null; p.resolve(null); }
          const G = this.game;
          let rows = '';
          G.players.forEach(function(p) {
            var id = G.mode === '8p' ? SGS.IDENT[p.identity] : G.mode === '2v2' ? (p.team === 0 ? '一队' : '二队') : (p.human ? '你' : '敌方');
            rows += '<div style="font-size:13px;padding:3px">' + p.name + '（' + id + '）' + (p.alive ? ' · 存活' : ' · 阵亡') + '</div>';
          });
          const box = this.showModal('<div class="panel" style="padding:18px"><h3 style="font-size:26px">🏁 ' + title + '</h3>' +
            '<div style="margin:10px 0;text-align:left">' + rows + '</div>' +
            '<div><button class="btn btn-main" id="r-again">再来一局</button> <button class="btn btn-ghost" id="r-menu">返回主菜单</button></div></div>');
          box.querySelector('#r-again').onclick = function() { SGS.ui.closeModal(); SGS.startGame(SGS.ui.game.mode, SGS.ui.game.players[0].general); };
          box.querySelector('#r-menu').onclick = function() { SGS.ui.closeModal(); SGS.showScreen('screen-menu'); };
        }
      };
      (function() {
        document.getElementById('hand').addEventListener('click', function(e) {
          const cardEl = e.target.closest('.card');
          if (!cardEl || !SGS.ui.game) return;
          SGS.ui.handClick(cardEl.dataset.cid);
        });
        document.getElementById('btn-ok').addEventListener('click', function() { SGS.ui.ok(); });
        document.getElementById('btn-cancel').addEventListener('click', function() { SGS.ui.cancel(); });
        document.getElementById('btn-end').addEventListener('click', function() { SGS.ui.endTurn(); });
        document.getElementById('skillbar').addEventListener('click', function(e) {
          const b = e.target.closest('.btn-skill');
          if (!b || !SGS.ui.game) return;
          const act = (SGS.ui.game.playActions || []).find(a => a.skill.name === b.dataset.skill);
          if (act) SGS.ui.game.uiAct && SGS.ui.game.uiAct({ type: 'skill', skill: act.skill });
        });
        document.getElementById('prompt').addEventListener('click', function(e) {
          const chip = e.target.closest('.usage-chip');
          if (!chip || !SGS.ui.game || SGS.ui.pending) return;
          const i = +chip.dataset.u;
          if (SGS.ui.sel.usages[i]) { SGS.ui.sel.usage = SGS.ui.sel.usages[i]; SGS.ui.sel.targets = []; SGS.ui.refreshAll(); }
        });
        document.getElementById('modal').addEventListener('click', function(e) {
          if (e.target === document.getElementById('modal') && !SGS.ui.pending) SGS.ui.closeModal();
        });
      })();
      window.__sgBanner('✅ 段8 已由内置备份重建');
    } catch (e) {
      window.__sgBanner('段8 内置备份失败: ' + e.message);
    }
  }
  /* ---------- 其余段落自愈（文本完好但未执行的段重新执行） ---------- */
  var HEAL = [
    ['seg-3', '段3·牌堆', function() { return window.SGS && SGS.buildDeck; }],
    ['seg-5', '段5·AI', function() { return window.SGS && SGS.AI; }],
    ['seg-6', '段6·武将数据', function() { return window.SGS && SGS.GENERALS; }],
    ['seg-7', '段7·编辑器', function() { return window.SGS && SGS.editor; }],
    ['seg-9', '段9·开局', function() { return window.SGS && SGS.startGame; }]
  ];
  var healed = [];
  for (var h = 0; h < HEAL.length; h++) {
    var sid = HEAL[h][0], sname = HEAL[h][1], okFn = HEAL[h][2];
    try { if (okFn()) continue; } catch (e) {}
    var el = document.getElementById(sid);
    if (!el || !el.textContent || el.textContent.trim().length < 50) continue;
    try {
      (0, eval)(el.textContent);
      if (okFn()) healed.push(sname);
      else window.__sgBanner(sname + ' 执行成功但关键内容仍缺失，可能被截断。');
    } catch (e2) {
      window.__sgBanner('【' + sname + '】自愈失败: ' + e2.message);
    }
  }
  /* ---------- 最终模块检查 ---------- */
  var mods = [
    ['段2·核心引擎', window.SGS && SGS.bus && SGS.skills],
    ['段3·牌堆', window.SGS && SGS.buildDeck],
    ['段4·游戏规则', window.SGS && SGS.Game],
    ['段5·AI', window.SGS && SGS.AI],
    ['段6·武将数据', window.SGS && SGS.GENERALS],
    ['段7·编辑器', window.SGS && SGS.editor],
    ['段8·界面', window.SGS && SGS.ui],
    ['段9·开局', window.SGS && SGS.startGame]
  ];
  var missing = [];
  for (var m = 0; m < mods.length; m++) if (!mods[m][1]) missing.push(mods[m][0]);
  if (missing.length) {
    window.__sgBanner('⚠ 缺少模块: ' + missing.join('、') + '。' +
      (healed.length ? '（已自愈: ' + healed.join('、') + '）' : ''));
  }
  console.log('√ 段10B 已应用' + (healed.length ? '，自愈: ' + healed.join('、') : ''));
})();
