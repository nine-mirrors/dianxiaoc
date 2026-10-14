/*
 * 店小C PWA service worker —— 最小 passthrough 版本
 *
 * 唯一目的：满足 PWA「可安装」条件（成功注册一个 SW + 合法 manifest）。
 *
 * 故意不监听 'fetch' 事件、绝不调用 respondWith：
 *   → 所有页面/静态资源请求一律走浏览器默认网络流程，本 SW 不拦截、不缓存任何东西；
 *   → 因此不存在 Cache Storage 过期或「发版后用户拿到旧包」问题，无需版本号与清理逻辑；
 *   → HTTP 缓存仍由服务器响应头（Cache-Control/ETag）按原有策略管理。
 *
 * install 阶段 skipWaiting + activate 阶段 clients.claim，
 * 仅保证新 SW 立即接管，同样不涉及任何缓存。
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
