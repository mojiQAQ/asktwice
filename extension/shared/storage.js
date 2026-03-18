/**
 * Ask Twice — Chrome Storage 封装
 */
const AskTwiceStorage = {
  /**
   * 获取今日已用验证次数
   */
  async getDailyUsage() {
    const today = new Date().toISOString().slice(0, 10);
    const data = await chrome.storage.local.get('dailyUsage');
    const usage = data.dailyUsage || {};
    return usage[today] || 0;
  },

  /**
   * 增加今日验证次数
   */
  async incrementDailyUsage() {
    const today = new Date().toISOString().slice(0, 10);
    const data = await chrome.storage.local.get('dailyUsage');
    const usage = data.dailyUsage || {};
    usage[today] = (usage[today] || 0) + 1;
    // 清理旧数据，只保留最近 7 天
    Object.keys(usage).forEach(date => {
      if (date < new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)) {
        delete usage[date];
      }
    });
    await chrome.storage.local.set({ dailyUsage: usage });
    return usage[today];
  },

  /**
   * 获取缓存的验证结果
   */
  async getCachedResult(textHash) {
    const data = await chrome.storage.local.get('verifyCache');
    const cache = data.verifyCache || {};
    const entry = cache[textHash];
    if (!entry) return null;
    // 检查是否过期
    if (Date.now() - entry.timestamp > ASKTWICE.CACHE_TTL) {
      delete cache[textHash];
      await chrome.storage.local.set({ verifyCache: cache });
      return null;
    }
    return entry.result;
  },

  /**
   * 缓存验证结果
   */
  async setCachedResult(textHash, result) {
    const data = await chrome.storage.local.get('verifyCache');
    const cache = data.verifyCache || {};
    cache[textHash] = { result, timestamp: Date.now() };
    // 限制缓存数量，最多 100 条
    const keys = Object.keys(cache);
    if (keys.length > 100) {
      const oldest = keys.sort((a, b) => cache[a].timestamp - cache[b].timestamp);
      oldest.slice(0, keys.length - 100).forEach(k => delete cache[k]);
    }
    await chrome.storage.local.set({ verifyCache: cache });
  },

  /**
   * 获取用户设置
   */
  async getSettings() {
    const data = await chrome.storage.sync.get('settings');
    return {
      autoVerify: false,
      depth: 'standard',
      language: 'auto',
      ...data.settings,
    };
  },

  /**
   * 更新用户设置
   */
  async updateSettings(updates) {
    const current = await this.getSettings();
    const merged = { ...current, ...updates };
    await chrome.storage.sync.set({ settings: merged });
    return merged;
  },
};
