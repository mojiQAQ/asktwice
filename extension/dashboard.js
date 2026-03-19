const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;

// i18n: fill data-i18n elements
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const msg = t(el.getAttribute('data-i18n'));
    if (msg) el.textContent = msg;
  });
});

const levels = [
  { min: 80, labelKey: 'highCredibility', color: '#10B981', bg: '#ECFDF5', emoji: '🟢' },
  { min: 60, labelKey: 'needsVerification', color: '#F59E0B', bg: '#FFFBEB', emoji: '🟡' },
  { min: 40, labelKey: 'lowCredibility', color: '#F97316', bg: '#FFF7ED', emoji: '🟠' },
  { min: 0,  labelKey: 'unreliable', color: '#EF4444', bg: '#FEF2F2', emoji: '🔴' },
];

function getLevel(score) {
  const lv = levels.find(l => score >= l.min) || levels[3];
  return { ...lv, label: t(lv.labelKey) };
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
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `${t('today')} ${time}`;
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
      const label = esc(s.title || s.domain || t('sourceLabel'));
      const shortLabel = label.length > 25 ? label.substring(0, 25) + '…' : label;
      return `<a class="hc-source-link" href="${esc(s.url)}" target="_blank" rel="noopener" title="${label}">🔗 ${shortLabel}</a>`;
    }).join('') + '</div>';
}

async function render() {
  const data = await chrome.storage.local.get('verifyHistory');
  const history = data.verifyHistory || [];
  const container = document.getElementById('content');
  const badge = document.getElementById('countBadge');

  badge.textContent = t('nRecords', [String(history.length)]);

  if (history.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">🔍</div>
        <p>${t('noRecordsYet')}<br>${t('noRecordsHint')}</p>
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
      conflictHtml = `<div class="hc-conflict">⚠️ ${t('conflictDetected')}</div>`;
    }

    // 综合评定（新）
    const judgmentHtml = item.judgment
      ? `<div class="hc-judgment">${linkify(item.judgment)}</div>`
      : item.summary ? `<div class="hc-judgment">${linkify(item.summary)}</div>` : '';

    // 多源结果卡片（新）
    let sourceCardsHtml = '';
    if (item.claims && item.claims.length > 0) {
      const allSR = [];
      for (const c of item.claims) {
        const claimDomain = c.domain || '';
        for (const sr of (c.source_results || [])) {
          allSR.push({ ...sr, _claimDomain: claimDomain });
        }
      }
      if (allSR.length > 0) {
        sourceCardsHtml = '<div class="hc-sources-list">' +
          allSR.map(sr => {
            const isLLM = sr.engine_type === 'llm';
            const icon = sr.score >= 70 ? '🟢' : sr.score >= 40 ? '🟡' : (sr.result_count > 0 || sr.assessment) ? '🔴' : '⚪';
            const engineName = sr.engine.replace('llm:', '');
            // 组合显示：源名称：问题分类
            const displayName = sr._claimDomain
              ? esc(`${engineName}：${sr._claimDomain}`)
              : esc(engineName);

            let detail = '';
            if (isLLM) {
              const aIcon = sr.assessment === 'correct' ? '✓' : sr.assessment === 'incorrect' ? '✗' : '?';
              const aColor = sr.assessment === 'correct' ? '#10B981' : sr.assessment === 'incorrect' ? '#EF4444' : '#9CA3AF';
              detail = `<span style="color:${aColor};font-weight:500">${aIcon} ${sr.assessment || 'uncertain'} (${sr.confidence}%)</span>`;
              if (sr.reasoning) detail += `<div class="hc-src-reason">${esc(sr.reasoning)}</div>`;
            } else {
              detail = `<span class="hc-src-count">${sr.result_count} 条结果</span>`;
              if (sr.findings && sr.findings.length > 0) {
                detail += buildSourceLinks(sr.findings);
              }
            }

            return `<div class="hc-source-card">
              <div class="hc-src-header">
                <span>${icon}</span>
                <span class="hc-src-name">${displayName}</span>
                <span class="hc-src-type">${isLLM ? 'LLM' : 'Search'}</span>
                ${sr.score > 0 ? `<span class="hc-src-score">${sr.score}</span>` : ''}
              </div>
              <div class="hc-src-detail">${detail}</div>
            </div>`;
          }).join('') + '</div>';
      }
    }

    // 回退旧数据
    if (!sourceCardsHtml && item.claims && item.claims.length > 0) {
      sourceCardsHtml = '<div class="hc-claims">' +
        item.claims.map(c => {
          const cLv = getLevel(c.score);
          // 从 source_results 提取源名称
          const sourceNames = (c.source_results || []).map(sr => (sr.engine || '').replace('llm:', '')).filter(Boolean);
          const domainText = c.domain || c.text.substring(0, 30);
          const displayName = sourceNames.length > 0
            ? `${sourceNames.join('、')}：${domainText}`
            : domainText;
          const reasonHtml = c.reason ? `<div class="hc-creason">${linkify(c.reason)}</div>` : '';
          const sourcesHtml = buildSourceLinks(c.sources);
          return `<div class="hc-claim">
            <span class="hc-cscore" style="background:${cLv.color}">${c.score}</span>
            <div class="hc-cbody">
              <span class="hc-ctext">${esc(displayName)}</span>
              ${reasonHtml}
              ${sourcesHtml}
            </div>
          </div>`;
        }).join('') + '</div>';
    }

    html += `
      <div class="history-card">
        <div class="hc-header">
          <div class="hc-score" style="color:${lv.color}">${item.score}</div>
          <div class="hc-info">
            <span class="hc-level" style="color:${lv.color};background:${lv.bg}">${lv.emoji} ${lv.label}</span>
            <div class="hc-text">${esc(item.text)}</div>
          </div>
          <div class="hc-meta">
            ${sourceUrl ? `<a class="hc-url-link" href="${esc(sourceUrl)}" target="_blank" rel="noopener" title="${t('goToSource')}">${domain ? esc(domain) : t('originalPage')} ↗</a>` : ''}
            <span>${formatTime(item.time)}</span>
          </div>
        </div>
        ${judgmentHtml}
        ${sourceCardsHtml}
        ${conflictHtml}
      </div>
    `;
  }

  html += `<button class="clear-btn" id="clearBtn">${t('clearHistory')}</button>`;
  container.innerHTML = html;

  document.getElementById('clearBtn')?.addEventListener('click', async () => {
    if (confirm(t('confirmClearHistory'))) {
      await chrome.storage.local.set({ verifyHistory: [] });
      render();
    }
  });
}

render();
