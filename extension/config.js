/**
 * Ask Twice — 插件配置文件
 * 
 * 修改此文件即可切换后端地址，无需改动业务代码。
 * 部署到不同环境时只需修改 API_BASE_URL。
 */
const ASKTWICE_ENV = {
  API_BASE_URL: 'http://localhost:8001',

  // 每日免费验证次数
  FREE_DAILY_LIMIT: 20,

  // 缓存过期时间（毫秒） — 改为 0 禁用缓存以刷新旧数据
  CACHE_TTL: 0,
};
