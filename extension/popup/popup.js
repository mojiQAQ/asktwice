/**
 * Ask Twice — Popup 逻辑
 * 
 * 功能：
 * 1. 获取页面选中文字 → 发送到后端验证 → 展示结果
 * 2. 显示今日用量
 * 3. 显示验证历史
 */
document.addEventListener('DOMContentLoaded', async () => {
  const verifyBtn = document.getElementById('verifyBtn');
  const actionHint = document.getElementById('actionHint');
  const resultSection = document.getElementById('resultSection');
  const resultScore = document.getElementById('resultScore');
  const resultLevel = document.getElementById('resultLevel');
  const resultDetail = document.getElementById('resultDetail');
  const historySection = document.getElementById('historySection');
  const historyList = document.getElementById('historyList');

  // ── 加载用量 ──
  loadUsage();

  // ── 加载历史记录 ──
  loadHistory();

  // ── 验证按钮点击 ──
  verifyBtn.addEventListener('click', async () => {
    // 获取当前标签页选中的文字
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        showHint('无法获取当前页面', 'error');
        return;
      }

      // 注入脚本获取选中的文字
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection().toString().trim(),
      });

      const selectedText = results?.[0]?.result;
      if (!selectedText || selectedText.length < 5) {
        showHint('请先在网页上选中要验证的文字（至少 5 个字）', 'error');
        return;
      }

      // 开始验证
      verifyBtn.disabled = true;
      verifyBtn.classList.add('loading');
      verifyBtn.textContent = '验证中...';
      showHint('正在分析文本可信度...', 'success');

      // 发消息给 Service Worker 执行验证
      const response = await chrome.runtime.sendMessage({
        type: 'VERIFY_REQUEST',
        payload: {
          answerId: `popup-${Date.now()}`,
          text: selectedText,
          platform: 'manual',
        },
      });

      if (response && response.type === 'VERIFY_RESULT') {
        showResult(response.payload.result, selectedText);
        saveHistory(selectedText, response.payload.result);
        loadUsage(); // 刷新用量
      } else if (response && response.type === 'VERIFY_ERROR') {
        showHint(`验证失败: ${response.payload.error}`, 'error');
      }
    } catch (err) {
      console.error('[Ask Twice Popup]', err);
      showHint(`出错: ${err.message}`, 'error');
    } finally {
      verifyBtn.disabled = false;
      verifyBtn.classList.remove('loading');
      verifyBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <path d="M21 21l-4.35-4.35"/>
          <path d="M8 11l2 2 4-4"/>
        </svg>
        验证选中文字
      `;
    }
  });

  // ── 设置 ──
  const autoVerifyEl = document.getElementById('autoVerify');
  const settings = await chrome.storage.sync.get('settings');
  const cfg = settings.settings || {};
  autoVerifyEl.checked = cfg.autoVerify || false;

  autoVerifyEl.addEventListener('change', () => {
    saveSettings({ autoVerify: autoVerifyEl.checked });
  });

  // 查看历史按钮
  document.getElementById('openDashboard')?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  });

  // ═══════ 辅助函数 ═══════

  function showHint(msg, type = '') {
    actionHint.textContent = msg;
    actionHint.className = `action-hint ${type}`;
  }

  function showResult(result, text) {
    resultSection.style.display = 'block';

    // 评分
    const score = result.overall_score || 0;
    resultScore.textContent = score;

    // 评级颜色
    const levels = [
      { min: 80, label: '高可信', color: '#10B981', bg: '#ECFDF5' },
      { min: 60, label: '待验证', color: '#F59E0B', bg: '#FFFBEB' },
      { min: 40, label: '低可信', color: '#F97316', bg: '#FFF7ED' },
      { min: 0,  label: '不可信', color: '#EF4444', bg: '#FEF2F2' },
    ];
    const lv = levels.find(l => score >= l.min) || levels[levels.length - 1];
    
    resultScore.style.color = lv.color;
    resultLevel.textContent = lv.label;
    resultLevel.style.color = lv.color;
    resultLevel.style.background = lv.bg;

    // 详情
    let html = '';

    // 验证的文字预览
    html += `<div class="verified-text-preview">"${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"</div>`;

    // 声明列表
    if (result.claims && result.claims.length > 0) {
      result.claims.forEach(claim => {
        const claimLv = levels.find(l => claim.score >= l.min) || levels[levels.length - 1];
        html += `
          <div class="claim-item">
            <span class="claim-score" style="background:${claimLv.color}">${claim.score}</span>
            <span class="claim-text">${escapeHtml(claim.text.substring(0, 60))}${claim.text.length > 60 ? '...' : ''}</span>
          </div>
        `;
      });
    } else {
      html += '<div style="padding:4px 0;color:#9CA3AF;font-size:11px;">未提取到可验证的声明</div>';
    }

    // 冲突警告
    if (result.conflicts && result.conflicts.has_conflict) {
      html += `
        <div class="conflict-warning">
          ⚠️ 检测到利益冲突倾向（偏差评分: ${result.conflicts.bias_score}）
        </div>
      `;
    }

    resultDetail.innerHTML = html;
    showHint('验证完成 ✓', 'success');
  }

  async function loadUsage() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_USAGE' });
      if (response && response.payload) {
        const { used, limit } = response.payload;
        const pct = Math.min(100, (used / limit) * 100);
        document.getElementById('usageFill').style.width = `${pct}%`;
        document.getElementById('usageText').textContent = `${used} / ${limit}`;
      }
    } catch (e) {
      document.getElementById('usageText').textContent = '—';
    }
  }

  async function loadHistory() {
    try {
      const data = await chrome.storage.local.get('verifyHistory');
      const history = data.verifyHistory || [];
      if (history.length === 0) return;

      historySection.style.display = 'block';
      historyList.innerHTML = history.slice(0, 5).map(item => {
        const lv = item.score >= 80 ? '#10B981' : item.score >= 60 ? '#F59E0B' : item.score >= 40 ? '#F97316' : '#EF4444';
        const time = new Date(item.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        const origText = escapeHtml(item.text || '');
        const origShort = origText.substring(0, 40) + (origText.length > 40 ? '…' : '');
        const summaryShort = item.summary ? escapeHtml(item.summary.substring(0, 60)) : '';
        const fullSummary = item.summary ? escapeHtml(item.summary) : '';
        const sourceUrl = item.url || '';
        return `
          <div class="history-item" title="${origText}">
            <span class="h-score" style="color:${lv}" title="${fullSummary}">${item.score}</span>
            <div class="h-body">
              <div class="h-orig">${origShort}</div>
              ${summaryShort ? `<div class="h-summary">${summaryShort}</div>` : ''}
            </div>
            <div class="h-right">
              <span class="h-time">${time}</span>
              ${sourceUrl ? `<a class="h-link" href="${escapeHtml(sourceUrl)}" target="_blank" title="跳转原文">↗</a>` : ''}
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      // 忽略
    }
  }

  async function saveHistory(text, result) {
    try {
      const data = await chrome.storage.local.get('verifyHistory');
      const history = data.verifyHistory || [];
      history.unshift({
        text: text.substring(0, 100),
        score: result.overall_score,
        time: Date.now(),
      });
      // 只保留最近 20 条
      if (history.length > 20) history.length = 20;
      await chrome.storage.local.set({ verifyHistory: history });
      loadHistory();
    } catch (e) {
      // 忽略
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function saveSettings(updates) {
    const data = await chrome.storage.sync.get('settings');
    const current = data.settings || {};
    await chrome.storage.sync.set({ settings: { ...current, ...updates } });
  }
});
