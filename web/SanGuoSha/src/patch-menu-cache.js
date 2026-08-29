(function(){
try{
/* 保存/测试武将后，同步刷新菜单缓存的选中对象 */
var _add = SGS.customStore.add;
SGS.customStore.add = function(g){
 _add.call(this, g);
 if (SGS.menuPick && SGS.menuPick.general && SGS.menuPick.general.name === g.name) SGS.menuPick.general = g;
};
/* 每次刷新菜单时按名字重新取最新数据 */
var _mr2 = SGS.menuRefresh;
SGS.menuRefresh = function(){
 if (SGS.menuPick && SGS.menuPick.general) {
  var cur = SGS.allGenerals().find(function(x){ return x.name === SGS.menuPick.general.name; });
  if (cur) SGS.menuPick.general = cur;
 }
 return _mr2.call(this);
};
console.log('√ 段10L 补丁已应用');
}catch(e){ if (window.__sgBanner) window.__sgBanner('10L失败: ' + e.message); }
})();
