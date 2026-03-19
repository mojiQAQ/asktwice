/**
 * Ask Twice — 浮标按钮组件
 * 
 * 在每条 AI 回答旁注入一个小按钮，点击后触发验证。
 */
const FloatButton = {
  /**
   * 在 AI 回答元素旁注入浮标按钮
   */
  inject(answerEl, { answerId, text, platform }) {
    // 避免重复注入
    if (answerEl.querySelector(`.${ASKTWICE.CSS_PREFIX}-float-btn`)) return;

    const btn = AskTwiceUtils.createElement('button', {
      className: `${ASKTWICE.CSS_PREFIX}-float-btn`,
      title: AskTwiceUtils.i18n('verifyAnswer'),
      'data-answer-id': answerId,
    }, [
      // 图标：双勾 SVG
      this._createIcon(),
    ]);

    // 点击事件
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.onVerify(btn, { answerId, text, platform });
    });

    // 创建一个容器来定位按钮
    const wrapper = AskTwiceUtils.createElement('div', {
      className: `${ASKTWICE.CSS_PREFIX}-float-wrapper`,
    }, [btn]);

    // 设置回答容器为相对定位（如果还不是的话）
    const computedPos = window.getComputedStyle(answerEl).position;
    if (computedPos === 'static') {
      answerEl.style.position = 'relative';
    }

    answerEl.appendChild(wrapper);
  },

  /**
   * 点击验证
   */
  async onVerify(btn, { answerId, text, platform }) {
    // 设置为加载状态
    this.setLoading(btn, true);
    
    try {
      // 通过 Message 发送给 Service Worker 处理
      const response = await chrome.runtime.sendMessage({
        type: ASKTWICE.MSG.VERIFY_REQUEST,
        payload: { answerId, text, platform },
      });

      if (response && response.type === ASKTWICE.MSG.VERIFY_RESULT) {
        this.setResult(btn, response.payload.result);
        ResultCard.show(btn.closest(`.${ASKTWICE.CSS_PREFIX}-float-wrapper`), response.payload.result);
      } else if (response && response.type === ASKTWICE.MSG.VERIFY_ERROR) {
        this.setError(btn, response.payload.error);
      }
    } catch (err) {
      console.error('[Ask Twice] Verify failed:', err);
      this.setError(btn, err.message);
    }
  },

  /**
   * 设置加载状态
   */
  setLoading(btn, loading) {
    btn.classList.toggle(`${ASKTWICE.CSS_PREFIX}-loading`, loading);
    btn.disabled = loading;
  },

  /**
   * 设置验证结果
   */
  setResult(btn, result) {
    this.setLoading(btn, false);
    const level = AskTwiceUtils.getScoreLevel(result.overall_score);
    btn.style.setProperty('--asktwice-color', level.color);
    btn.classList.add(`${ASKTWICE.CSS_PREFIX}-has-result`);
    btn.title = `${AskTwiceUtils.i18n('credibility')}: ${result.overall_score} — ${level.label}`;
    
    // 添加分数显示
    let scoreEl = btn.querySelector(`.${ASKTWICE.CSS_PREFIX}-score`);
    if (!scoreEl) {
      scoreEl = AskTwiceUtils.createElement('span', {
        className: `${ASKTWICE.CSS_PREFIX}-score`,
      });
      btn.appendChild(scoreEl);
    }
    scoreEl.textContent = result.overall_score;
  },

  /**
   * 设置错误状态
   */
  setError(btn, message) {
    this.setLoading(btn, false);
    btn.classList.add(`${ASKTWICE.CSS_PREFIX}-error`);
    btn.title = `${AskTwiceUtils.i18n('verifyFailed')}: ${message}`;
  },

  /**
   * 创建按钮图标 SVG
   */
  _createIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    // 放大镜 + 对勾
    svg.innerHTML = `
      <circle cx="11" cy="11" r="8"/>
      <path d="M21 21l-4.35-4.35"/>
      <path d="M8 11l2 2 4-4"/>
    `;
    return svg;
  },
};
