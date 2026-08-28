(function(){
try{
/* R1:扣置归属兜底：不再依赖 toP，避免 null.jail 崩溃 */
var _mv2 = SGS.Game.prototype.moveCard;
SGS.Game.prototype.moveCard = async function(card, fromP, fromZone, toP, toZone, reason) {
 if (toZone === 'jail') {
  var owner = toP || fromP || card.owner;
  if (!owner) return;
  this.removeFromZone(card);
  card.zone = 'jail'; card.owner = owner;
  owner.jail = owner.jail || [];
  owner.jail.push(card);
  if (fromZone === 'hand' && fromP) await this.emit('loseAfter', { player: fromP, cards: [card], reason });
  return;
 }
 return _mv2.call(this, card, fromP, fromZone, toP, toZone, reason);
};
/* R2:扣置角标移到座位左下角，避开屏幕中央弹窗 */
var st = document.createElement('style');
st.textContent = '.pojun-tag{left:4px!important;right:auto!important;top:auto!important;bottom:4px!important}';
document.head.appendChild(st);
console.log('√ 段10R 修复补丁已应用');
}catch(e){ if (window.__sgBanner) window.__sgBanner('10R失败: ' + e.message); }
})();
