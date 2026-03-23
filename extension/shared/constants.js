/**
 * Ask Twice — 常量定义
 */
const ASKTWICE = {
  // API 配置（从 config.js 读取，回退到默认值）
  API_BASE_URL: (typeof ASKTWICE_ENV !== 'undefined' && ASKTWICE_ENV.API_BASE_URL) || 'http://localhost:8001',
  
  // 评分等级（label 为 i18n key，通过 chrome.i18n.getMessage() 翻译）
  SCORE_LEVELS: {
    HIGH:              { min: 80, labelKey: 'highCredibility', color: '#10B981', emoji: '🟢' },
    NEEDS_VERIFICATION:{ min: 60, labelKey: 'needsVerification', color: '#F59E0B', emoji: '🟡' },
    LOW:               { min: 40, labelKey: 'lowCredibility', color: '#F97316', emoji: '🟠' },
    UNRELIABLE:        { min: 0,  labelKey: 'unreliable', color: '#EF4444', emoji: '🔴' },
  },

  // 消息类型（Content Script ↔ Service Worker）
  MSG: {
    VERIFY_REQUEST:  'VERIFY_REQUEST',
    VERIFY_RESULT:   'VERIFY_RESULT',
    VERIFY_LOADING:  'VERIFY_LOADING',
    VERIFY_ERROR:    'VERIFY_ERROR',
    GET_USAGE:       'GET_USAGE',
    USAGE_RESULT:    'USAGE_RESULT',
  },

  // 免费版每日限额（从 config.js 读取）
  FREE_DAILY_LIMIT: (typeof ASKTWICE_ENV !== 'undefined' && ASKTWICE_ENV.FREE_DAILY_LIMIT) || 10,

  // 缓存过期时间（从 config.js 读取）
  CACHE_TTL: (typeof ASKTWICE_ENV !== 'undefined' && ASKTWICE_ENV.CACHE_TTL) || 30 * 60 * 1000,

  // UI 相关
  UI: {
    FLOAT_BUTTON_SIZE: 36,
    SIDEPANEL_WIDTH: 380,
    ANIMATION_DURATION: 300,
  },

  // CSS 类名前缀（避免与页面冲突）
  CSS_PREFIX: 'asktwice',
};
