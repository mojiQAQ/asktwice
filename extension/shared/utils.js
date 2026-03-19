/**
 * Ask Twice — 工具函数
 */
const AskTwiceUtils = {
  /**
   * i18n 快捷方法
   * @param {string} key - messages.json 中的 key
   * @param {string|string[]} [substitutions] - 占位符替换值
   * @returns {string} 翻译后的字符串
   */
  i18n(key, substitutions) {
    if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
      return chrome.i18n.getMessage(key, substitutions) || key;
    }
    return key;
  },

  /**
   * 根据分数获取评分等级（含翻译后的 label）
   */
  getScoreLevel(score) {
    const levels = ASKTWICE.SCORE_LEVELS;
    let level;
    if (score >= levels.HIGH.min) level = levels.HIGH;
    else if (score >= levels.NEEDS_VERIFICATION.min) level = levels.NEEDS_VERIFICATION;
    else if (score >= levels.LOW.min) level = levels.LOW;
    else level = levels.UNRELIABLE;
    return { ...level, label: this.i18n(level.labelKey) };
  },

  /**
   * 生成唯一 ID
   */
  generateId() {
    return `at-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  },

  /**
   * 简单文本 hash（用于缓存 key）
   */
  hashText(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `h${Math.abs(hash).toString(36)}`;
  },

  /**
   * 截断文本
   */
  truncate(text, maxLen = 80) {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '...';
  },

  /**
   * 防抖
   */
  debounce(fn, delay = 500) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  /**
   * 等待元素出现
   */
  waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element ${selector} not found within ${timeout}ms`));
      }, timeout);
    });
  },

  /**
   * 安全的 DOM 创建
   */
  createElement(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([key, val]) => {
      if (key === 'className') el.className = val;
      else if (key === 'textContent') el.textContent = val;
      else if (key === 'innerHTML') el.innerHTML = val;
      else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), val);
      else el.setAttribute(key, val);
    });
    children.forEach(child => {
      if (typeof child === 'string') el.appendChild(document.createTextNode(child));
      else if (child) el.appendChild(child);
    });
    return el;
  },
};
