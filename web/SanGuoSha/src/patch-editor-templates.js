(function(){
try{
 var E = SGS.editor, selT = $('sk-template');
 if (E && E.TEMPLATES && selT) {
  var n = 0;
  Object.keys(E.TEMPLATES).forEach(function(k) {
   if (!selT.querySelector('option[value="' + k + '"]')) {
    var o = document.createElement('option');
    o.value = k; o.textContent = E.TEMPLATES[k].name;
    selT.appendChild(o); n++;
   }
  });
  if (n > 0) SGS.toast('模板列表已刷新，新增 ' + n + ' 个模板');
 }
 console.log('√ 段10V 模板刷新已应用');
}catch(e){ if (window.__sgBanner) window.__sgBanner('10V失败: ' + e.message); }
})();
