/**
 * Ask Twice — 划词弹出气泡组件
 * 
 * 用户选中文字后，在选区右下方弹出一个小 logo。
 * 鼠标悬浮 logo → 展开为「验证」按钮。
 * 点击后调用后端 API 验证，结果展示在浮窗中。
 */
const SelectionBubble = {
  bubble: null,       // logo 气泡元素
  resultPanel: null,  // 验证结果面板
  selectedText: '',   // 选中的文字
  context: '',        // 上下文

  init() {
    document.addEventListener('mouseup', (e) => this.onMouseUp(e));
    document.addEventListener('mousedown', (e) => this.onMouseDown(e));
    console.log('[Ask Twice] Selection verify enabled');
  },

  onMouseDown(e) {
    // 点击在气泡或结果面板上不隐藏
    if (this.bubble && this.bubble.contains(e.target)) return;
    if (this.resultPanel && this.resultPanel.contains(e.target)) return;
    this.hideResult();
    this.hideBubble();
  },

  onMouseUp(e) {
    // 点击在气泡或结果面板上不处理
    if (this.bubble && this.bubble.contains(e.target)) return;
    if (this.resultPanel && this.resultPanel.contains(e.target)) return;

    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection.toString().trim();
      
      if (text.length < 5) {
        return;
      }

      this.selectedText = text;

      // 收集完整对话历史（最近 5 轮）
      this.conversationHistory = [];
      const anchorNode = selection.anchorNode;
      if (anchorNode) {
        const container = anchorNode.nodeType === Node.ELEMENT_NODE 
          ? anchorNode 
          : anchorNode.parentElement;
        
        // 找聊天列表容器
        const chatList = container?.closest?.('[data-testid="message-list"], main .flex.flex-col, main');
        if (chatList) {
          // 收集所有消息节点
          const userMsgs = chatList.querySelectorAll('[data-testid="send_message"], [data-message-author-role="user"]');
          const aiMsgs = chatList.querySelectorAll('[data-testid="receive_message"], [data-message-author-role="assistant"]');
          
          // 合并并按 DOM 顺序排序
          const allMsgs = [];
          userMsgs.forEach(el => {
            const textEl = el.querySelector('[data-testid="message_text_content"], .whitespace-pre-wrap') || el;
            allMsgs.push({ el, role: 'user', content: textEl.innerText?.trim() || '' });
          });
          aiMsgs.forEach(el => {
            const textEl = el.querySelector('.flow-markdown-body, .markdown, .prose, [data-testid="message_text_content"]') || el;
            allMsgs.push({ el, role: 'assistant', content: textEl.innerText?.trim() || '' });
          });
          
          // 按 DOM 位置排序
          allMsgs.sort((a, b) => {
            const pos = a.el.compareDocumentPosition(b.el);
            return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
          });
          
          // 取最近 10 条消息（约 5 轮）
          this.conversationHistory = allMsgs.slice(-10).map(m => ({
            role: m.role,
            content: m.content.substring(0, 1500),
          }));
        }
        
        // 也保存当前回答上下文（兼容旧逻辑）
        const answerEl = container?.closest?.('[data-testid="receive_message"], [data-message-author-role="assistant"]');
        if (answerEl) {
          const mdBody = answerEl.querySelector('.flow-markdown-body, .markdown, .prose, [data-testid="message_text_content"]');
          this.context = (mdBody || answerEl).innerText.trim();
        } else {
          this.context = '';
        }
      }

      // 在鼠标释放位置显示 logo（比选区边缘更方便点击）
      this.showBubble(e.clientX + 8, e.clientY + 8);
    }, 10);
  },

  showBubble(x, y) {
    this.hideBubble();

    // 确保不超出视口
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    if (x + 36 > viewW) x = viewW - 44;
    if (y + 36 > viewH) y = viewH - 44;

    const bubble = document.createElement('div');
    bubble.className = 'asktwice-sel-bubble';
    bubble.innerHTML = `
      <div class="asktwice-sel-logo" title="${AskTwiceUtils.i18n('verifyAnswer')}">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7"/>
          <path d="M21 21l-4.35-4.35"/>
          <path d="M8.5 11l1.5 1.5 3-3"/>
        </svg>
      </div>
      <div class="asktwice-sel-expand">
        <span class="asktwice-sel-label">${AskTwiceUtils.i18n('verifyCredibility')}</span>
      </div>
    `;

    bubble.style.left = `${x + window.scrollX}px`;
    bubble.style.top = `${y + window.scrollY}px`;

    // 点击事件
    bubble.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onVerifyClick(bubble);
    });

    document.body.appendChild(bubble);
    this.bubble = bubble;

    // 触发进入动画
    requestAnimationFrame(() => bubble.classList.add('asktwice-sel-visible'));
  },

  hideBubble() {
    if (this.bubble) {
      this.bubble.remove();
      this.bubble = null;
    }
  },

  hideResult() {
    if (this.resultPanel) {
      this.resultPanel.remove();
      this.resultPanel = null;
    }
  },

  async onVerifyClick(bubble) {
    // 变为 loading 状态
    const logo = bubble.querySelector('.asktwice-sel-logo');
    const expand = bubble.querySelector('.asktwice-sel-expand');
    if (logo) logo.classList.add('asktwice-sel-loading');
    if (expand) {
      expand.querySelector('.asktwice-sel-label').textContent = AskTwiceUtils.i18n('verifying');
    }

    try {
      const textToVerify = this.context || this.selectedText;
      
      const response = await chrome.runtime.sendMessage({
        type: ASKTWICE.MSG.VERIFY_REQUEST,
        payload: {
          answerId: `sel-${Date.now()}`,
          text: textToVerify,
          selectedText: this.selectedText,
          conversation: this.conversationHistory || [],
          platform: 'manual',
        },
      });

      if (response && response.type === ASKTWICE.MSG.VERIFY_RESULT) {
        this.showResultPanel(bubble, response.payload.result);
        // 保存到历史
        this.saveToHistory(this.selectedText, response.payload.result);
      } else if (response && response.type === ASKTWICE.MSG.VERIFY_ERROR) {
        this.showError(bubble, response.payload.error);
      }
    } catch (err) {
      console.error('[Ask Twice] Verify failed:', err);
      this.showError(bubble, err.message);
    }
  },

  showResultPanel(bubble, result) {
    this.hideResult();

    const score = result.overall_score || 0;
    const levels = [
      { min: 80, labelKey: 'highCredibility', color: '#10B981', bg: '#ECFDF5', emoji: '🟢' },
      { min: 60, labelKey: 'needsVerification', color: '#F59E0B', bg: '#FFFBEB', emoji: '🟡' },
      { min: 40, labelKey: 'lowCredibility', color: '#F97316', bg: '#FFF7ED', emoji: '🟠' },
      { min: 0,  labelKey: 'unreliable', color: '#EF4444', bg: '#FEF2F2', emoji: '🔴' },
    ];
    const lv = levels.find(l => score >= l.min) || levels[3];
    const lvLabel = AskTwiceUtils.i18n(lv.labelKey);

    const panel = document.createElement('div');
    panel.className = 'asktwice-result-panel';

    // ── 红框：综合评定 ──
    const judgmentText = result.judgment || result.summary || '';
    const judgmentHtml = judgmentText
      ? `<div class="asktwice-rp-judgment">${this._linkify(judgmentText)}</div>`
      : '';

    // ── 蓝框：多源结果列表 ──
    let sourceCardsHtml = '';
    if (result.claims && result.claims.length > 0) {
      // 收集所有声明的 source_results，每个 claim-source 组合独立展示
      const allSourceResults = [];
      for (const c of result.claims) {
        const claimDomain = c.domain || '';
        if (c.source_results && c.source_results.length > 0) {
          for (const sr of c.source_results) {
            allSourceResults.push({ ...sr, _claimDomain: claimDomain });
          }
        }
      }

      if (allSourceResults.length > 0) {
        sourceCardsHtml = allSourceResults.map(sr => {
          const isLLM = sr.engine_type === 'llm';
          const icon = sr.score >= 70 ? '🟢' : sr.score >= 40 ? '🟡' : sr.result_count > 0 || sr.assessment ? '🔴' : '⚪';
          const engineName = sr.engine.replace('llm:', '');
          // 组合显示：源名称：问题分类
          const displayName = sr._claimDomain
            ? `${engineName}：${sr._claimDomain}`
            : engineName;

          let detailHtml = '';
          if (isLLM) {
            const assessIcon = sr.assessment === 'correct' ? '✓' : sr.assessment === 'incorrect' ? '✗' : '?';
            const assessColor = sr.assessment === 'correct' ? '#10B981' : sr.assessment === 'incorrect' ? '#EF4444' : '#9CA3AF';
            detailHtml = `
              <div class="asktwice-rp-src-assess" style="color:${assessColor}">
                <span>${assessIcon} ${sr.assessment || 'uncertain'}</span>
                <span style="color:#9CA3AF;margin-left:4px">(${sr.confidence}%)</span>
              </div>
              ${sr.reasoning ? `<div class="asktwice-rp-src-reason">${this._esc(sr.reasoning)}</div>` : ''}
            `;
          } else {
            detailHtml = `<div class="asktwice-rp-src-count">${sr.result_count} ${AskTwiceUtils.i18n('nSources', [String(sr.result_count)])}</div>`;
            if (sr.findings && sr.findings.length > 0) {
              detailHtml += '<div class="asktwice-rp-src-links">' +
                sr.findings.slice(0, 3).map(f => {
                  const label = f.title || f.domain || AskTwiceUtils.i18n('sourceLabel');
                  const short = label.length > 35 ? label.substring(0, 32) + '...' : label;
                  return f.url
                    ? `<a class="asktwice-rp-src-link" href="${this._esc(f.url)}" target="_blank" rel="noopener" title="${this._esc(label)}">🔗 ${this._esc(short)}</a>`
                    : `<span class="asktwice-rp-src-link">${this._esc(short)}</span>`;
                }).join('') + '</div>';
            }
            if (!sr.findings?.length && sr.reasoning) {
              detailHtml += `<div class="asktwice-rp-src-reason">${this._esc(sr.reasoning)}</div>`;
            }
          }

          return `
            <div class="asktwice-rp-source-card">
              <div class="asktwice-rp-src-header">
                <span class="asktwice-rp-src-icon">${icon}</span>
                <span class="asktwice-rp-src-name">${this._esc(displayName)}</span>
                <span class="asktwice-rp-src-type">${isLLM ? 'LLM' : 'Search'}</span>
                ${sr.score > 0 ? `<span class="asktwice-rp-src-score">${sr.score}</span>` : ''}
              </div>
              ${detailHtml}
            </div>
          `;
        }).join('');
      }
    }

    // 没有分源结果时，回退到旧的 claims 展示
    if (!sourceCardsHtml && result.claims && result.claims.length > 0) {
      // 保底：从 meta.sources_used 获取源名称
      const metaSources = (result.meta && result.meta.sources_used) || [];
      sourceCardsHtml = result.claims.slice(0, 5).map(c => {
        const cLv = levels.find(l => c.score >= l.min) || levels[3];
        // 优先从 claim 的 source_results 提取源名称，其次从 meta.sources_used
        let sourceNames = (c.source_results || []).map(sr => sr.engine.replace('llm:', '')).filter(Boolean);
        if (sourceNames.length === 0 && metaSources.length > 0) {
          sourceNames = metaSources.map(s => s.replace('llm:', ''));
        }
        const domainText = c.domain || c.text.substring(0, 30);
        const displayName = sourceNames.length > 0
          ? `${sourceNames.join('、')}：${domainText}`
          : domainText;
        return `
          <div class="asktwice-rp-source-card">
            <div class="asktwice-rp-src-header">
              <span class="asktwice-rp-src-score" style="background:${cLv.color}">${c.score}</span>
              <span class="asktwice-rp-src-name">${this._esc(displayName)}</span>
            </div>
            ${c.reason ? `<div class="asktwice-rp-src-reason">${this._linkify(c.reason)}</div>` : ''}
          </div>
        `;
      }).join('');
    }

    // 冲突警告
    let conflictHtml = '';
    if (result.conflicts && result.conflicts.has_conflict) {
      conflictHtml = `
        <div class="asktwice-rp-conflict">
          ⚠️ ${AskTwiceUtils.i18n('conflictBias', [String(result.conflicts.bias_score)])}
        </div>
      `;
    }

    // 原文
    const origText = this.selectedText || '';
    const origDisplay = origText.length > 500 ? origText.substring(0, 497) + '...' : origText;
    const originalHtml = origText ? `<div class="asktwice-rp-original">${this._esc(origDisplay)}</div>` : '';

    panel.innerHTML = `
      <div class="asktwice-rp-header asktwice-rp-drag">
        <div class="asktwice-rp-score" style="color:${lv.color}">${score}</div>
        <div class="asktwice-rp-info">
          <span class="asktwice-rp-level" style="color:${lv.color};background:${lv.bg}">${lv.emoji} ${lvLabel}</span>
        </div>
        <button class="asktwice-rp-close" title="${AskTwiceUtils.i18n('close')}">✕</button>
      </div>
      ${originalHtml}
      ${judgmentHtml}
      ${sourceCardsHtml ? `<div class="asktwice-rp-sources-list">${sourceCardsHtml}</div>` : ''}
      ${conflictHtml}
    `;

    // 关闭按钮
    panel.querySelector('.asktwice-rp-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideResult();
      this.hideBubble();
    });

    // 先添加到 DOM（隐藏状态），测量真实高度
    panel.style.visibility = 'hidden';
    document.body.appendChild(panel);
    this.resultPanel = panel;

    // 测量后定位
    requestAnimationFrame(() => {
      const panelRect = panel.getBoundingClientRect();
      const bubbleRect = bubble.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // 水平居中于气泡，但不超出左右边界
      let left = bubbleRect.left - (panelRect.width / 2) + 18;
      if (left + panelRect.width > vw - 10) left = vw - panelRect.width - 10;
      if (left < 10) left = 10;

      // 竖直：优先在气泡下方，空间不够则在上方
      let top;
      const spaceBelow = vh - bubbleRect.bottom - 12;
      const spaceAbove = bubbleRect.top - 12;
      if (spaceBelow >= panelRect.height || spaceBelow >= spaceAbove) {
        top = bubbleRect.bottom + 8;
        // 如果底部不够显示全部，限制在视口内可滚动
        if (top + panelRect.height > vh - 10) {
          panel.style.maxHeight = `${vh - top - 10}px`;
        }
      } else {
        top = bubbleRect.top - panelRect.height - 8;
        if (top < 10) {
          top = 10;
          panel.style.maxHeight = `${bubbleRect.top - 18}px`;
        }
      }

      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.visibility = '';
      panel.classList.add('asktwice-rp-visible');
    });

    // ── 拖拽功能 ──
    this._initDrag(panel);

    // 更新气泡状态
    const logo = bubble.querySelector('.asktwice-sel-logo');
    if (logo) {
      logo.classList.remove('asktwice-sel-loading');
      logo.style.background = lv.color;
    }
    const labelEl = bubble.querySelector('.asktwice-sel-label');
    if (labelEl) labelEl.textContent = `${score} — ${lvLabel}`;
  },

  _initDrag(panel) {
    const header = panel.querySelector('.asktwice-rp-drag');
    if (!header) return;
    let isDragging = false;
    let startX, startY, origLeft, origTop;

    header.style.cursor = 'grab';

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.asktwice-rp-close')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;
      header.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      panel.style.left = `${origLeft + dx}px`;
      panel.style.top = `${origTop + dy}px`;
      // 拖动后去掉 maxHeight 限制
      panel.style.maxHeight = '80vh';
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        header.style.cursor = 'grab';
      }
    });
  },

  showError(bubble, msg) {
    const logo = bubble.querySelector('.asktwice-sel-logo');
    if (logo) {
      logo.classList.remove('asktwice-sel-loading');
      logo.style.background = '#EF4444';
    }
    const label = bubble.querySelector('.asktwice-sel-label');
    if (label) label.textContent = `${AskTwiceUtils.i18n('failed')}: ${msg.substring(0, 20)}`;
  },

  async saveToHistory(text, result) {
    try {
      const data = await chrome.storage.local.get('verifyHistory');
      const history = data.verifyHistory || [];
      history.unshift({
        text: text,
        score: result.overall_score,
        level: result.level,
        summary: result.summary || '',
        judgment: result.judgment || '',
        sources_used: (result.meta && result.meta.sources_used) || [],
        claims: (result.claims || []).slice(0, 5).map(c => ({
          text: c.text,
          score: c.score,
          type: c.type,
          domain: c.domain || '',
          reason: c.reason || '',
          source_results: (c.source_results || []).map(sr => ({
            engine: sr.engine || '',
            engine_type: sr.engine_type || 'search',
            score: sr.score || 0,
            result_count: sr.result_count || 0,
            assessment: sr.assessment || '',
            confidence: sr.confidence || 0,
            reasoning: sr.reasoning || '',
            findings: (sr.findings || []).slice(0, 3).map(f => ({
              url: f.url || '', title: f.title || '', domain: f.domain || '',
            })),
          })),
          sources: (c.sources || []).slice(0, 3).map(s => ({
            url: s.url || '', title: s.title || '', domain: s.domain || '',
          })),
        })),
        conflict: result.conflicts?.has_conflict || false,
        platform: 'manual',
        url: window.location.href,
        time: Date.now(),
      });
      if (history.length > 50) history.length = 50;
      await chrome.storage.local.set({ verifyHistory: history });
    } catch (e) {
      // 忽略
    }
  },

  _esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  },

  /** 把文本中的域名（xxx.com 格式）自动变成可点击的链接 */
  _linkify(text) {
    const escaped = this._esc(text);
    // 匹配 URL 和域名模式
    return escaped.replace(
      /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?(?:\/\S*)?)/g,
      (match) => {
        const href = match.startsWith('http') ? match : `https://${match}`;
        return `<a class="asktwice-rp-src" href="${href}" target="_blank" rel="noopener" style="display:inline;padding:0;background:none;color:#4F46E5;">${match}</a>`;
      }
    ).replace(/\n/g, '<br>');
  },
};
