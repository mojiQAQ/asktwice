/**
 * Ask Twice — 后端 API 调用封装
 */
const AskTwiceAPI = {
  /**
   * 发送验证请求到后端
   */
  async verify(text, platform, options = {}) {
    const { language = (chrome.i18n.getUILanguage().startsWith('zh') ? 'zh' : 'en'), depth = 'standard' } = options;
    
    const body = {
      text,
      platform,
      language,
      depth,
      features: ['source_verify', 'conflict_detect'],
    };

    const response = await fetch(`${ASKTWICE.API_BASE_URL}/api/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this._getAuthHeaders(),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error(chrome.i18n.getMessage('dailyLimitReached') || 'Daily free limit reached');
      }
      throw new Error(`${chrome.i18n.getMessage('requestFailed') || 'Request failed'}: ${response.status}`);
    }

    return response.json();
  },

  /**
   * 查询今日用量
   */
  async getUsage() {
    const response = await fetch(`${ASKTWICE.API_BASE_URL}/api/usage`, {
      headers: this._getAuthHeaders(),
    });
    if (!response.ok) throw new Error(chrome.i18n.getMessage('usageFetchFailed') || 'Failed to fetch usage');
    return response.json();
  },

  /**
   * 获取认证头
   */
  _getAuthHeaders() {
    const token = null; // MVP 阶段暂不需要认证
    if (!token) return {};
    return { 'Authorization': `Bearer ${token}` };
  },
};
