/**
 * Ask Twice — 平台适配配置
 * 
 * 当 AI 平台改版 DOM 时，只需更新此文件中的 selector，
 * 不需要改动任何业务逻辑代码。
 */
const PlatformConfigs = {
  doubao: {
    name: '豆包',
    urlPattern: /doubao\.com/,
    selectors: {
      // 豆包真实 DOM 用 data-testid 属性标识，比 class 哈希稳定
      answerContainer: '[data-testid="receive_message"]',
      answerText: '.flow-markdown-body, [data-testid="message_text_content"]',
      chatContainer: '[data-testid="message-list"], [class*="scrollable-"], main',
      inputBox: 'textarea, [contenteditable="true"]',
    },
    floatButtonAnchor: 'answerContainer',
    floatButtonPosition: 'beforeend',
  },

  chatgpt: {
    name: 'ChatGPT',
    urlPattern: /chatgpt\.com|chat\.openai\.com/,
    selectors: {
      answerContainer: '[data-message-author-role="assistant"]',
      answerText: '.markdown, .prose',
      chatContainer: 'main .flex.flex-col, main',
      inputBox: '#prompt-textarea, textarea',
    },
    floatButtonAnchor: 'answerContainer',
    floatButtonPosition: 'beforeend',
  },
};

/**
 * 根据当前 URL 检测平台
 */
function detectPlatform() {
  const url = window.location.href;
  for (const [key, config] of Object.entries(PlatformConfigs)) {
    if (config.urlPattern.test(url)) {
      return { id: key, ...config };
    }
  }
  return null;
}
