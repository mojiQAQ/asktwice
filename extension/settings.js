/**
 * Ask Twice — 设置页逻辑
 */

// ── i18n ──
function t(key, subs) {
  // 先检查手动设置的语言
  const lang = localStorage.getItem('asktwice_lang') || 'auto';
  if (lang !== 'auto' && I18N_DATA[lang] && I18N_DATA[lang][key]) {
    let msg = I18N_DATA[lang][key];
    if (subs) {
      const arr = Array.isArray(subs) ? subs : [subs];
      arr.forEach((v, i) => { msg = msg.replace(`$${i + 1}`, v); });
    }
    return msg;
  }
  // 回退到 chrome.i18n
  if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
    return chrome.i18n.getMessage(key, subs) || key;
  }
  return key;
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const msg = t(key);
    if (msg && msg !== key) el.textContent = msg;
  });
}

// ── 模型管理 ──
let customModels = [];
let modelCounter = 0;

function renderModels() {
  const container = document.getElementById('customModels');
  container.innerHTML = '';

  customModels.forEach((model, idx) => {
    const card = document.createElement('div');
    card.className = 'model-card';
    card.innerHTML = `
      <div class="mc-header">
        <span class="mc-name">${model.model || t('modelName')}</span>
        <button class="btn-remove" data-idx="${idx}">${t('removeModel')}</button>
      </div>
      <div class="model-fields">
        <div class="field full-width">
          <label>${t('baseUrl')}</label>
          <input type="text" data-field="base_url" data-idx="${idx}" value="${model.base_url || ''}" placeholder="https://api.openai.com/v1">
        </div>
        <div class="field">
          <label>${t('apiKey')}</label>
          <input type="password" data-field="api_key" data-idx="${idx}" value="${model.api_key || ''}" placeholder="sk-...">
        </div>
        <div class="field">
          <label>${t('modelName')}</label>
          <input type="text" data-field="model" data-idx="${idx}" value="${model.model || ''}" placeholder="gpt-4o">
        </div>
      </div>
    `;

    // 删除按钮
    card.querySelector('.btn-remove').addEventListener('click', () => {
      customModels.splice(idx, 1);
      renderModels();
    });

    // 输入框同步数据
    card.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', () => {
        const i = parseInt(input.getAttribute('data-idx'));
        const field = input.getAttribute('data-field');
        customModels[i][field] = input.value;
      });
    });

    container.appendChild(card);
  });
}

// ── 初始化 ──
document.addEventListener('DOMContentLoaded', async () => {
  // 加载已保存的设置
  const data = await chrome.storage.sync.get('asktwiceSettings');
  const cfg = data.asktwiceSettings || {};

  // 语言
  const lang = cfg.language || 'auto';
  document.getElementById('langSelect').value = lang;
  localStorage.setItem('asktwice_lang', lang);

  // Brave Key
  document.getElementById('braveKey').value = cfg.braveApiKey || '';

  // 自定义模型
  customModels = cfg.llmConfigs || [];
  renderModels();

  // 应用 i18n
  applyI18n();

  // 语言选择变化时即时刷新文字
  document.getElementById('langSelect').addEventListener('change', (e) => {
    localStorage.setItem('asktwice_lang', e.target.value);
    applyI18n();
    renderModels(); // 重新渲染模型卡片文字
  });

  // 添加模型按钮
  document.getElementById('addModelBtn').addEventListener('click', () => {
    customModels.push({ base_url: '', api_key: '', model: '' });
    renderModels();
  });

  // 保存按钮
  document.getElementById('saveBtn').addEventListener('click', async () => {
    const settings = {
      language: document.getElementById('langSelect').value,
      braveApiKey: document.getElementById('braveKey').value.trim(),
      llmConfigs: customModels.filter(m => m.api_key && m.model), // 只保存有效的
    };

    await chrome.storage.sync.set({ asktwiceSettings: settings });

    // 同步语言到 localStorage（供 content script 使用）
    localStorage.setItem('asktwice_lang', settings.language);

    const btn = document.getElementById('saveBtn');
    btn.textContent = t('saved');
    btn.classList.add('saved');
    setTimeout(() => {
      btn.textContent = t('saveSettings');
      btn.classList.remove('saved');
    }, 2000);
  });
});
