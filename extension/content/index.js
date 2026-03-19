/**
 * Ask Twice — Content Script 入口
 * 
 * 此文件是注入到 AI 页面的主入口。
 * 负责检测当前平台并初始化提取器。
 */
(function () {
  'use strict';

  // 防止重复初始化
  if (window.__askTwiceInitialized) return;
  window.__askTwiceInitialized = true;

  // 缓存版本号 —— 代码更新后改这个数字即可强制清旧缓存
  const CACHE_VERSION = 2;
  try {
    chrome.storage.local.get('cacheVersion', (data) => {
      if ((data.cacheVersion || 0) < CACHE_VERSION) {
        chrome.storage.local.remove('verifyCache', () => {
          chrome.storage.local.set({ cacheVersion: CACHE_VERSION });
          console.log('[Ask Twice] 旧缓存已清除 (v' + CACHE_VERSION + ')');
        });
      }
    });
  } catch (e) { /* ignore */ }

  console.log('[Ask Twice] Content Script 加载完成');

  // 检测当前平台
  const platform = detectPlatform();
  
  if (!platform) {
    console.log('[Ask Twice] 当前页面不是已支持的 AI 平台，退出');
    return;
  }

  console.log(`[Ask Twice] 检测到平台: ${platform.name}`);

  // 等待页面基本加载完成后初始化
  function initWhenReady() {
    // 检查关键 DOM 是否就绪
    const selectors = platform.selectors.chatContainer.split(', ');
    const ready = selectors.some(sel => document.querySelector(sel));

    if (ready || document.readyState === 'complete') {
      AskTwiceExtractor.init(platform);
    } else {
      // 等待并重试
      setTimeout(initWhenReady, 1000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWhenReady);
  } else {
    initWhenReady();
  }

  // 初始化划词验证（在所有支持的页面上启用）
  if (typeof SelectionBubble !== 'undefined') {
    SelectionBubble.init();
  }

  // 监听来自 Service Worker 的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === ASKTWICE.MSG.VERIFY_RESULT || 
        message.type === ASKTWICE.MSG.VERIFY_ERROR) {
      // Service Worker 主动推送结果（用于 SidePanel 等场景）
      console.log('[Ask Twice] 收到 Service Worker 消息:', message.type);
    }
    return false;
  });
})();
