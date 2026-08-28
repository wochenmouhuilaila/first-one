import { state, log, shortStr } from './state.js';
import { logEvent } from './debug.js';


// ==================== API 调用核心（DeepSeek V4 思考模型适配） ====================
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

// 从 400 错误文本中提取被拒绝的参数名（如 "Invalid parameter: thinking"）
function extractRejectedKey(errText) {
    if (!errText) return null;
    const known = ['thinking_budget','reasoning_effort','response_format','thinking','temperature','max_tokens','max_completion_tokens','top_p'];
    const low = String(errText).toLowerCase();
    for (const k of known) if (low.includes(k)) return k;
    const q = String(errText).match(/["“'']([a-z_]{3,40})["”'']/i);
    return q ? q[1] : null;
}

// 构建参数变体：缓存允许集 -> 全量 -> 逐步剥离 -> 最简。
// 用于兼容不支持 thinking / response_format 等扩展参数的接口。
// 注：DeepSeek V4 已不再需要 max_tokens（上限由服务端控制），请求体不再携带。
function buildParamVariants(model, messages, opt) {
    const base = { model, messages };
    const rejected = state.apiRejected ? new Set(state.apiRejected) : new Set();
    const extra = []; // [key, value] 列表，保持顺序
    if (opt.thinking === 'off') {
        extra.push(['thinking', { type: 'disabled' }]);
    } else if (opt.thinking === 'low' || opt.thinking === 'high') {
        extra.push(['thinking', { type: 'enabled' }]);
        extra.push(['reasoning_effort', opt.thinking]);
        if (opt.thinkingBudget > 0) extra.push(['thinking_budget', opt.thinkingBudget]);
    }
    if (opt.jsonMode) extra.push(['response_format', { type: 'json_object' }]);
    if (opt.temperature !== undefined && opt.temperature !== null) extra.push(['temperature', opt.temperature]);

    // 过滤已知被拒绝的参数
    const usable = extra.filter(([k]) => !rejected.has(k));
    const variants = [];
    const allowed = state.apiCompat ? new Set(Object.keys(state.apiCompat)) : null;
    const makeBody = (keys) => {
        const b = Object.assign({}, base);
        for (const [k,v] of usable) if (keys.has(k)) b[k] = v;
        return b;
    };
    const allKeys = new Set(usable.map(e=>e[0]));
    if (allowed) {
        const cachedKeys = new Set([...allowed].filter(k => allKeys.has(k)));
        variants.push(makeBody(cachedKeys));
    }
    variants.push(makeBody(allKeys));
    for (let drop=0; drop<usable.length; drop++) {
        const kept = new Set(usable.slice(0, usable.length-drop).map(e=>e[0]));
        variants.push(makeBody(kept));
    }
    variants.push(makeBody(new Set()));
    const seen=new Set(), dedup=[];
    for (const b of variants) {
        const key=JSON.stringify(b);
        if(!seen.has(key)){ seen.add(key); dedup.push(b); }
    }
    return dedup;
}

function looksLikeParamError(status, errText) {
    if (!(status===400||status===404||status===422)) return false;
    if (/model/i.test(errText) && /(not exist|not found|does not exist|不存在|invalid model|unknown model)/i.test(errText)) {
        return 'MODEL'; // 模型名错误：剥离参数也无用
    }
    if (/unknown|invalid|unrecognized|unexpected|unsupported|not support|extra|additional|参数|不认识|不支持/i.test(errText)) return 'PARAM';
    return 'OTHER';
}

function extractResponse(data) {
    const choice = data && data.choices && data.choices[0];
    let content='', reasoning='';
    if (choice) {
        const msg = choice.message || {};
        let c = msg.content !== undefined ? msg.content : choice.text;
        if (Array.isArray(c)) c = c.map(part => part && typeof part==='object' ? (part.text||'') : String(part)).join('');
        content = (c === null || c === undefined) ? '' : String(c);
        reasoning = msg.reasoning_content || '';
        if (!reasoning && typeof msg.thinking === 'string') reasoning = msg.thinking;
        if (!reasoning && msg.thinking && typeof msg.thinking === 'object' && msg.thinking.text) reasoning = msg.thinking.text;
    }
    if (!content && data && typeof data.output_text === 'string') content = data.output_text;
    if (!content && data && typeof data.output === 'string') content = data.output;
    if (!content && data && data.result && typeof data.result === 'string') content = data.result;
    return {
        content: String(content||'').trim(),
        reasoning: String(reasoning||'').trim(),
        finishReason: choice ? choice.finish_reason : undefined,
        usage: data && data.usage ? data.usage : null
    };
}

/**
 * 统一 API 调用入口。
 * options: {
 *   maxTokens, temperature, jsonMode, thinking('off'|'low'|'high'|'default'),
 *   thinkingBudget, timeout(毫秒)
 * }
 * 返回 { content, reasoning, finishReason, usage }
 */
async function callApiInner(messages, options, rec) {
    const endpoint = state.apiConfig.endpoint.trim();
    const key = state.apiConfig.key.trim();
    const model = state.apiConfig.model.trim();
    if (!endpoint || !model) throw new Error('API未配置（endpoint或model为空）');

    const opt = {
        maxTokens: options.maxTokens || state.apiConfig.maxTokens || 300,
        temperature: options.temperature,
        jsonMode: !!options.jsonMode,
        thinking: options.thinking || 'default',
        thinkingBudget: options.thinkingBudget || 0,
        timeout: options.timeout || 90000
    };
    rec.data = {
        endpoint, model, hasKey: !!key,
        temperature: opt.temperature,
        jsonMode: opt.jsonMode, thinking: opt.thinking, timeout: opt.timeout,
        variants: buildParamVariants(model, messages, opt).map(b => Object.keys(b).filter(k => k !== 'model' && k !== 'messages')),
        attempts: []
    };
    const variants = buildParamVariants(model, messages, opt);
    let lastErr = null;
    let rateLimitedOnce = false;

    for (const body of variants) {
        const keys = Object.keys(body).filter(k => k !== 'model' && k !== 'messages');
        log(`[API] 请求 第${rec.data.attempts.length + 1}/${variants.length} 个参数变体（${keys.join(',') || '无额外参数'} → ${endpoint}）`);
        const t0 = Date.now();
        let gotHeaders = false;
        // 心跳覆盖整个尝试（响应头 + 响应体），避免"看起来卡死"
        const hb = setInterval(() => log(`…仍在等待${gotHeaders ? '响应体' : '响应头'}（已 ${Math.round((Date.now()-t0)/1000)}s / 超时 ${Math.round(opt.timeout/1000)}s）`), 10000);
        const headers = { 'Content-Type': 'application/json' };
        if (key) headers['Authorization'] = 'Bearer ' + key;
        const controller = new AbortController();
        // 超时覆盖整个尝试：响应体会在 timeout 后同样被 abort，不会无限挂起
        const timer = setTimeout(()=>controller.abort(), opt.timeout);
        try {
            const resp = await fetch(endpoint, {
                method:'POST', headers, body: JSON.stringify(body), signal: controller.signal
            });
            gotHeaders = true;
            log(`[API] 收到响应头 status=${resp.status}（${Date.now()-t0}ms），读取响应体...`);
            const errText = await resp.text();
            clearTimeout(timer);
            clearInterval(hb);
            log(`[API] 响应 第${rec.data.attempts.length + 1}次尝试 status=${resp.status}（${Date.now()-t0}ms）${resp.ok ? '' : ' → ' + shortStr(errText, 120)}`);
            if (!resp.ok) {
                rec.data.attempts.push({ keys: Object.keys(body).filter(k => k !== 'model' && k !== 'messages'), status: resp.status, err: shortStr(errText, 200) });
                if (resp.status===429) {
                    lastErr = new Error('HTTP 429 限流');
                    if (!rateLimitedOnce) {
                        rateLimitedOnce = true;
                        log('遇到限流(429)，等待3秒后重试...');
                        await sleep(3000);
                        try {
                            const resp2 = await fetch(endpoint, { method:'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout ? AbortSignal.timeout(opt.timeout) : undefined });
                            if (resp2.ok) {
                                const data = await resp2.json();
                                return extractResponse(data);
                            }
                        } catch(e2) {}
                    }
                    throw lastErr;
                }
                const kind = looksLikeParamError(resp.status, errText);
                if (kind==='MODEL') throw new Error(`模型不存在或名称错误（HTTP ${resp.status}）：${shortStr(errText,200)}。请核对 API设置中的 Model（官方推荐 deepseek-v4-flash / deepseek-v4-pro）`);
                if (kind==='PARAM' || kind==='OTHER') {
                    if (kind==='PARAM') {
                        const badKey = extractRejectedKey(errText);
                        if (badKey) {
                            state.apiRejected = state.apiRejected || new Set();
                            state.apiRejected.add(badKey);
                            log(`API不支持参数 "${badKey}"，已记住并跳过`);
                        } else {
                            log(`API拒绝当前参数组合(${shortStr(errText,80)})，自动降级参数重试...`);
                        }
                    }
                    lastErr = new Error(`HTTP ${resp.status} ${shortStr(errText,200)}`);
                    continue; // 尝试下一变体
                }
                throw new Error(`HTTP ${resp.status} ${resp.statusText}: ${shortStr(errText,300)}`);
            }
            let data;
            try { data = JSON.parse(errText); } catch(e) { throw new Error('API返回非JSON内容: ' + shortStr(errText,200)); }
            // 成功：更新兼容缓存
            state.apiCompat = {};
            for (const k in body) if (k!=='model' && k!=='messages') state.apiCompat[k]=true;
            const response = extractResponse(data);
            rec.data.status = resp.status;
            rec.data.acceptedKeys = Object.keys(body).filter(k => k !== 'model' && k !== 'messages');
            rec.data.retries = rec.data.attempts.length;
            rec.data.content = response.content;
            rec.data.reasoning = response.reasoning;
            rec.data.finishReason = response.finishReason;
            rec.data.usage = response.usage;
            return response;
        } catch(err) {
            clearTimeout(timer);
            clearInterval(hb);
            if (err.name==='AbortError') throw new Error(`请求超时（${Math.round(opt.timeout/1000)}秒）`);
            if (err.message && (err.message.indexOf('HTTP 429')===0 || err.message.indexOf('限流')>=0)) throw err;
            if (err instanceof TypeError || err.name==='TypeError') throw new Error('网络请求失败（CORS/断网/endpoint不可达）：' + err.message);
            throw err;
        }
    }
    if (lastErr) throw lastErr;
    throw new Error('API调用失败：所有参数组合均被拒绝');
}

// 统一 API 调用入口（带调试记录）。
// options: {
//   temperature, jsonMode, thinking('off'|'low'|'high'|'default'),
//   thinkingBudget, timeout(毫秒)
// }
// 注：DeepSeek V4 已不再需要 max_tokens（服务端控制长度上限），故请求体不再携带。
// 返回 { content, reasoning, finishReason, usage }
export async function callApi(messages, options = {}) {
    const rec = { kind: 'api', summary: '', data: {} };
    const started = Date.now();
    try {
        const r = await callApiInner(messages, options, rec);
        rec.data.ok = true;
        rec.data.tookMs = Date.now() - started;
        rec.summary = `✓ API ${rec.data.retries || 0}次降级 ${rec.data.tookMs}ms · ${shortStr(r.content, 40)}`;
        logEvent(rec);
        return r;
    } catch (err) {
        rec.data.ok = false;
        rec.data.tookMs = Date.now() - started;
        rec.data.error = err.message;
        rec.summary = `✗ API ${err.message.slice(0, 60)}`;
        logEvent(rec);
        throw err;
    }
}

