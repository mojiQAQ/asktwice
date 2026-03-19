/**
 * Ask Twice — SidePanel 逻辑
 * 
 * 监听来自 Service Worker 的验证结果并展示。
 */

// i18n 快捷方法（SidePanel 独立环境）
const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;

// 分数等级配置（SidePanel 独立环境，需要自己定义）
const SCORE_LEVELS = {
  HIGH:              { min: 80, labelKey: 'highCredibility', color: '#10B981' },
  NEEDS_VERIFICATION:{ min: 60, labelKey: 'needsVerification', color: '#F59E0B' },
  LOW:               { min: 40, labelKey: 'lowCredibility', color: '#F97316' },
  UNRELIABLE:        { min: 0,  labelKey: 'unreliable', color: '#EF4444' },
};

function getScoreLevel(score) {
  let level;
  if (score >= 80) level = SCORE_LEVELS.HIGH;
  else if (score >= 60) level = SCORE_LEVELS.NEEDS_VERIFICATION;
  else if (score >= 40) level = SCORE_LEVELS.LOW;
  else level = SCORE_LEVELS.UNRELIABLE;
  return { ...level, label: t(level.labelKey) };
}

// i18n：填充 data-i18n 属性的元素
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const msg = t(key);
    if (msg) el.textContent = msg;
  });
});

/**
 * 渲染验证结果
 */
function renderResult(result) {
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('resultArea').style.display = 'block';

  const level = getScoreLevel(result.overall_score);

  // 评分
  const scoreNum = document.getElementById('scoreNum');
  scoreNum.textContent = result.overall_score;
  scoreNum.style.color = level.color;
  document.getElementById('scoreLabel').textContent = level.label;
  document.getElementById('scoreLabel').style.color = level.color;

  const bar = document.getElementById('scoreBar');
  bar.style.width = `${result.overall_score}%`;
  bar.style.background = level.color;

  // 声明列表
  const claimsList = document.getElementById('claimsList');
  if (result.claims && result.claims.length > 0) {
    claimsList.innerHTML = result.claims.map(claim => {
      const cl = getScoreLevel(claim.score);
      const icon = claim.score >= 80 ? '✅' : claim.score >= 60 ? '⚠️' : '❌';
      const sources = (claim.sources || []).map(s =>
        `<a class="claim-source-link" href="${s.url}" target="_blank" title="${s.title}">${s.domain}</a>`
      ).join(', ');

      return `
        <div class="claim-item">
          <span class="claim-icon">${icon}</span>
          <div class="claim-body">
            <div class="claim-text">${claim.text}</div>
            <div class="claim-score" style="color:${cl.color}">${claim.score} ${t('score')}</div>
            ${sources ? `<div class="claim-sources">${t('sourceLabel')}: ${sources}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  } else {
    claimsList.innerHTML = `<div style="color:#9CA3AF;text-align:center;padding:16px">${t('noClaimsFound')}</div>`;
  }

  // 利益冲突
  const conflictSection = document.getElementById('conflictSection');
  if (result.conflicts && result.conflicts.has_conflict) {
    conflictSection.style.display = 'block';
    document.getElementById('conflictDetails').innerHTML = `
      <div class="conflict-alert">
        <p>${result.conflicts.details || t('conflictDefault')}</p>
        ${result.conflicts.commercial_links && result.conflicts.commercial_links.length > 0
          ? `<p style="margin-top:6px">${t('commercialLinks')}: ${result.conflicts.commercial_links.join(', ')}</p>` : ''}
      </div>
    `;
  } else {
    conflictSection.style.display = 'none';
  }

  // 元信息
  if (result.meta) {
    document.getElementById('metaInfo').textContent =
      t('metaLatency', [
        (result.meta.latency_ms / 1000).toFixed(1),
        String(result.meta.llm_calls),
        String(result.meta.search_calls),
      ]);
  }
}

// 监听来自 Service Worker 的消息
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'VERIFY_RESULT' && message.payload && message.payload.result) {
    renderResult(message.payload.result);
  }
});
