(function(){
try{
var E = SGS.editor;
/* X1:补上"使用牌结算完毕后"时机选项（文澜失联的真凶） */
var hasEv = E.EVENT_OPTS.some(function(p) { return p[0] === 'cardUseAfterEffect'; });
if (!hasEv) E.EVENT_OPTS.push(['cardUseAfterEffect', '当你使用牌结算完毕后']);
var trgSel = $('sk-trigger');
if (trgSel && !trgSel.querySelector('option[value="cardUseAfterEffect"]')) {
 var o = document.createElement('option'); o.value = 'cardUseAfterEffect'; o.textContent = '当你使用牌结算完毕后'; trgSel.appendChild(o);
}

/* X2:重写赋牌多牌名用法（按每个牌名重新计算目标规则） */
var _guX = SGS.Game.prototype.getUsages;
SGS.Game.prototype.getUsages = async function(p, card) {
 if (p._noCount > 0 && p.usedSha >= 1) p.usedSha -= Math.min(p.usedSha, p._noCount);
 var plain = card && card.names ? Object.assign({}, card) : card;
 if (plain !== card) delete plain.names;
 var us = await _guX.call(this, p, plain);
 if (p._pierce > 0) {
  for (const u of us) if (['杀', '顺手牵羊', '决斗'].indexOf(u.name) >= 0) u.targets = this.players.filter(function(t) { return t.alive && t !== p; });
 }
 if (card && card.names && card.names.length > 1 && this.phase === 'play' && p === this.players[this.turn]) {
  for (const nm of card.names) {
   if (nm === card.name || !SGS.CARD_INFO[nm]) continue;
   var cv = Object.assign({}, card, { name: nm, type: SGS.CARD_INFO[nm].type });
   delete cv.names;
   var altUs = await _guX.call(this, p, cv);
   for (const u of altUs) us.push(Object.assign({}, u, { card: card, asName: nm, via: '赋' }));
  }
 }
 return us;
};

/* X3:多种用法时弹出选择器（赋牌选牌名） */
SGS.ui.pickUsage = function() {
 var s = this.sel;
 if (!s || !s.usages || s.usages.length <= 1 || !s.cards.length) return;
 var uniq = [];
 var seen = {};
 for (const u of s.usages) {
  if (!seen[u.name]) { seen[u.name] = true; uniq.push(u); }
 }
 if (uniq.length <= 1) { s.usage = uniq[0]; return; }
 var ui = this;
 var html = uniq.map(function(u, i) {
  var label = u.pair ? '杀（丈八蛇矛）' : (u.via && u.via !== '赋' ? u.via + '·【' + u.name + '】' : (u.via === '赋' ? '赋牌当【' + u.name + '】' : u.name));
  return '<button class="btn btn-main" data-i="' + i + '" style="margin:4px">以' + label + '使用</button>';
 }).join('');
 ui.showModal('<div class="panel" style="padding:14px"><div style="margin-bottom:10px;font-weight:700;color:var(--gold)">选择使用牌名</div><div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">' + html + '</div></div>');
 var btns = document.querySelectorAll('#modal-box button[data-i]');
 for (const b of btns) b.onclick = function() {
  s.usage = uniq[+b.dataset.i];
  ui.closeModal();
  ui.refreshAll();
 };
};
var _cuX = SGS.ui.computeUsage;
SGS.ui.computeUsage = async function() {
 var r = await _cuX.call(this);
 var s = this.sel;
 if (s && s.usages && s.usages.length > 1 && s.cards.length) this.pickUsage();
 return r;
};
console.log('√ 段10X 赋牌多牌名修复已应用');
}catch(e){ if (window.__sgBanner) window.__sgBanner('10X失败: ' + e.message); }
})();
