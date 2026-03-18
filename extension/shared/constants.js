/**
 * Ask Twice — 常量定义
 */
const ASKTWICE = {
  // API 配置
  API_BASE_URL: 'http://localhost:8000',
  
  // 评分等级
  SCORE_LEVELS: {
    HIGH:              { min: 80, label: '高可信', color: '#10B981', emoji: '🟢' },
    NEEDS_VERIFICATION:{ min: 60, label: '待验证', color: '#F59E0B', emoji: '🟡' },
    LOW:               { min: 40, label: '低可信', color: '#F97316', emoji: '🟠' },
    UNRELIABLE:        { min: 0,  label: '不可信', color: '#EF4444', emoji: '🔴' },
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

  // 免费版每日限额
  FREE_DAILY_LIMIT: 10,

  // 缓存过期时间（毫秒）
  CACHE_TTL: 30 * 60 * 1000, // 30 分钟

  // UI 相关
  UI: {
    FLOAT_BUTTON_SIZE: 36,
    SIDEPANEL_WIDTH: 380,
    ANIMATION_DURATION: 300,
  },

  // CSS 类名前缀（避免与页面冲突）
  CSS_PREFIX: 'asktwice',
};
