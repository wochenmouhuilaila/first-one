(function(){
try{
/* P1:破军加伤不依赖杀牌ID：目标被扣置期间，破军使用者对其造成伤害即+1 */
var _dd2 = SGS.Game.prototype.dealDamage;
SGS.Game.prototype.dealDamage = async function(dmg) {
 if (dmg && dmg.to && dmg.to.pojunInfo && dmg.from && dmg.from === dmg.to.pojunInfo.user) {
  dmg.n = (dmg.n || 1) + 1;
  dmg.to.pojunInfo = null;
  this.log('【破军】牌被扣置，此【杀】伤害 +1！');
 }
 return _dd2.call(this, dmg);
};
/* P2:目标回合开始时归还扣置牌并清空标记（替代旧的回合结束归还） */
var _pt4 = SGS.Game.prototype.playTurn;
SGS.Game.prototype.playTurn = async function(p) {
 p.pojunInfo = null;
 if (p.jail && p.jail.length) {
  var cards = p.jail; p.jail = [];
  for (var i = 0; i < cards.length; i++) { cards[i].zone = 'hand'; cards[i].owner = p; p.hand.push(cards[i]); }
  this.log(p.name + ' 收回了被【破军】扣置的 ' + cards.length + ' 张牌');
 }
 return _pt4.call(this, p);
};
/* P3:死亡时弃置扣置牌（防止牌泄漏） */
var _kill = SGS.Game.prototype.kill;
SGS.Game.prototype.kill = async function(p, source) {
 if (p.jail && p.jail.length) {
  var cs = p.jail; p.jail = [];
  for (var i = 0; i < cs.length; i++) { if (cs[i].zone === 'jail') { cs[i].zone = 'discard'; this.discard.push(cs[i]); } }
 }
 return _kill.call(this, p, source);
};
console.log('√ 段10P 补丁已应用');
}catch(e){ if (window.__sgBanner) window.__sgBanner('10P失败: ' + e.message); }
})();
