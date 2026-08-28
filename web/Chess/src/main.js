// ==================== 入口 ====================
// 侧效应模块：注册各自的 DOM 事件（角色由它们自己完成）
import './interactions.js';   // 棋盘点击/触摸、摆棋作弊
import './controls.js';       // 开始/重开/API设置/快捷键/resize/测试API
import './chat.js';           // 聊天发送

// 功能函数
import { state, loadConfig, log } from './state.js';
import { initBoard } from './board.js';
import { resizeCanvas, drawBoard } from './render.js';
import { updateStatus } from './game-flow.js';

export function init() {
    loadConfig();
    initBoard(); state.boardFlipped = false; resizeCanvas(); drawBoard(); updateStatus();
    log('欢迎！本版本已适配 DeepSeek V4 思考型模型（deepseek-v4-flash）。');
    log('走棋默认关闭思考模式以保证稳定；如返回空内容，请检查思考模式与走棋MaxTokens设置。');
    log('聊天室AI知道自己执红/执黑，并知晓当前局面与上一步走法。');
}
init();
