import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { installAppErrorHandler } from './composables/useAppErrorHandler'

import './styles/tokens.css'
import './styles/global.css'
import './styles/motion.css'

const app = createApp(App)

// ★ 稳定性安全网最先注册（早于 pinia/router 与 mount）：
// 组件渲染期异常从这一刻起即可被捕获，杜绝整页白屏
installAppErrorHandler(app)

app.use(createPinia())
app.use(router)

app.mount('#app')
