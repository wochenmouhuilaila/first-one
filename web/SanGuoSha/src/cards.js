/* ---------- 卡牌信息表 ---------- */
SGS.CARD_INFO = {
  '杀': { type: 'basic', desc: '对攻击范围内的一名角色造成 1 点伤害' },
  '闪': { type: 'basic', desc: '抵消【杀】的效果' },
  '桃': { type: 'basic', desc: '回复 1 点体力；濒死时可救回' },
  '决斗': { type: 'trick', desc: '与目标轮流打出【杀】，先不出者受 1 点伤害' },
  '过河拆桥': { type: 'trick', desc: '弃置一名角色区域里的一张牌' },
  '顺手牵羊': { type: 'trick', desc: '获得距离 1 的一名角色区域里的一张牌' },
  '无中生有': { type: 'trick', desc: '你摸两张牌' },
  '南蛮入侵': { type: 'trick', desc: '所有其他角色需打出【杀】，否则受 1 点伤害' },
  '万箭齐发': { type: 'trick', desc: '所有其他角色需打出【闪】，否则受 1 点伤害' },
  '桃园结义': { type: 'trick', desc: '所有角色各回复 1 点体力' },
  '乐不思蜀': { type: 'trick', sub: 'delayed', desc: '判定：不为♥则跳过出牌阶段' },
  '闪电': { type: 'trick', sub: 'delayed', desc: '判定：♠2-9 受 3 点雷伤，否则传给下家' },
  '无懈可击': { type: 'trick', desc: '抵消一张锦囊牌对一名角色的效果' },
  '诸葛连弩': { type: 'equip', sub: 'weapon', range: 1, desc: '出牌阶段你可以使用任意张【杀】' },
  '青釭剑': { type: 'equip', sub: 'weapon', range: 2, desc: '无视目标防具' },
  '贯石斧': { type: 'equip', sub: 'weapon', range: 3, desc: '弃置两张牌可使此【杀】不可闪避' },
  '丈八蛇矛': { type: 'equip', sub: 'weapon', range: 3, desc: '两张手牌可当【杀】使用' },
  '雌雄双股剑': { type: 'equip', sub: 'weapon', range: 2, desc: '对异性使用【杀】时对方弃一张牌或你摸一张' },
  '八卦阵': { type: 'equip', sub: 'armor', desc: '需要【闪】时可判定：红色视为打出【闪】' },
  '仁王盾': { type: 'equip', sub: 'armor', desc: '黑色【杀】对你无效' },
  '赤兔': { type: 'equip', sub: 'horseP', desc: '与其他角色的距离 -1' },
  '的卢': { type: 'equip', sub: 'horseM', desc: '其他角色与你的距离 +1' }
};

/* ---------- 牌堆构成（紧凑编码：花色+点数，T=10） ---------- */
SGS.DECK_SPEC = {
  '杀': '♠7♠8♠8♠9♠9♠T♠T♣2♣3♣4♣5♣6♣7♣8♣8♣9♣9♣T♣T♣J♣J♥T♥T♥J♦6♦7♦8♦9♦T♦K',
  '闪': '♦2♦2♦3♦3♦4♦4♦5♦6♦7♦8♦9♦T♦J♥2♥2',
  '桃': '♥3♥4♥6♥7♥8♥9♥Q♦Q',
  '决斗': '♠A♣A♦A',
  '过河拆桥': '♠3♠4♠Q♥Q♣3♣4',
  '顺手牵羊': '♠3♠4♠J♦3♦4',
  '无中生有': '♥7♥8♥9♥J',
  '南蛮入侵': '♠7♠K♣7',
  '万箭齐发': '♥A',
  '桃园结义': '♥A',
  '乐不思蜀': '♠6♥6♣6',
  '闪电': '♠A♦Q',
  '无懈可击': '♠J♣Q♥A♦Q',
  '诸葛连弩': '♣A♦A',
  '青釭剑': '♠6',
  '贯石斧': '♦5',
  '丈八蛇矛': '♠Q',
  '雌雄双股剑': '♠2',
  '八卦阵': '♠2♣2',
  '仁王盾': '♣2',
  '赤兔': '♥5',
  '的卢': '♣5'
};
/* 总计 96 张：基本 53（杀30/闪15/桃8）+ 锦囊 32 + 装备 11 */

SGS.isRed = c => c.suit === '♥' || c.suit === '♦';
SGS.isBlack = c => c.suit === '♠' || c.suit === '♣';

/* ---------- 点数显示 ---------- */
SGS.numStr = num => num === 1 ? 'A' : num === 11 ? 'J' : num === 12 ? 'Q' : num === 13 ? 'K' : String(num);
SGS.numVal = ch => ch === 'A' ? 1 : ch === 'T' ? 10 : ch === 'J' ? 11 : ch === 'Q' ? 12 : ch === 'K' ? 13 : +ch;

/* ---------- 生成牌堆 ---------- */
SGS.buildDeck = function() {
  const deck = [];
  for (const name in SGS.DECK_SPEC) {
    const info = SGS.CARD_INFO[name];
    const s = SGS.DECK_SPEC[name];
    for (let i = 0; i < s.length; i += 2) {
      deck.push({
        id: SGS.uid(), name, type: info.type, sub: info.sub || null,
        suit: s[i], num: SGS.numVal(s[i + 1]),
        desc: info.desc, range: info.range || 0, zone: 'deck'
      });
    }
  }
  return deck;
};

/* ---------- 虚拟牌（视为使用/打出，无实体牌面） ---------- */
SGS.virtualCard = function(name, src) {
  const info = SGS.CARD_INFO[name] || { type: 'basic' };
  return {
    id: SGS.uid(), name, type: info.type, sub: info.sub || null,
    suit: src ? src.suit : null, num: src ? src.num : 0,
    desc: info.desc, range: info.range || 0, zone: 'proc', virtual: true
  };
};

/* ---------- 统一卡面模板 ---------- */
SGS.cardView = function(card, opts) {
  opts = opts || {};
  if (!card) return '<div class="card card-sm card-back"></div>';
  const red = card.suit === '♥' || card.suit === '♦';
  const cls = ['card'];
  cls.push(red ? 'red' : 'black');
  cls.push('card-' + card.type);
  if (opts.small) cls.push('card-sm');
  if (opts.sel) cls.push('card-sel');
  if (opts.back) cls.push('card-back');
  if (opts.dim) cls.push('card-dim');
  if (opts.hand) cls.push('card-hand');
  const tag = card.type === 'basic' ? '基本' : card.type === 'trick' ? '锦囊' : '装备';
  const name = opts.name || card.name;
  const num = card.suit ? SGS.numStr(card.num) : '';
  const desc = card.virtual ? card.desc : (opts.desc || card.desc || (SGS.CARD_INFO[name] && SGS.CARD_INFO[name].desc) || '');
  let inner = '';
  if (!opts.back) {
    inner = '<div class="c-top"><span>' + (card.suit || '') + '</span><span>' + num + '</span></div>' +
      '<div class="c-name">' + name + '</div>' +
      '<div class="c-desc">' + desc + '</div>' +
      '<div class="c-tag">' + tag + '</div>';
  }
  return '<div class="' + cls.join(' ') + '" data-cid="' + card.id + '">' + inner + '</div>';
};

/* ---------- 卡面 JSON 副本（编辑器预览 / 导出用） ---------- */
SGS.cardToJSON = function(card) {
  return { name: card.name, type: card.type, sub: card.sub, suit: card.suit, num: card.num, desc: card.desc };
};

console.log('√ 段3 牌堆与卡面已加载，共 ' + SGS.buildDeck().length + ' 张');
