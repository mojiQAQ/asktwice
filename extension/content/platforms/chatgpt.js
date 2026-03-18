/**
 * Ask Twice — ChatGPT 平台适配器
 */
const ChatGPTAdapter = {
  /**
   * 从 DOM 元素中提取 AI 回答文本
   */
  extractText(answerEl) {
    const config = PlatformConfigs.chatgpt;
    const selectors = config.selectors.answerText.split(', ');
    
    for (const sel of selectors) {
      const textEl = answerEl.querySelector(sel);
      if (textEl) return textEl.innerText.trim();
    }
    
    return answerEl.innerText.trim();
  },

  /**
   * 获取回答元素的唯一标识
   */
  getAnswerId(answerEl) {
    // ChatGPT 的消息通常有 data-message-id
    const messageWrapper = answerEl.closest('[data-message-id]');
    if (messageWrapper) return messageWrapper.getAttribute('data-message-id');
    return `chatgpt-${AskTwiceUtils.generateId()}`;
  },

  /**
   * 判断回答是否已完成
   */
  isAnswerComplete(answerEl) {
    // ChatGPT 在流式输出时会有 streaming 相关的 class 或 result-streaming
    const hasStreaming = answerEl.querySelector('.result-streaming, .streaming');
    return !hasStreaming;
  },
};
