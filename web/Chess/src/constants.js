// ==================== 常量 ====================
const ROWS = 10, COLS = 9, EMPTY = '.';
const MAX_MOVE_TOKENS = 32768;
const THINK_BUDGET = 1200;   // 思考模式下的思考token硬上限（思考预算与max_tokens共享上限）
const PIECE_NAMES = { 'R':'车','N':'马','B':'相','A':'仕','K':'帅','C':'炮','P':'兵',
    'r':'车','n':'马','b':'象','a':'士','k':'将','c':'炮','p':'卒' };
const PIECE_VALUES = { 'R':9,'N':4,'B':2,'A':2,'K':100,'C':4.5,'P':1,
    'r':9,'n':4,'b':2,'a':2,'k':100,'c':4.5,'p':1 };
const isRed = ch => ch >= 'A' && ch <= 'Z';
const isBlack = ch => ch >= 'a' && ch <= 'z';
const sameSide = (a,b) => (isRed(a)&&isRed(b))||(isBlack(a)&&isBlack(b));
const COL_LETTERS = 'abcdefghi';

// 中文记谱工具
const CN_NUM = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
const CN_NUM_REV = {1:'一',2:'二',3:'三',4:'四',5:'五',6:'六',7:'七',8:'八',9:'九'};
const CN_PIECE_KIND = { '车':'rook','马':'knight','炮':'cannon','兵':'pawn','卒':'pawn',
    '相':'bishop','象':'bishop','仕':'advisor','士':'advisor','帅':'king','将':'king' };
const RED_PIECE_SET = { '车':'R','马':'N','炮':'C','兵':'P','相':'B','仕':'A','帅':'K' };
const BLACK_PIECE_SET = { '车':'r','马':'n','炮':'c','卒':'p','象':'b','士':'a','将':'k' };
function cnParse(n){ if(!n) return 0; if(CN_NUM[n]) return CN_NUM[n]; const i=parseInt(n); return (i>=1&&i<=9)?i:0; }

