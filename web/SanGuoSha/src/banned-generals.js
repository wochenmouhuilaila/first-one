(function(){
try{
/* 全局 $id 兜底（防止任何补丁引用局部变量失败） */
if (typeof window.$id !== 'function') window.$id = function(id) { return document.getElementById(id); };

/* ===== 禁将系统 ===== */
SGS.banned = (function(){ try { return JSON.parse(localStorage.getItem('sgs_banned') || '[]'); } catch(e) { return []; } })();
SGS.saveBanned = function(){ try { localStorage.setItem('sgs_banned', JSON.stringify(SGS.banned)); } catch(e) {} };
SGS.toggleBan = function(name) {
 var i = SGS.banned.indexOf(name);
 if (i >= 0) SGS.banned.splice(i, 1); else SGS.banned.push(name);
 SGS.saveBanned();
 SGS.editor.refreshCharGrid();
 SGS.menuRefresh();
};

/* 被禁武将：灰显 + 禁字角标 */
var _rcg2 = SGS.editor.refreshCharGrid;
SGS.editor.refreshCharGrid = function() {
 var r = _rcg2.call(this);
 try {
  var banned = SGS.banned || [];
  document.querySelectorAll('#char-select .char-card').forEach(function(el) {
   var isB = banned.indexOf(el.dataset.name) >= 0;
   var bd = el.querySelector('.ban-badge');
   if (isB && !bd) {
    bd = document.createElement('div');
    bd.className = 'ban-badge';
    bd.textContent = '禁';
    bd.style.cssText = 'position:absolute;top:4px;left:4px;background:#7e1d1d;color:#fff;font-size:11px;padding:1px 5px;border-radius:5px;z-index:2';
    el.appendChild(bd);
   } else if (!isB && bd) { bd.remove(); }
   if (isB) { el.style.opacity = '0.45'; el.style.filter = 'grayscale(.7)'; }
   else { el.style.opacity = ''; el.style.filter = ''; }
  });
 } catch(e) {}
 return r;
};

/* 点击武将卡 → 信息弹窗（选择 / 禁将 / 解禁） */
SGS.showCharModal = function(name) {
 var g = SGS.allGenerals().find(function(x) { return x.name === name; });
 if (!g) return;
 var isB = (SGS.banned || []).indexOf(name) >= 0;
 var skills = (g.skills || []).map(function(s) { return '<div style="margin:3px 0"><b style="color:var(--gold)">【' + s.name + '】</b> ' + (s.desc || '') + '</div>'; }).join('');
 var html = '<div class="panel" style="padding:16px;min-width:280px;max-width:84vw;max-height:74vh;overflow-y:auto">' +
  '<div style="text-align:center;margin-bottom:8px"><b style="font-size:18px;color:var(--gold)">' + g.name + '</b> <span style="color:var(--dim);font-size:12px">' + (g.title || '') + (g.custom ? '（自创）' : '') + '</span></div>' +
  '<div style="font-size:13px;line-height:1.8">阵营：' + (SGS.KINGDOM[g.kingdom] || '') + '　性别：' + (g.gender === 'female' ? '女' : '男') + '<br>体力：' + g.maxHp +
  '<div style="margin-top:6px;border-top:1px solid var(--line);padding-top:6px">' + (skills || '<span style="color:var(--dim)">无技能</span>') + '</div></div>' +
  '<div style="text-align:center;margin-top:10px">' +
  '<button class="btn btn-main btn-sm" id="cm-pick"' + (isB ? ' disabled' : '') + '>选择此将</button> ' +
  '<button class="btn ' + (isB ? 'btn-main' : 'btn-danger') + ' btn-sm" id="cm-ban">' + (isB ? '解禁此将' : '禁将此将') + '</button> ' +
  '<button class="btn btn-ghost btn-sm" id="cm-close">关闭</button></div></div>';
 SGS.ui.showModal(html);
 document.getElementById('cm-pick').onclick = function() {
  SGS.menuPick.general = g;
  SGS.menuRefresh();
  SGS.toast('已选择武将：' + g.name);
  SGS.ui.closeModal();
 };
 document.getElementById('cm-ban').onclick = function() {
  SGS.toggleBan(name);
  SGS.ui.closeModal();
  SGS.showCharModal(name);
 };
 document.getElementById('cm-close').onclick = function() { SGS.ui.closeModal(); };
};

/* 拦截武将卡点击（捕获阶段，先于旧的直接选择） */
var cs = $('char-select');
if (cs) {
 cs.addEventListener('click', function(e) {
  var el = e.target.closest ? e.target.closest('.char-card') : null;
  if (!el || !el.dataset.name) return;
  e.stopPropagation();
  SGS.showCharModal(el.dataset.name);
 }, true);
}

/* 开局拦截：人类不能选被禁武将；AI 将池排除被禁武将 */
var _sg2 = SGS.startGame;
SGS.startGame = async function(mode, humanG) {
 humanG = humanG || SGS.menuPick.general || SGS.allGenerals()[0];
 var banned = SGS.banned || [];
 if (banned.length && humanG && banned.indexOf(humanG.name) >= 0) {
  SGS.toast('「' + humanG.name + '」已被禁用，请先解禁或选择其他武将');
  return;
 }
 var _ag = SGS.allGenerals;
 SGS.allGenerals = function() { return _ag.call(this).filter(function(g) { return banned.indexOf(g.name) < 0; }); };
 try { return await _sg2.call(this, mode, humanG); } finally { SGS.allGenerals = _ag; }
};

/* 卡片定位支持角标 */
var st = document.createElement('style');
st.textContent = '.char-card{position:relative}';
document.head.appendChild(st);
console.log('√ 段10T 禁将系统已应用');
}catch(e){ if (window.__sgBanner) window.__sgBanner('10T失败: ' + e.message); }
})();
