/**
 * Ask Twice — 结果卡片组件
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

    card.innerHTML = `
      <div class="${ASKTWICE.CSS_PREFIX}-card-header">
        <div class="${ASKTWICE.CSS_PREFIX}-card-score" style="color: ${level.color}">
          <span class="${ASKTWICE.CSS_PREFIX}-card-score-num">${result.overall_score}</span>
          <span class="${ASKTWICE.CSS_PREFIX}-card-score-label">${level.label}</span>
        </div>
        <button class="${ASKTWICE.CSS_PREFIX}-card-close" title="关闭">✕</button>
      </div>

      <div class="${ASKTWICE.CSS_PREFIX}-card-claims">
        ${this._renderClaims(result.claims || [])}
      </div>

      ${result.conflicts && result.conflicts.has_conflict ? `
        <div class="${ASKTWICE.CSS_PREFIX}-card-conflict">
          <span class="${ASKTWICE.CSS_PREFIX}-card-conflict-icon">⚠️</span>
          <span>检测到潜在利益冲突</span>
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
   * 渲染声明验证列表
   */
  _renderClaims(claims) {
    if (claims.length === 0) {
      return `<div class="${ASKTWICE.CSS_PREFIX}-card-empty">未提取到可验证的事实声明</div>`;
    }

    return claims.slice(0, 5).map(claim => {
      const level = AskTwiceUtils.getScoreLevel(claim.score);
      const sourceCount = (claim.sources || []).length;
      const icon = claim.score >= 80 ? '✅' : claim.score >= 60 ? '⚠️' : '❌';
      
      return `
        <div class="${ASKTWICE.CSS_PREFIX}-card-claim">
          <span class="${ASKTWICE.CSS_PREFIX}-claim-icon">${icon}</span>
          <div class="${ASKTWICE.CSS_PREFIX}-claim-body">
            <div class="${ASKTWICE.CSS_PREFIX}-claim-text">${AskTwiceUtils.truncate(claim.text, 60)}</div>
            <div class="${ASKTWICE.CSS_PREFIX}-claim-meta">
              <span style="color: ${level.color}">${claim.score}分</span>
              <span>· ${sourceCount} 个来源</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },
};
