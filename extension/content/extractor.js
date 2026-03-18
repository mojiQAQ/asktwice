/**
 * Ask Twice — AI 回答文本提取器
 * 
 * 使用 MutationObserver 监听 AI 回答的 DOM 变化，
 * 当检测到新的完整回答时，注入浮标按钮。
 */
const AskTwiceExtractor = {
  platform: null,
  adapter: null,
  observer: null,
  processedAnswers: new Set(),

  /**
   * 初始化提取器
   */
  init(platform) {
    this.platform = platform;
    
    // 选择对应的适配器
    const adapters = {
      doubao: DoubaoAdapter,
      chatgpt: ChatGPTAdapter,
    };
    this.adapter = adapters[platform.id];

    if (!this.adapter) {
      console.warn(`[Ask Twice] 未找到平台 ${platform.id} 的适配器`);
      return;
    }

    console.log(`[Ask Twice] 初始化提取器 — 平台: ${platform.name}`);
    
    // 处理已有的回答
    this.processExistingAnswers();
    
    // 开始监听新回答
    this.startObserving();
  },

  /**
   * 处理页面上已有的 AI 回答
   */
  processExistingAnswers() {
    const answers = this._findAnswers();
    
    answers.forEach(answerEl => {
      this.processAnswer(answerEl);
    });
    
    console.log(`[Ask Twice] 已处理 ${answers.length} 条现有回答`);
  },

  /**
   * 查找页面上的 AI 回答元素
   * 优先使用适配器的 findAllAnswers（适用于豆包等动态 class 平台）
   */
  _findAnswers() {
    if (this.adapter && typeof this.adapter.findAllAnswers === 'function') {
      return this.adapter.findAllAnswers();
    }
    const selector = this.platform.selectors.answerContainer;
    return Array.from(document.querySelectorAll(selector));
  },

  /**
   * 开始 MutationObserver 监听
   */
  startObserving() {
    const chatSelector = this.platform.selectors.chatContainer;
    
    // 尝试找到聊天容器
    const tryObserve = () => {
      // 尝试多个可能的容器选择器
      const selectors = chatSelector.split(', ');
      let container = null;
      
      for (const sel of selectors) {
        container = document.querySelector(sel);
        if (container) break;
      }

      if (!container) {
        // 兜底：监听 body
        container = document.body;
      }

      this.observer = new MutationObserver(
        AskTwiceUtils.debounce(() => this.onDomChange(), 800)
      );

      this.observer.observe(container, {
        childList: true,
        subtree: true,
      });

      console.log(`[Ask Twice] MutationObserver 已启动`);
    };

    // 延迟启动，等待页面加载
    setTimeout(tryObserve, 1000);
  },

  /**
   * DOM 变化回调 — 检查是否有新的 AI 回答
   */
  onDomChange() {
    const answers = this._findAnswers();
    
    answers.forEach(answerEl => {
      this.processAnswer(answerEl);
    });
  },

  /**
   * 处理单条 AI 回答
   */
  processAnswer(answerEl) {
    const answerId = this.adapter.getAnswerId(answerEl);
    
    // 避免重复处理
    if (this.processedAnswers.has(answerId)) return;
    
    // 检查回答是否已完成（非流式输出中）
    if (!this.adapter.isAnswerComplete(answerEl)) {
      // 未完成，等下次 mutation 再检查
      return;
    }

    const text = this.adapter.extractText(answerEl);
    if (!text || text.length < 20) return; // 太短的回答不处理

    this.processedAnswers.add(answerId);
    
    // 注入浮标按钮
    FloatButton.inject(answerEl, {
      answerId,
      text,
      platform: this.platform.id,
    });

    console.log(`[Ask Twice] 已处理回答: ${AskTwiceUtils.truncate(text, 50)}`);
  },

  /**
   * 销毁
   */
  destroy() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.processedAnswers.clear();
  },
};
