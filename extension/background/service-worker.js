/**
 * Ask Twice — Background Service Worker
 * 
 * 职责：
 * 1. 接收 Content Script 的验证请求
 * 2. 检查缓存 / 用量限额
 * 3. 调用后端 API
 * 4. 缓存结果并回传
 */

// Service Worker 消息类型（独立定义，不依赖 Content Script）
const MSG = {
  VERIFY_REQUEST: 'VERIFY_REQUEST',
  VERIFY_RESULT: 'VERIFY_RESULT',
  VERIFY_ERROR: 'VERIFY_ERROR',
  GET_USAGE: 'GET_USAGE',
  USAGE_RESULT: 'USAGE_RESULT',
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MSG.VERIFY_REQUEST) {
    handleVerifyRequest(message.payload)
      .then(result => sendResponse({ type: MSG.VERIFY_RESULT, payload: { result } }))
      .catch(err => sendResponse({ type: MSG.VERIFY_ERROR, payload: { error: err.message } }));
    return true; // 异步 sendResponse
  }

  if (message.type === MSG.GET_USAGE) {
    handleGetUsage()
      .then(usage => sendResponse({ type: MSG.USAGE_RESULT, payload: usage }))
      .catch(err => sendResponse({ type: MSG.VERIFY_ERROR, payload: { error: err.message } }));
    return true;
  }
});

// ═══════ 验证请求处理 ═══════

async function handleVerifyRequest({ answerId, text, platform, selectedText, conversation }) {
  console.log(`[Ask Twice SW] 收到验证请求: ${answerId}`);

  // 用选中文字做缓存 key（这样同一段文字不会重复调 API）
  const cacheKey = hashTextSW(selectedText || text);

  // 1. 检查缓存
  const cached = await getCachedResultSW(cacheKey);
  if (cached) {
    // 检查缓存数据是否包含新版 source_results 字段
    const hasSourceResults = cached.claims?.some(c => c.source_results?.length > 0);
    if (hasSourceResults) {
      console.log(`[Ask Twice SW] 命中缓存: ${cacheKey}`);
      cached.meta = cached.meta || {};
      cached.meta.cached = true;
      return cached;
    } else {
      console.log(`[Ask Twice SW] 缓存数据为旧格式（无 source_results），重新请求`);
    }
  }

  // 2. 检查用量限额
  const usage = await getDailyUsageSW();
  if (usage >= ASKTWICE_CONFIG.FREE_DAILY_LIMIT) {
    throw new Error(chrome.i18n.getMessage('dailyLimitReached') || 'Daily free limit reached. Upgrade to Pro for unlimited verifications.');
  }

  // 3. 调用后端 API
  const result = await callVerifyAPI(text, platform, selectedText, conversation);

  // 4. 缓存结果（同时用选中文字 key 和完整文本 key）
  await setCachedResultSW(cacheKey, result);
  const fullTextKey = hashTextSW(text);
  if (fullTextKey !== cacheKey) {
    await setCachedResultSW(fullTextKey, result);
  }

  // 5. 增加用量计数（只有真正调了 API 才计数）
  await incrementDailyUsageSW();

  return result;
}

// ═══════ 后端 API 调用 ═══════

async function callVerifyAPI(text, platform, selectedText, conversation) {
  // 读取用户自定义配置
  let userBraveKey = '';
  let userLlmConfigs = [];
  try {
    const data = await chrome.storage.sync.get('asktwiceSettings');
    const cfg = data.asktwiceSettings || {};
    userBraveKey = cfg.braveApiKey || '';
    userLlmConfigs = (cfg.llmConfigs || []).filter(c => c.api_key && c.model);
  } catch (e) {
    // 忽略
  }

  const response = await fetch(`${ASKTWICE_CONFIG.API_BASE_URL}/api/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      selected_text: selectedText || '',
      conversation: conversation || [],
      platform,
      language: chrome.i18n.getUILanguage().startsWith('zh') ? 'zh' : 'en',
      depth: 'standard',
      features: ['source_verify', 'conflict_detect', 'cross_verify'],
      brave_api_key: userBraveKey,
      llm_configs: userLlmConfigs,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'Unknown error');
    throw new Error(`API error (${response.status}): ${errText}`);
  }

  return response.json();
}

// ═══════ 用量管理 ═══════

async function handleGetUsage() {
  const used = await getDailyUsageSW();
  return {
    used,
    limit: ASKTWICE_CONFIG.FREE_DAILY_LIMIT,
    remaining: Math.max(0, ASKTWICE_CONFIG.FREE_DAILY_LIMIT - used),
  };
}

async function getDailyUsageSW() {
  const today = new Date().toISOString().slice(0, 10);
  const data = await chrome.storage.local.get('dailyUsage');
  const usage = data.dailyUsage || {};
  return usage[today] || 0;
}

async function incrementDailyUsageSW() {
  const today = new Date().toISOString().slice(0, 10);
  const data = await chrome.storage.local.get('dailyUsage');
  const usage = data.dailyUsage || {};
  usage[today] = (usage[today] || 0) + 1;
  await chrome.storage.local.set({ dailyUsage: usage });
}

// ═══════ 缓存管理 ═══════

async function getCachedResultSW(textHash) {
  const data = await chrome.storage.local.get('verifyCache');
  const cache = data.verifyCache || {};
  const entry = cache[textHash];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ASKTWICE_CONFIG.CACHE_TTL) {
    delete cache[textHash];
    await chrome.storage.local.set({ verifyCache: cache });
    return null;
  }
  return entry.result;
}

async function setCachedResultSW(textHash, result) {
  const data = await chrome.storage.local.get('verifyCache');
  const cache = data.verifyCache || {};
  cache[textHash] = { result, timestamp: Date.now() };
  // 限制最多 100 条
  const keys = Object.keys(cache);
  if (keys.length > 100) {
    const sorted = keys.sort((a, b) => cache[a].timestamp - cache[b].timestamp);
    sorted.slice(0, keys.length - 100).forEach(k => delete cache[k]);
  }
  await chrome.storage.local.set({ verifyCache: cache });
}

// ═══════ 工具函数（Service Worker 不共享 Content Script 的全局变量）═══════

function hashTextSW(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `h${Math.abs(hash).toString(36)}`;
}

// Service Worker 配置（从 config.js 动态加载，回退到默认值）
let ASKTWICE_CONFIG = {
  API_BASE_URL: 'http://localhost:8001',
  FREE_DAILY_LIMIT: 10,
  CACHE_TTL: 0,
};

// 启动时从 config.js 加载配置
(async () => {
  try {
    const url = chrome.runtime.getURL('config.js');
    const text = await (await fetch(url)).text();
    // 提取 ASKTWICE_ENV 对象中的值
    const apiMatch = text.match(/API_BASE_URL:\s*['"]([^'"]+)['"]/);
    const limitMatch = text.match(/FREE_DAILY_LIMIT:\s*(\d+)/);
    const cacheMatch = text.match(/CACHE_TTL:\s*(.+?),/);
    if (apiMatch) ASKTWICE_CONFIG.API_BASE_URL = apiMatch[1];
    if (limitMatch) ASKTWICE_CONFIG.FREE_DAILY_LIMIT = parseInt(limitMatch[1]);
    if (cacheMatch) {
      try { ASKTWICE_CONFIG.CACHE_TTL = Number(cacheMatch[1]) || 0; } catch(e) {}
    }
    console.log('[Ask Twice] Config loaded:', ASKTWICE_CONFIG.API_BASE_URL, 'TTL:', ASKTWICE_CONFIG.CACHE_TTL);
  } catch (e) {
    console.warn('[Ask Twice] Config load failed, using defaults:', e.message);
  }
})();

// ═══════ 安装事件 ═══════

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Ask Twice] Extension installed/updated — clearing old cache');
  await chrome.storage.local.remove('verifyCache');
});

