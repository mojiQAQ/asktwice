const levels = [
  { min: 80, label: '高可信', color: '#10B981', bg: '#ECFDF5', emoji: '🟢' },
  { min: 60, label: '待验证', color: '#F59E0B', bg: '#FFFBEB', emoji: '🟡' },
  { min: 40, label: '低可信', color: '#F97316', bg: '#FFF7ED', emoji: '🟠' },
  { min: 0,  label: '不可信', color: '#EF4444', bg: '#FEF2F2', emoji: '🔴' },
];

function getLevel(score) {
  return levels.find(l => score >= l.min) || levels[3];
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/** 把文本中的域名自动变成可点击链接 */
function linkify(text) {
  const escaped = esc(text);
  return escaped.replace(
    /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?(?:\/\S*)?)/g,
    (match) => {
      const href = match.startsWith('http') ? match : `https://${match}`;
      return `<a class="hc-source-link" href="${href}" target="_blank" rel="noopener" style="display:inline;padding:0;background:none;">${match}</a>`;
    }
  );
}

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `今天 ${time}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return ''; }
}

function buildSourceLinks(sources) {
  if (!sources || sources.length === 0) return '';
  return '<div class="hc-sources">' +
    sources.map(s => {
      const label = esc(s.title || s.domain || '来源');
      const shortLabel = label.length > 25 ? label.substring(0, 25) + '…' : label;
      return `<a class="hc-source-link" href="${esc(s.url)}" target="_blank" rel="noopener" title="${label}">🔗 ${shortLabel}</a>`;
    }).join('') + '</div>';
}

async function render() {
  const data = await chrome.storage.local.get('verifyHistory');
  const history = data.verifyHistory || [];
  const container = document.getElementById('content');
  const badge = document.getElementById('countBadge');

  badge.textContent = `${history.length} 条记录`;

  if (history.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">🔍</div>
        <p>还没有验证记录<br>在 AI 页面选中文字后点击 Ask Twice 图标即可验证</p>
      </div>
    `;
    return;
  }

  let html = '';
  for (const item of history) {
    const lv = getLevel(item.score);
    const domain = extractDomain(item.url || '');
    const sourceUrl = item.url || '';

    let claimsHtml = '';
    if (item.claims && item.claims.length > 0) {
      claimsHtml = '<div class="hc-claims">' +
        item.claims.map(c => {
          const cLv = getLevel(c.score);
          const reasonHtml = c.reason ? `<div class="hc-creason">${linkify(c.reason)}</div>` : '';
          const sourcesHtml = buildSourceLinks(c.sources);
          return `<div class="hc-claim">
            <span class="hc-cscore" style="background:${cLv.color}">${c.score}</span>
            <div class="hc-cbody">
              <span class="hc-ctext">${esc(c.text)}</span>
              ${reasonHtml}
              ${sourcesHtml}
            </div>
          </div>`;
        }).join('') + '</div>';
    }

    let conflictHtml = '';
    if (item.conflict) {
      conflictHtml = '<div class="hc-conflict">⚠️ 检测到利益冲突倾向</div>';
    }

    const summaryHtml = item.summary ? `<div class="hc-summary">${linkify(item.summary)}</div>` : '';

    html += `
      <div class="history-card">
        <div class="hc-header">
          <div class="hc-score" style="color:${lv.color}">${item.score}</div>
          <div class="hc-info">
            <span class="hc-level" style="color:${lv.color};background:${lv.bg}">${lv.emoji} ${lv.label}</span>
            <div class="hc-text">${esc(item.text)}</div>
          </div>
          <div class="hc-meta">
            ${sourceUrl ? `<a class="hc-url-link" href="${esc(sourceUrl)}" target="_blank" rel="noopener" title="跳转原文页面">${domain ? esc(domain) : '原文'} ↗</a>` : ''}
            <span>${formatTime(item.time)}</span>
          </div>
        </div>
        ${summaryHtml}
        ${claimsHtml}
        ${conflictHtml}
      </div>
    `;
  }

  html += '<button class="clear-btn" id="clearBtn">清空历史记录</button>';
  container.innerHTML = html;

  document.getElementById('clearBtn')?.addEventListener('click', async () => {
    if (confirm('确定要清空所有验证历史记录吗？')) {
      await chrome.storage.local.set({ verifyHistory: [] });
      render();
    }
  });
}

render();
