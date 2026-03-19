/**
 * Ask Twice — 结果卡片组件（多源分层版）
 * 
 * 在浮标按钮下方展示验证结果摘要。
 */
const ResultCard = {
  /**
   * 显示结果卡片
   */
  show(wrapperEl, result) {
    // 移除已有卡片
    const existing = wrapperEl.querySelector(`.${ASKTWICE.CSS_PREFIX}-result-card`);
    if (existing) existing.remove();

    const level = AskTwiceUtils.getScoreLevel(result.overall_score);
    
    const card = AskTwiceUtils.createElement('div', {
      className: `${ASKTWICE.CSS_PREFIX}-result-card`,
    });

    // 多源结果摘要
    let sourceSummary = '';
    if (result.claims && result.claims.length > 0) {
      const allSR = [];
      for (const c of result.claims) {
        const claimDomain = c.domain || '';
        for (const sr of (c.source_results || [])) {
          allSR.push({ ...sr, _claimDomain: claimDomain });
        }
      }
      if (allSR.length > 0) {
        sourceSummary = allSR.map(sr => {
          const icon = sr.score >= 70 ? '✅' : sr.score >= 40 ? '⚠️' : sr.result_count > 0 || sr.assessment ? '❌' : '⚪';
          const name = sr.engine.replace('llm:', '');
          const displayName = sr._claimDomain ? `${name}：${sr._claimDomain}` : name;
          return `<span class="${ASKTWICE.CSS_PREFIX}-card-src">${icon} ${displayName}</span>`;
        }).join('');
      }
    }

    // 回退到旧 claims
    if (!sourceSummary) {
      sourceSummary = this._renderClaims(result.claims || []);
    }

    card.innerHTML = `
      <div class="${ASKTWICE.CSS_PREFIX}-card-header">
        <div class="${ASKTWICE.CSS_PREFIX}-card-score" style="color: ${level.color}">
          <span class="${ASKTWICE.CSS_PREFIX}-card-score-num">${result.overall_score}</span>
          <span class="${ASKTWICE.CSS_PREFIX}-card-score-label">${level.label}</span>
        </div>
        <button class="${ASKTWICE.CSS_PREFIX}-card-close" title="${AskTwiceUtils.i18n('close')}">✕</button>
      </div>

      ${result.judgment ? `<div class="${ASKTWICE.CSS_PREFIX}-card-judgment">${AskTwiceUtils.truncate(result.judgment, 100)}</div>` : ''}

      <div class="${ASKTWICE.CSS_PREFIX}-card-sources">
        ${sourceSummary}
      </div>

      ${result.conflicts && result.conflicts.has_conflict ? `
        <div class="${ASKTWICE.CSS_PREFIX}-card-conflict">
          <span class="${ASKTWICE.CSS_PREFIX}-card-conflict-icon">⚠️</span>
          <span>${AskTwiceUtils.i18n('conflictDetected')}</span>
        </div>
      ` : ''}

      <div class="${ASKTWICE.CSS_PREFIX}-card-footer">
        <span class="${ASKTWICE.CSS_PREFIX}-card-powered">Powered by Ask Twice</span>
      </div>
    `;

    // 关闭按钮事件
    card.querySelector(`.${ASKTWICE.CSS_PREFIX}-card-close`).addEventListener('click', (e) => {
      e.stopPropagation();
      card.classList.add(`${ASKTWICE.CSS_PREFIX}-card-hide`);
      setTimeout(() => card.remove(), 300);
    });

    // 点击卡片外部关闭
    const closeOnOutside = (e) => {
      if (!card.contains(e.target) && !wrapperEl.contains(e.target)) {
        card.classList.add(`${ASKTWICE.CSS_PREFIX}-card-hide`);
        setTimeout(() => card.remove(), 300);
        document.removeEventListener('click', closeOnOutside);
      }
    };
    setTimeout(() => document.addEventListener('click', closeOnOutside), 100);

    wrapperEl.appendChild(card);

    // 入场动画
    requestAnimationFrame(() => {
      card.classList.add(`${ASKTWICE.CSS_PREFIX}-card-show`);
    });
  },

  /**
   * 渲染声明验证列表（兼容旧数据）
   */
  _renderClaims(claims) {
    if (claims.length === 0) {
      return `<div class="${ASKTWICE.CSS_PREFIX}-card-empty">${AskTwiceUtils.i18n('noClaimsFound')}</div>`;
    }

    return claims.slice(0, 5).map(claim => {
      const level = AskTwiceUtils.getScoreLevel(claim.score);
      const icon = claim.score >= 80 ? '✅' : claim.score >= 60 ? '⚠️' : '❌';
      
      return `
        <div class="${ASKTWICE.CSS_PREFIX}-card-claim">
          <span class="${ASKTWICE.CSS_PREFIX}-claim-icon">${icon}</span>
          <div class="${ASKTWICE.CSS_PREFIX}-claim-body">
            <div class="${ASKTWICE.CSS_PREFIX}-claim-text">${AskTwiceUtils.truncate(claim.text, 60)}</div>
            <div class="${ASKTWICE.CSS_PREFIX}-claim-meta">
              <span style="color: ${level.color}">${claim.score}${AskTwiceUtils.i18n('score')}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },
};
