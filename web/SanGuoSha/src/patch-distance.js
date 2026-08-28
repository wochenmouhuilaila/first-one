(function(){
try{
/* W1:条件中的距离/攻击范围改为同步计算（原实现返回异步Promise，条件恒为假） */
var _mkW = SGS.cond.mkGetter;
SGS.cond.mkGetter = function(ctx) {
 var base = _mkW.call(this, ctx);
 var syncDist = function(a, b) {
  if (!a || !b) return 1;
  var n = (ctx.game && ctx.game.players.length) || 2;
  var d = Math.abs((b.seat || 0) - (a.seat || 0));
  d = Math.min(d, n - d) || 1;
  if (b.equips && b.equips.horseM) d++;
  if (a.equips && a.equips.horseP) d--;
  if (a.general && a.general.skills) a.general.skills.forEach(function(s) {
   if (s && s.modify && s.modify.op === 'distance' && s.modify.delta) d += s.modify.delta;
  });
  return Math.max(1, d);
 };
 var syncRange = function(a) {
  if (!a) return 1;
  var v = 1;
  if (a.equips && a.equips.weapon && a.equips.weapon.range) v = a.equips.weapon.range;
  if (a.general && a.general.skills) a.general.skills.forEach(function(s) {
   if (s && s.modify && s.modify.op === 'attackRange' && s.modify.delta) v += s.modify.delta;
  });
  return v;
 };
 return function(path) {
  if (path === 'distance') return syncDist(ctx.self, ctx.target);
  if (path === 'target.distance') return syncDist(ctx.self, ctx.target);
  if (path === 'source.distance') return syncDist(ctx.self, ctx.source);
  if (path === 'attackRange') return syncRange(ctx.self);
  return base(path);
 };
};
/* W2:壮誓改为"出牌阶段开始时"的触发技（不再是主动按钮） */
if (SGS.editor && SGS.editor.TEMPLATES) {
 var T = SGS.editor.TEMPLATES;
 if (T['zhuangshi1']) { T['zhuangshi1'].type = 'triggered'; T['zhuangshi1'].trigger = 'phasePlayStart'; T['zhuangshi1'].auto = false; }
 if (T['zhuangshi2']) { T['zhuangshi2'].type = 'triggered'; T['zhuangshi2'].trigger = 'phasePlayStart'; T['zhuangshi2'].auto = false; }
}
console.log('√ 段10W 距离条件修复 + 壮誓修正已应用');
}catch(e){ if (window.__sgBanner) window.__sgBanner('10W失败: ' + e.message); }
})();
