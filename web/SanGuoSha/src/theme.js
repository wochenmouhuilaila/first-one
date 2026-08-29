(function(){
try{
/* 标题更名 */
document.title = '南极特色三国杀';
var mt = document.getElementById('menu-title');
if (mt) mt.textContent = '南极特色三国杀';

/* 古朴配色：墨色 + 深木 + 古金 + 宣纸素色 */
var st = document.createElement('style');
st.textContent =
 ':root{--bg:#171310;--panel:#2b2318;--panel2:#38301f;--line:#5d4c33;--gold:#d9b06a;--txt:#eadfca;--dim:#a6977c;--red:#c4553f;--ink:#cfc4ac}' +
 'body{background:radial-gradient(1100px 700px at 50% -12%, #4a3b24 0%, #171310 62%)}' +
 '#menu-title{font-size:46px;letter-spacing:.12em;color:#e6c48c;text-shadow:0 0 18px rgba(217,176,106,.85),0 0 46px rgba(217,176,106,.35),0 4px 0 #5a4522}' +
 '#screen-game{background:#d4c6a6}' +
 '#center .pile-label{color:#6b583f}' +
 '#phase-txt{background:rgba(43,35,24,.92);border-color:#6b583f;color:#e6c48c}' +
 '#hand-zone{background:linear-gradient(180deg,rgba(43,35,24,.5),rgba(23,19,16,.97))}' +
 '.btn-skill{background:linear-gradient(180deg,#6a5636,#3e3120);color:#f0e6d0;border-color:#8d7448}' +
 '::-webkit-scrollbar-thumb{background:#4a3b24}';
document.head.appendChild(st);
console.log('√ 段10N 美工补丁已应用');
}catch(e){ if (window.__sgBanner) window.__sgBanner('10N失败: ' + e.message); }
})();
