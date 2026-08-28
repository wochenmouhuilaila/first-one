(function(){
try{
var U = SGS.ui, P = SGS.Game.prototype;

/* K1:重建弹窗请求（修复弹窗点击崩溃/卡死，新增多选与盲选支持）*/
U.request = function(player, opts){
 var ui = this, G = this.game;
 if (!G || player.ai) return Promise.resolve(null);
 return new Promise(function(res){
  ui.sel = { cards: [], targets: [], usages: [], usage: null };
  ui.pending = { player: player, opts: opts, resolve: function(v){ ui.pending = null; ui.refreshAll(); res(v); } };
  var t = opts.type;
  if (t === 'yesNo' || t === 'choose' || t === 'chooseSuit' || t === 'pickCard' || t === 'skill' || t === 'pickCardsFrom') ui.modalRequest(opts);
  else ui.refreshAll();
 });
};
U.modalRequest = function(opts){
 var ui = this;
 var box = ui.showModal('<div class="panel" style="padding:14px"><div style="margin-bottom:12px;font-weight:700;color:var(--gold);letter-spacing:.1em">' + (opts.prompt || '') + '</div><div id="m-body"></div></div>');
 var body = box.querySelector('#m-body');
 var close = function(v){ return function(){ ui.closeModal(); var p = ui.pending; if (p && p.resolve) p.resolve(v); }; };
 if (opts.type === 'yesNo') {
  body.innerHTML = '<button class="btn btn-main" id="m-y">确定</button> <button class="btn btn-ghost" id="m-n">取消</button>';
  body.querySelector('#m-y').onclick = close(true);
  body.querySelector('#m-n').onclick = close(false);
 } else if (opts.type === 'skill') {
  var s = opts.skill;
  body.innerHTML = '<div style="font-size:13px;color:var(--dim);margin-bottom:10px">' + (s.desc || '') + '</div><button class="btn btn-main" id="m-y">发动【' + s.name + '】</button> <button class="btn btn-ghost" id="m-n">不发动</button>';
  body.querySelector('#m-y').onclick = close(true);
  body.querySelector('#m-n').onclick = close(false);
 } else if (opts.type === 'chooseSuit') {
  body.innerHTML = (opts.options || ['♠','♥','♣','♦']).map(function(su){ return '<button class="btn btn-ghost" data-s="' + su + '" style="font-size:22px;width:56px;margin:4px;' + (su === '♥' || su === '♦' ? 'color:var(--red)' : '') + '">' + su + '</button>'; }).join('');
  body.querySelectorAll('button').forEach(function(b){ b.onclick = close(b.dataset.s); });
 } else if (opts.type === 'choose') {
  body.innerHTML = (opts.options || []).map(function(o, i){ return '<button class="btn btn-main" data-i="' + i + '" style="margin:4px;display:block;width:100%">' + o + '</button>'; }).join('');
  body.querySelectorAll('button').forEach(function(b){ b.onclick = close(+b.dataset.i); });
 } else if (opts.type === 'pickCard') {
  body.innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;max-height:320px;overflow-y:auto">' + opts.options.map(function(o, i){ return '<div data-i="' + i + '" style="cursor:pointer">' + SGS.cardView(o.card, { back: !!o.hidden }) + '</div>'; }).join('') + '</div>';
  body.querySelectorAll('[data-i]').forEach(function(d){ d.onclick = close(opts.options[+d.dataset.i]); });
 } else if (opts.type === 'pickCardsFrom') {
  var selArr = [];
  body.innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;max-height:300px;overflow-y:auto">' + opts.options.map(function(o, i){ return '<div data-i="' + i + '" style="cursor:pointer">' + SGS.cardView(o.card) + '</div>'; }).join('') + '</div><div style="text-align:center;margin-top:10px"><button class="btn btn-main" id="m-ok">确定</button> <button class="btn btn-ghost" id="m-n">取消</button></div>';
  body.querySelectorAll('[data-i]').forEach(function(d){
   d.onclick = function(){
    var o = opts.options[+d.dataset.i];
    var idx = selArr.indexOf(o);
    if (idx >= 0) { selArr.splice(idx, 1); d.style.outline = ''; }
    else {
     if (selArr.length >= (opts.max || 1)) { ui.toast('最多选择 ' + (opts.max || 1) + '张'); return; }
     selArr.push(o); d.style.outline = '3px solid var(--gold)';
    }
   };
  });
  body.querySelector('#m-ok').onclick = function(){ ui.closeModal(); var p = ui.pending; if (p && p.resolve) p.resolve(selArr.slice()); };
  body.querySelector('#m-n').onclick = close(null);
 }
};

/* K2:过河拆桥/顺手牵羊 手牌盲选（背面），装备/判定可见 */
P.pickCardFrom = async function(p, t, why){
 var options = [];
 t.hand.forEach(function(c){ options.push({ card: c, zone: 'hand', hidden: true }); });
 ['weapon','armor','horseP','horseM'].forEach(function(k){ if (t.equips[k]) options.push({ card: t.equips[k], zone: 'equip' }); });
 t.judges.forEach(function(c){ options.push({ card: c, zone: 'judge' }); });
 if (!options.length) return null;
 if (p.ai) return SGS.AI.pickCardTarget(this, p, options, t, why);
 return await SGS.req(this, p, { type: 'pickCard', options: options, prompt: '请选择 ' + t.name + '区域里的一张牌（' + why + '；手牌背面盲选）' });
};

/* K3:点击非可选座位 → 显示武将信息 */
U.showGeneral = function(p){
 var g = p.general || {};
 var skills = (g.skills || []).map(function(s){ return '<div style="margin:3px0"><b style="color:var(--gold)">【' + s.name + '】</b> ' + (s.desc || '') + '</div>'; }).join('');
 var idt = '';
 if (this.game && this.game.mode === '8p' && (p.revealed || p.human)) idt = '<div>身份：' + SGS.IDENT[p.identity] + '</div>';
 var eqs = ['weapon','armor','horseP','horseM'].filter(function(k){ return p.equips[k]; }).map(function(k){ return p.equips[k].name; }).join('、') || '无';
 var html = '<div style="text-align:center;margin-bottom:8px"><b style="font-size:18px;color:var(--gold)">' + p.name + '</b> <span style="color:var(--dim);font-size:12px">' + (g.title || '') + '</span></div>' +
  '<div style="font-size:13px;line-height:1.8">阵营：' + (SGS.KINGDOM[g.kingdom] || '') + '性别：' + (g.gender === 'female' ? '女' : '男') + '<br>体力：' + p.hp + '/' + p.maxHp + '手牌：' + p.hand.length + '张<br>装备：' + eqs + idt +
  '<div style="margin-top:6px;border-top:1px solid var(--line);padding-top:6px">' + (skills || '<span style="color:var(--dim)">无技能</span>') + '</div></div>';
 this.showModal('<div class="panel" style="padding:16px;min-width:260px;max-width:82vw;max-height:70vh;overflow-y:auto">' + html + '<div style="text-align:center;margin-top:10px"><button class="btn btn-main btn-sm" id="m-close">关闭</button></div></div>');
 var mc = document.getElementById('m-close');
 if (mc) mc.onclick = function(){ SGS.ui.closeModal(); };
};
var _sc = U.seatClick;
U.seatClick = function(p){
 if (!p || !p.alive) return;
 var pend = this.pending;
 var canPick = pend && (pend.opts.type === 'chooseTarget' || pend.opts.type === 'chooseTargets') && (pend.opts.pool || []).indexOf(p) >= 0;
 var canTgt = !pend && this.sel.usage && this.sel.usage.needSelect && (this.sel.usage.targets || []).indexOf(p) >= 0;
 if (!canPick && !canTgt) { this.showGeneral(p); return; }
 return _sc.call(this, p);
};

/* K4:屏幕右侧常显"最近打出的牌"（他人锦囊可见牌面） */
var _fxu = U.fxUseCard;
U.fxUseCard = function(p, card){
 if (_fxu) _fxu.call(this, p, card);
 var box = document.getElementById('last-card');
 if (!box) {
  box = document.createElement('div');
  box.id = 'last-card';
  box.style.cssText = 'position:fixed;right:10px;bottom:140px;z-index:45;pointer-events:none';
  document.body.appendChild(box);
 }
 box.innerHTML = '<div style="font-size:11px;color:var(--gold);text-align:center;margin-bottom:4px;letter-spacing:.1em">' + p.name + '打出</div>' + SGS.cardView(card);
 clearTimeout(U.__lcT);
 U.__lcT = setTimeout(function(){ box.innerHTML = ''; }, 3200);
};

/* K5:丈八蛇矛可在响应【杀】时两张牌当杀（决斗/南蛮） */
var _ar = P.askResponse;
P.askResponse = async function(p, kind, opts){
 opts = opts || {};
 var r = await _ar.call(this, p, kind, opts);
 if (kind === 'sha' && (!r || !r.length) && p.alive && p.equips.weapon && p.equips.weapon.name === '丈八蛇矛' && p.hand.length >= 2) {
  var want;
  if (p.ai) want = true;
  else want = await this.askYesNo(p, '【丈八蛇矛】是否将两张手牌当【杀】' + (opts.duel ? '打出响应决斗' : '打出') + '？');
  if (want) {
   var two;
   if (p.ai) two = SGS.AI.pickDiscard(p, 2);
   else two = await SGS.req(this, p, { type: 'pickCards', n: 2, prompt: '【丈八蛇矛】选择两张手牌当【杀】' });
   if (two && two.length >= 2) {
    two = two.slice(0, 2);
    await this.discardCards(p, two, '丈八蛇矛当杀打出');
    this.log(p.name + '发动【丈八蛇矛】将两张牌当【杀】');
    r = [SGS.virtualCard('杀', two[0])];
   }
  }
 }
 return r;
};

/* K6:手牌区横向滑动（移动端） */
var st = document.createElement('style');
st.textContent = '#hand{overflow-x:auto;overflow-y:hidden;justify-content:flex-start;gap:0;padding-left:6px;padding-right:6px;-webkit-overflow-scrolling:touch}#hand>.card{margin:auto 4px}#hand::-webkit-scrollbar{height:6px}';
document.head.appendChild(st);

console.log('√ 段10K 修复补丁已应用');
}catch(e){ if (window.__sgBanner) window.__sgBanner('10K失败: ' + e.message); }
})();
