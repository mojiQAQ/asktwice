/**
 * Ask Twice — SidePanel 逻辑
 * 
 * 监听来自 Service Worker 的验证结果并展示。
 */

// 分数等级配置（SidePanel 独立环境，需要自己定义）
const SCORE_LEVELS = {
  HIGH:              { min: 80, label: '高可信', color: '#10B981' },
  NEEDS_VERIFICATION:{ min: 60, label: '待验证', color: '#F59E0B' },
  LOW:               { min: 40, label: '低可信', color: '#F97316' },
  UNRELIABLE:        { min: 0,  label: '不可信', color: '#EF4444' },
};

function getScoreLevel(score) {
  if (score >= 80) return SCORE_LEVELS.HIGH;
  if (score >= 60) return SCORE_LEVELS.NEEDS_VERIFICATION;
  if (score >= 40) return SCORE_LEVELS.LOW;
  return SCORE_LEVELS.UNRELIABLE;
}

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
            <div class="claim-score" style="color:${cl.color}">${claim.score} 分</div>
            ${sources ? `<div class="claim-sources">来源: ${sources}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  } else {
    claimsList.innerHTML = '<div style="color:#9CA3AF;text-align:center;padding:16px">未提取到可验证的声明</div>';
  }

  // 利益冲突
  const conflictSection = document.getElementById('conflictSection');
  if (result.conflicts && result.conflicts.has_conflict) {
    conflictSection.style.display = 'block';
    document.getElementById('conflictDetails').innerHTML = `
      <div class="conflict-alert">
        <p>${result.conflicts.details || '检测到潜在利益冲突或商业推荐倾向'}</p>
        ${result.conflicts.commercial_links && result.conflicts.commercial_links.length > 0
          ? `<p style="margin-top:6px">商业链接: ${result.conflicts.commercial_links.join(', ')}</p>` : ''}
      </div>
    `;
  } else {
    conflictSection.style.display = 'none';
  }

  // 元信息
  if (result.meta) {
    document.getElementById('metaInfo').textContent =
      `耗时 ${(result.meta.latency_ms / 1000).toFixed(1)}s · ${result.meta.llm_calls} 次 LLM · ${result.meta.search_calls} 次搜索`;
  }
}

// 监听来自 Service Worker 的消息
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'VERIFY_RESULT' && message.payload && message.payload.result) {
    renderResult(message.payload.result);
  }
});
