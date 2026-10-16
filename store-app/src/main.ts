import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { installAppErrorHandler } from './composables/useAppErrorHandler'

import './styles/tokens.css'
import './styles/global.css'
import './styles/motion.css'

// ★ 动画策略：始终启用，不受系统 prefers-reduced-motion 影响。
// 实测结论（浏览器探针）：内联注入的 transition/animation 时长未被浏览器压成 0，
// 即浏览器本身不抑制作者 CSS 动画；此前"动画消失"的真因是本项目自带的
// @media (prefers-reduced-motion: reduce) 兜底，现已在各文件统一清除。
// 这里落一个 data-allow-motion 标记，供 styles/motion.css 的再断言规则选择器使用。
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-allow-motion', 'true')
}

const app = createApp(App)

// ★ 稳定性安全网最先注册（早于 pinia/router 与 mount）：
// 组件渲染期异常从这一刻起即可被捕获，杜绝整页白屏
installAppErrorHandler(app)

app.use(createPinia())
app.use(router)

app.mount('#app')
