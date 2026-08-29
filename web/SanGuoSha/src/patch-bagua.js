(function(){
try{
/* O1:八卦阵改为先询问再判定（防止与原自动判定重复） */
var _ar3 = SGS.Game.prototype.askResponse;
SGS.Game.prototype.askResponse = async function(p, kind, opts) {
 opts = opts || {};
 if (kind === 'shan' && p.equips.armor && p.equips.armor.name === '八卦阵' && !opts.ignoreArmor) {
  var want = p.ai ? true : await this.askYesNo(p, '【八卦阵】是否发动？判定为红色则视为打出【闪】');
  if (want) {
   var jc = await this.judge(p, '八卦阵判定');
   if (SGS.isRed(jc)) { this.log(p.name + ' 八卦阵判定红色，视为打出【闪】'); return [SGS.virtualCard('闪', jc)]; }
   this.log(p.name + ' 八卦阵判定黑色，无效');
  }
  opts = Object.assign({}, opts, { ignoreArmor: true });
 }
 return _ar3.call(this, p, kind, opts);
};
/* O2:测试未填武将名时自动命名并开局 */
var _tg2 = SGS.editor.testGeneral;
SGS.editor.testGeneral = function(){
 var nm = $('ed-name');
 if (nm && !nm.value.trim()) {
  nm.value = '测试' + Math.floor(1000 + Math.random() * 9000);
  SGS.toast('未填武将名，自动命名为「' + nm.value + '」');
 }
 return _tg2.call(this);
};
console.log('√ 段10O 补丁已应用');
}catch(e){ if (window.__sgBanner) window.__sgBanner('10O失败: ' + e.message); }
})();
