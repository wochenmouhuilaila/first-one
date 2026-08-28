(function(){
try{
/* Y1:自动修复已保存武将里"文澜"的过期时机 */
var _load = SGS.customStore.load;
SGS.customStore.load = function() {
 var gs = _load.call(this) || [];
 var fixed = 0;
 for (const g of gs) {
  for (const s of g.skills || []) {
   var hasFu = (s.effects || []).some(function(e) {
    return e && (e.op === 'fuWave' || ((e.then || []).concat(e.else || [])).some(function(x) { return x && x.op === 'fuWave'; }));
   });
   if (hasFu && (!s.trigger || s.trigger.event !== 'cardUseAfterEffect')) { s.trigger = { event: 'cardUseAfterEffect' }; fixed++; }
  }
 }
 if (fixed > 0) { try { localStorage.setItem(this.key, JSON.stringify(gs)); } catch(e) {} }
 return gs;
};
/* Y2:文澜全程可视化反馈 */
var fuPool2 = Object.keys(SGS.CARD_INFO).filter(function(n) { return SGS.CARD_INFO[n].type !== 'equip'; });
function fuExtra2(card) { var x = fuPool2[Math.floor(Math.random() * fuPool2.length)]; return x === card.name ? (fuPool2[0] === card.name ? fuPool2[1] : fuPool2[0]) : x; }
SGS.FX.fuWave = async ctx => {
 var p = ctx.owner;
 var c = ctx.card || (ctx.data && ctx.data.card);
 if (!c || (c.type === 'trick' && SGS.CARD_INFO[c.name] && SGS.CARD_INFO[c.name].sub === 'delayed')) return;
 var prev = p._fuPrev;
 if (!prev) {
  p._fuPrev = { name: c.name, fu: !!c.fu, names: c.names || [c.name] };
  SGS.toast('【文澜】已记录第1张：' + c.name + (c.fu ? '（赋）' : ''));
  return;
 }
 p._fuPrev = null;
 if (prev.fu && c.fu && prev.name === c.name) {
  var got = 0;
  var t1 = prev.names.filter(function(x) { return x !== prev.name; })[0];
  var t2 = (c.names || [c.name]).filter(function(x) { return x !== c.name; })[0];
  for (const nm of [t1, t2]) {
   if (!nm) continue;
   var found = ctx.game.deck.filter(function(x) { return x.name === nm; })[0] || ctx.game.deck[ctx.game.deck.length - 1];
   if (found) { var ix = ctx.game.deck.indexOf(found); ctx.game.deck.splice(ix, 1); found.zone = 'hand'; found.owner = p; found.fu = true; found.names = [found.name, fuExtra2(found)]; p.hand.push(found); got++; }
  }
  ctx.game.log('【文澜】两赋同名，获得 ' + got + ' 张赋牌');
  SGS.toast('【文澜】两赋同名，摸 ' + got + ' 张赋牌');
 } else {
  var sel;
  if (p.ai) { sel = [p.hand.find(function(x) { return !x.fu; }) || p.hand[0]]; }
  else { var pk = await SGS.req(ctx.game, p, { type: 'pickCards', n: 1, prompt: '【文澜】选择一张手牌标记为「赋」' }); sel = pk || []; }
  if (sel && sel[0]) { sel[0].fu = true; sel[0].names = [sel[0].name, fuExtra2(sel[0])]; ctx.game.log(p.name + ' 将一张手牌标记为「赋」'); SGS.toast('【文澜】已标记一张手牌为「赋」'); }
  else SGS.toast('【文澜】未选择，跳过标记');
 }
};
console.log('√ 段10Y 文澜修复已应用');
}catch(e){ if (window.__sgBanner) window.__sgBanner('10Y失败: ' + e.message); }
})();
