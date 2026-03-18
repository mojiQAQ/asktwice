/**
 * Ask Twice — 豆包（Doubao）平台适配器
 * 
 * 豆包真实 DOM 结构：
 *   - 聊天列表:  div[data-testid="message-list"]
 *   - 机器人消息: div[data-testid="receive_message"]
 *   - 内容容器:  div[data-testid="message_text_content"].flow-markdown-body
 *   - 用户消息:  div[data-testid="send_message"]
 * 
 * class 带哈希后缀（如 scrollable-Se7zNt），不可靠，优先用 data-testid。
 */
const DoubaoAdapter = {

  /**
   * 查找页面上所有 AI 回答元素
   * @param {Element} [searchRoot] - 搜索根元素，默认 document
   */
  findAllAnswers(searchRoot) {
    const root = searchRoot || document;
    const answers = [];

    // 策略1（首选）：用豆包原生 data-testid 属性定位机器人消息
    const receiveMessages = root.querySelectorAll('[data-testid="receive_message"]');
    if (receiveMessages.length > 0) {
      for (const msg of receiveMessages) {
        // 确认内部有 markdown 内容
        const mdContent = msg.querySelector('.flow-markdown-body, [data-testid="message_text_content"]');
        if (!mdContent) continue;
        const text = mdContent.innerText || '';
        if (text.length < 10) continue;
        answers.push(msg);
      }
      if (answers.length > 0) return answers;
    }

    // 策略2：用 flow-markdown-body 类名（如果 data-testid 不存在）
    const flowMd = root.querySelectorAll('.flow-markdown-body');
    if (flowMd.length > 0) {
      for (const md of flowMd) {
        if ((md.innerText || '').length < 10) continue;
        // 尝试向上找到消息容器
        const msgContainer = md.closest('[data-testid="receive_message"]') || md.parentElement;
        if (!answers.includes(msgContainer)) {
          answers.push(msgContainer);
        }
      }
      if (answers.length > 0) return answers;
    }

    // 策略3（兜底）：匹配任何 class 包含 markdown 的容器
    const anyMd = root.querySelectorAll('[class*="markdown"]');
    for (const el of anyMd) {
      const text = el.innerText || '';
      if (text.length < 20) continue;
      const hasRich = el.querySelector('h1, h2, h3, ul, ol, p, strong, pre, code');
      if (!hasRich) continue;
      answers.push(el);
    }

    return answers;
  },

  /**
   * 提取 AI 回答文本
   */
  extractText(answerEl) {
    // 优先从 flow-markdown-body 提取
    const md = answerEl.querySelector('.flow-markdown-body, [data-testid="message_text_content"]');
    if (md) return md.innerText.trim();
    return answerEl.innerText.trim();
  },

  /**
   * 获取回答唯一 ID
   */
  getAnswerId(answerEl) {
    if (answerEl.getAttribute('data-asktwice-id')) {
      return answerEl.getAttribute('data-asktwice-id');
    }
    // 尝试用 data-testid 或其他属性
    const nativeId = answerEl.getAttribute('data-message-id')
                  || answerEl.getAttribute('data-id')
                  || answerEl.id;
    if (nativeId) {
      const id = `doubao-${nativeId}`;
      answerEl.setAttribute('data-asktwice-id', id);
      return id;
    }
    // 兜底用内容 hash
    const text = (answerEl.innerText || '').substring(0, 150);
    const id = `doubao-${AskTwiceUtils.hashText(text)}`;
    answerEl.setAttribute('data-asktwice-id', id);
    return id;
  },

  /**
   * 判断回答是否已完成（非流式输出中）
   */
  isAnswerComplete(answerEl) {
    // 豆包流式输出时会有 loading/typing 动画
    const loading = answerEl.querySelector('[class*="loading"], [class*="cursor"], [class*="typing"], .semi-spin');
    if (loading) return false;
    const text = this.extractText(answerEl);
    return text.length > 20;
  },
};
