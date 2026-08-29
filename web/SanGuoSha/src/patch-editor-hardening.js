(function(){
function $(x){return document.getElementById(x);}
try{
  /* 修复1：genDesc 安全版（cost 为空时不再崩溃） */
  SGS.editor.genDesc = function(skill){
    var CLS={locked:'锁定技，',limited:'限定技，',awaken:'觉醒技，',lord:'主公技，'};
    var LIM={phase:'限一次',turn:'每回合限一次',game:'整局限一次',never:''};
    var prefix=CLS[skill.skillClass]||'';
    var lim=skill.limit?(LIM[skill.limit.scope]||''):'';
    if(skill.type==='conversion'){
      var parts=(skill.convert||[]).map(function(cv){
        var f={any:'任意手牌',isRed:'红色牌',isBlack:'黑色牌'}[cv.filter.op]||(cv.filter.op==='isSuit'?cv.filter.suit:'牌');
        var when=cv.when==='outsideTurn'?'，仅回合外':cv.when==='insideTurn'?'，仅回合内':'';
        return '你可以将'+f+'当【'+cv.as+'】使用或打出'+when;
      });
      return prefix+parts.join('；')+'。';
    }
    if(skill.type==='passive'){
      var m=skill.modify||{op:'',delta:0};
      var d=m.delta;
      var text={
        drawCount:'摸牌阶段摸牌数'+(d>=0?'+':'')+d,
        shaLimit:'使用【杀】无次数限制',
        distance:'与其他角色的距离'+(d>=0?'+':'')+d,
        handLimit:'手牌上限'+(d>=0?'+':'')+d,
        attackRange:'攻击范围'+(d>=0?'+':'')+d,
        trickRange:'使用锦囊无距离限制',
        responsePlus:'对手需多打'+(Math.abs(d)||1)+'张牌响应'
      }[m.op]||'';
      return prefix+text+'。';
    }
    var costT='';
    if(skill.cost){
      costT={
        none:'',
        discardN:'你可以弃置'+(skill.cost.n||1)+'张手牌，',
        discardAny:'你可以弃置任意张手牌，',
        loseHpN:'你可以失去'+(skill.cost.n||1)+'点体力，',
        giveN:'你可以将至少'+(skill.cost.min||1)+'张手牌交给目标，'
      }[skill.cost.type]||'';
    }
    var tgtT={
      self:'',other:'选择一名其他角色，',any:'选择一名角色，',allOthers:'令所有其他角色',
      source:'令伤害来源',all:'令所有角色',other2:'选择至多两名其他角色，'
    }[skill.targetRule?skill.targetRule.type:'self'];
    var effT=(skill.effects||[]).map(function(e){return SGS.editor.effectText(e);}).join('，');
    var ev=skill.trigger&&skill.trigger.event;
    var head=skill.type==='active'?('出牌阶段'+((lim||'')+'，')):((SGS.editor.EVENT_LABEL[ev]||'')+'，');
    return prefix+head+costT+tgtT+(effT||'无效果')+'。';
  };
  /* 修复2：关键编辑操作防双重触发（段7原始绑定+10C委托各触发一次） */
  var guardList=['commitSkill','saveGeneral','testGeneral','openSkill','exportJSON'];
  for(var i=0;i<guardList.length;i++){
    (function(k){
      var orig=SGS.editor[k];
      if(!orig||orig.__g)return;
      var g=function(){
        var now=Date.now();
        if(now-(g._t||0)<400)return;
        g._t=now;
        return orig.apply(this,arguments);
      };
      g._t=0;g.__g=true;
      SGS.editor[k]=g;
    })(guardList[i]);
  }
  console.log('√ seg-10j 已应用（genDesc修复+防双击）');
}catch(e){
  try{console.log('seg-10j失败:',e.message);}catch(e2){}
}
})();
