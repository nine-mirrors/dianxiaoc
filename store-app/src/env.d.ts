/// <reference types="vite/client" />

/**
 * 全局类型补充声明。
 *
 * Vue SFC 声明用于「宽松 TS」下让 `import Xxx from './Xxx.vue'` 不报错；
 * *.json 声明让 fixture JSON 可被直接 import 且获得宽松推断。
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

declare module '*.json' {
  const value: any
  export default value
}

interface ImportMetaEnv {
  readonly VITE_API_BASE: string
  readonly VITE_DEMO_SPEED: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
