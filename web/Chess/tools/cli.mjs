#!/usr/bin/env node
// ==================== 象棋 CLI 调试工具 ====================
// 在 Node 里以真实模块图加载游戏（DOM 用桩替代），可用命令行/交互式 REPL 操纵游戏：
//   观察棋盘、走子、运行真实 API 走棋/聊天、mock 模型回复、查看调试事件流。
//
// 用法:
//   node tools/cli.mjs                  # 交互式 REPL（支持 Tab 无关；直接输入命令回车）
//   node tools/cli.mjs <命令> [参数]    # 单次执行
//
// 环境变量（启动时覆盖 apiConfig，也可用 config 命令修改）:
//   XQ_ENDPOINT  XQ_KEY  XQ_MODEL  XQ_THINKING(off/low/high)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import util from 'node:util';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const STORE_FILE = path.join(__dir, '.xq_localstore.json');

// ---------- 浏览器环境桩（必须先于游戏模块 import） ----------
const ctx2d = () => new Proxy({}, { get(t,k){ if(!(k in t)) t[k]=()=>{}; return t[k]; }, set(t,k,v){ t[k]=v; return true; } });
const el = () => ({ style:{}, dataset:{}, value:'', textContent:'', innerHTML:'', scrollTop:0, scrollHeight:0,
  width:0, height:0, checked:false, classList:{add(){},remove(){},toggle(){}}, addEventListener(){}, appendChild(){},
  querySelector(){ return el(); }, querySelectorAll(){ return []; },
  getBoundingClientRect(){ return {left:0,top:0,width:100,height:100}; }, getContext(){ return ctx2d(); } });
const els = new Map();
globalThis.document = {
  body: el(), head: el(),
  getElementById(id){ if(!els.has(id)) els.set(id, el()); return els.get(id); },
  createElement(){ return el(); }, addEventListener(){}, querySelectorAll(){ return []; }
};
globalThis.window = globalThis;
globalThis.innerWidth = 1200; globalThis.innerHeight = 900;
globalThis.addEventListener = () => {};
globalThis.alert = (m) => console.log('[alert]', m);
// localStorage 用本地 JSON 文件持久化（与浏览器体验一致：改过的 config 会保留）
const store = fs.existsSync(STORE_FILE) ? JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8')) : {};
globalThis.localStorage = {
  getItem(k){ return k in store ? store[k] : null; },
  setItem(k, v){ store[k] = String(v); try { fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2)); } catch(e) {} },
  removeItem(k){ delete store[k]; }
};
const realFetch = globalThis.fetch;   // Node 自带 fetch，可直连真实 API

// ---------- 加载游戏模块（触发 init） ----------
await import('../src/main.js');   // 触发 init()（绘制/日志用桩），副作用模块自动完成接线
const S = await import('../src/state.js');
const B = await import('../src/board.js');
const R = await import('../src/rules.js');
const M = await import('../src/moves.js');
const P = await import('../src/prompts.js');
const DBG = await import('../src/debug.js');
const AM = await import('../src/ai-move.js');
const GF = await import('../src/game-flow.js');
const CTRL = await import('../src/controls.js');
const CHAT = await import('../src/chat.js');

// 环境变量覆盖配置
const env = {
  endpoint: process.env.XQ_ENDPOINT, key: process.env.XQ_KEY,
  model: process.env.XQ_MODEL, thinking: process.env.XQ_THINKING
};
if (env.endpoint) S.state.apiConfig.endpoint = env.endpoint;
if (env.key) S.state.apiConfig.key = env.key;
if (env.model) S.state.apiConfig.model = env.model;
if (env.thinking) S.state.apiConfig.thinkingMode = env.thinking;

const other = s => s === 'red' ? 'black' : 'red';
const sideName = s => s === 'red' ? '红方' : '黑方';
const fmtMove = m => B.moveToStr(m.fromRow, m.fromCol, m.toRow, m.toCol);
const out = (...a) => console.log(...a);

// ---------- 命令实现 ----------
const CMDS = {};

CMDS.help = () => {
  out(`可用命令：
  help                              本帮助
  init                              重置棋盘（不开始对局）
  start <red|black>                 开始对局（您执红/黑，轮到红方；不会自动走AI）
  board                             打印 ASCII 棋盘 + FEN + 回合/状态
  moves [side]                      列出合法走法（编号. 记谱 (坐标)[吃/将]）
  play <表达式>                     按当前回合走子；支持 记谱/坐标/JSON（如 play 炮二平五 / play b2e2）
  mock <json>                       模拟"模型回复"并跑主模式解析（不联网），如 mock {"move":"b7b0"}
  ask <main|number>                 用真实 API 走当前回合（主模式/编号模式）
  turn                              执行一次完整 AI 回合（真实 API；需 start 且轮到AI）
  chat <文本>                       用真实 API 发一条聊天，显示回复与[INTENT]应用结果
  events [n]                        查看最近 n 条调试事件（n 默认 20）
  config                            显示当前 API 配置
  config <key> <value>              修改配置（如 config thinkingMode off / config engineGuard false）
  recent                             最近走法与状态
  js <表达式>                       在游戏上下文中执行任意表达式并打印结果（高级调试）
  exit / quit                       退出`);
};

CMDS.init = () => {
  B.initBoard();
  S.state.boardFlipped = false;
  S.state.gameStarted = false; S.state.gameOver = false;
  S.state.currentTurn = 'red'; S.state.selectedPos = null; S.state.legalMovesForSelected = [];
  S.state.moveHistory = []; S.state.chatHistory = []; S.state.lastMove = null; S.state.isAiThinking = false;
  S.state.aiMind = { mercy: 0, risk: 0, mood: '平静' };
  out('棋盘已重置');
};

CMDS.start = (side) => {
  if (side !== 'red' && side !== 'black') return out('用法: start <red|black>');
  S.state.userSide = side;
  S.state.aiSide = other(side);
  S.state.boardFlipped = (side === 'black');
  B.initBoard();
  S.state.gameStarted = true; S.state.gameOver = false;
  S.state.currentTurn = 'red'; S.state.selectedPos = null; S.state.legalMovesForSelected = [];
  S.state.moveHistory = []; S.state.chatHistory = []; S.state.lastMove = null; S.state.isAiThinking = false;
  S.state.aiMind = { mercy: 0, risk: 0, mood: '平静' };
  out(`对局开始：您执${sideName(side)}，AI 执${sideName(S.state.aiSide)}，红方先手（用 play 走棋，turn 让AI走）`);
};

CMDS.board = () => {
  out(B.boardToAscii());
  out('FEN:', B.boardToFEN());
  out(`回合: ${sideName(S.state.currentTurn)} | 我方: ${sideName(S.state.userSide)} | AI: ${sideName(S.state.aiSide)}`,
      '| 状态:', S.state.gameOver ? '已结束' : (S.state.gameStarted ? '进行中' : '未开始'),
      '| lastMove:', S.state.lastMove ? fmtMove(S.state.lastMove) : '-');
};

CMDS.moves = (side) => {
  const s = side || S.state.currentTurn;
  const moves = R.getAllLegalMoves(S.state.board, s);
  if (!moves.length) return out(`[${sideName(s)}] 无合法走法`);
  out(`[${sideName(s)}] 合法走法共 ${moves.length} 步：`);
  const opp = other(s);
  moves.forEach((m, i) => {
    const cn = M.moveToChinese(m.fromRow, m.fromCol, m.toRow, m.toCol) || '';
    const coord = B.moveToStr(m.fromRow, m.fromCol, m.toRow, m.toCol);
    const captured = S.state.board[m.toRow][m.toCol];
    let extra = captured !== '.' ? ` [吃${S.state.board[m.toRow][m.toCol]}]` : '';
    const nb = R.cloneBoard(S.state.board);
    nb[m.toRow][m.toCol] = nb[m.fromRow][m.fromCol]; nb[m.fromRow][m.fromCol] = '.';
    if (R.isInCheck(nb, opp)) extra += ' [将军]';
    out(`  ${i+1}. ${cn} (${coord})${extra}`);
  });
};

CMDS.play = (expr) => {
  if (!expr) return out('用法: play <表达式>');
  const side = S.state.currentTurn;
  const cands = M.parseMoveCandidates(expr, side);
  if (!cands.length) return out(`未识别出任何走法（当前回合:${sideName(side)}，支持 记谱/坐标/JSON）`);
  const move = cands.find(c => R.isValidMove(S.state.board, c.fromRow, c.fromCol, c.toRow, c.toCol, side));
  if (!move) {
    for (const c of cands.slice(0, 8)) {
      out(`  ✗ ${B.moveToStr(c.fromRow, c.fromCol, c.toRow, c.toCol)}: ${P.explainIllegal(c.fromRow, c.fromCol, c.toRow, c.toCol, side)}`);
    }
    return out('以上候选均非法');
  }
  const cn = M.moveToChinese(move.fromRow, move.fromCol, move.toRow, move.toCol); // 落子前计算（与原版 executeMove 顺序一致）
  M.executeMove(move.fromRow, move.fromCol, move.toRow, move.toCol);
  S.state.lastMove = { fromRow: move.fromRow, fromCol: move.fromCol, toRow: move.toRow, toCol: move.toCol };
  S.state.currentTurn = other(side);
  out(`✓ ${sideName(side)} ${cn || ''} (${B.moveToStr(move.fromRow, move.fromCol, move.toRow, move.toCol)}) → 轮到 ${sideName(S.state.currentTurn)}`);
};

CMDS.mock = async (json) => {
  if (!json) return out('用法: mock <json>，如 mock {"move":"b7b0"}');
  const side = S.state.currentTurn;
  globalThis.fetch = async () => ({
    ok: true, status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: json }, finish_reason: 'stop' }] })
  });
  try {
    const r = await AM.askForMove(side);
    out(r ? `✓ 模拟解析成功: ${fmtMove(r.move)} spirit=${r.spirit}` : '✗ 主模式未采纳（见事件流 events）');
  } finally {
    globalThis.fetch = realFetch;
  }
};

CMDS.ask = async (mode) => {
  const side = S.state.currentTurn;
  if (!S.state.apiConfig.endpoint.trim() || !S.state.apiConfig.model.trim()) {
    return out('API 未配置：请用 config 设置或环境变量 XQ_ENDPOINT/XQ_KEY/XQ_MODEL');
  }
  if (!S.state.gameStarted) return out('先 start <side> 开始对局');
  out(`[API 真实请求] 模式=${mode || 'main'} 回合=${sideName(side)} 模型=${S.state.apiConfig.model}`);
  const r = (mode === 'number')
    ? await AM.askByNumber(side)
    : (mode === 'main' ? await AM.askForMove(side) : await AM.aiMoveWithApi());
  if (r) { out(`✓ 得到走法: ${fmtMove(r.move)} spirit=${r.spirit}`); }
  else out('✗ 未得到走法（查看 events 与上方 [API] 日志）');
};

CMDS.turn = async () => {
  if (!S.state.gameStarted) return out('先 start <side> 开始对局');
  if (S.state.currentTurn !== S.state.aiSide) return out(`当前回合是${sideName(S.state.currentTurn)}；先 play 让玩家走子，或 start 后直接 turn`);
  await GF.aiTurn();
  out('AI 回合结束 → 轮到', sideName(S.state.currentTurn));
};

CMDS.chat = async (text) => {
  if (!text) return out('用法: chat <文本>');
  if (!S.state.apiConfig.endpoint.trim() || !S.state.apiConfig.model.trim()) return out('API 未配置');
  try {
    const raw = await CHAT.sendChatToAi(text);
    const intent = CHAT.extractIntent(raw);
    const reply = raw.replace(/\[INTENT\][\s\S]*$/i, '').trim();
    if (intent) { CHAT.applyIntent(intent); out('  [INTENT] 已应用:', JSON.stringify(intent), '→ 当前心智 mercy/risk/mood =', JSON.stringify(S.state.aiMind)); }
    out('AI 回复:', reply || '(空)');
  } catch (e) { out('聊天失败:', e.message); }
};

CMDS.events = (n) => {
  const evs = DBG.getEvents().slice(-(parseInt(n) || 20));
  if (!evs.length) return out('（暂无事件；跑过 ask/turn/mock 后有内容）');
  evs.forEach(e => out(`[${new Date(e.t).toLocaleTimeString('zh-CN', { hour12: false })}] ${e.kind.toUpperCase()} ${e.summary || ''}`));
};

CMDS.config = (k, v) => {
  if (!k) return out(JSON.stringify(S.state.apiConfig, null, 2));
  if (v === undefined) return out(Object.keys(S.state.apiConfig).join(', '));
  const old = S.state.apiConfig[k];
  let nv = v;
  if (['forceMove','numberMode','engineGuard'].includes(k)) nv = v !== 'false';
  else if (!isNaN(Number(v)) && ['temperature','maxTokens','moveMaxTokens'].includes(k)) nv = Number(v);
  S.state.apiConfig[k] = nv;
  // 持久化到 tools/.xq_localstore.json（600 权限），与浏览器"保存"按钮行为一致
  try {
    localStorage.setItem('xiangqi_api_config_v11', JSON.stringify(S.state.apiConfig));
    fs.chmodSync(STORE_FILE, 0o600);
    out(`config ${k}: ${old} → ${nv}（已保存到 ${path.relative(process.cwd(), STORE_FILE)}，注意该文件已被 .gitignore 忽略）`);
  } catch (e) { out(`config ${k}: ${old} → ${nv}（保存失败: ${e.message}）`); }
};

CMDS.recent = () => {
  out('最近走法:', S.state.moveHistory.slice(-6).join(' | ') || '(无)');
  out('最近聊天:', S.state.chatHistory.slice(-4).map(m => `${m.role}: ${String(m.content).slice(0, 50)}`).join('\n') || '(无)');
};

CMDS.js = (...args) => {
  const f = new Function('S','B','R','M','P','DBG','AM','GF','CTRL','CHAT', `return (${args.join(' ')});`);
  const r = f(S.state && S, B, R, M, P, DBG, AM, GF, CTRL, CHAT);
  out(util.inspect(r, { depth: 6, colors: process.stdout.isTTY }));
};

CMDS.exit = CMDS.quit = () => { process.exit(0); };

async function run(line) {
  const t = line.trim();
  if (!t) return;
  const [cmd, ...rest] = t.split(/\s+/);
  const fn = CMDS[cmd];
  if (!fn) { out(`未知命令: ${cmd}（help 查看帮助）`); return; }
  try { await fn(...rest); } catch (e) { out('✗ 命令错误:', e.message); }
}

// ---------- 启动 ----------
out(`象棋 CLI 调试器
  API: ${S.state.apiConfig.endpoint} | model=${S.state.apiConfig.model} | key=${S.state.apiConfig.key ? '已配置' : '未配置'} | 思考模式=${S.state.apiConfig.thinkingMode}
  提示: 单次模式 node tools/cli.mjs <命令>；交互模式直接输入命令；help 查看全部命令`);
const args = process.argv.slice(2);
if (args.length) {
  await run(args.join(' '));
  process.exit(0);
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'xq> ' });
  rl.prompt();
  // 串行执行每条命令（避免管道输入时 mock/ask 等异步命令被后续 exit 抢先终止）
  let chain = Promise.resolve();
  rl.on('line', (line) => {
    chain = chain.then(async () => {
      if (['exit', 'quit'].includes(line.trim())) process.exit(0);
      await run(line);
      if (!rl.closed) rl.prompt();
    });
  });
  rl.on('close', () => {});   // stdin EOF 时静默收尾（不再补 prompt）
}
