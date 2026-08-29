(function(){
try{
/* M1:效果需要选人时，自动把"自己"目标规则提升为"其他角色"（弹选目标页）*/
var _ct2 = SGS.skills.chooseTargets;
SGS.skills.chooseTargets = async function(game, player, skill, sctx, tr){
 if (tr && tr.type === 'self') {
  var need = (skill.effects || []).some(function(e){ return e.target === 'target' || e.target === 'targets'; });
  if (need) tr = Object.assign({}, tr, { type: 'other' });
 }
 return _ct2.call(this, game, player, skill, sctx, tr);
};
/* M2:AI 制衡（弃任意张）不再只弃一张，改为弃废牌 */
var _pc = SGS.AI.pickCards;
SGS.AI.pickCards = async function(game, p, req){
 if (req && req.n == null && req.allowZero) {
  await SGS.sleep(300);
  if (req.prompt && req.prompt.includes('弃置')) {
   var bad = p.hand.filter(function(c){ return SGS.AI.cardValue(c, p) <= 2; });
   return bad.length ? bad : [];
  }
  return [];
 }
 return _pc.call(this, game, p, req);
};
console.log('√ 段10M 补丁已应用');
}catch(e){ if (window.__sgBanner) window.__sgBanner('10M失败: ' + e.message); }
})();
