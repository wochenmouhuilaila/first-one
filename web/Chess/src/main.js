// ==================== 初始化 ====================
function init(){
    initBoard(); boardFlipped=false; resizeCanvas(); drawBoard(); updateStatus();
    log('欢迎！本版本已适配 DeepSeek V4 思考型模型（deepseek-v4-flash）。');
    log('走棋默认关闭思考模式以保证稳定；如返回空内容，请检查思考模式与走棋MaxTokens设置。');
    log('聊天室AI知道自己执红/执黑，并知晓当前局面与上一步走法。');
}
init();
