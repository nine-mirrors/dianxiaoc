import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
// v2 起改为具名导出 viteSingleFile（默认导出会导致 ESM 加载报错）
import { viteSingleFile } from 'vite-plugin-singlefile'

/**
 * Vite 配置。
 *
 * 三条关键约定（见 ARCHITECTURE.md 铁律 2 / §8.1）：
 *  1. base: './' —— 构建产物可放任意目录，配合 hash 路由实现「双击即开」。
 *  2. public/stores/** 的图片在运行时通过相对 URL 访问，因此路由必须用 hash 模式，
 *     否则嵌套路由下相对 URL 会被解析到错误目录。
 *  3. build:single（--mode single）额外挂载 vite-plugin-singlefile，
 *     把 JS/CSS 内联进单个 index.html，作为现场演示的灾备方案。
 */
export default defineConfig(({ command, mode }) => {
  const useSingleFile = command === 'build' && mode === 'single'

  return {
    base: './',
    plugins: [
      vue(),
      ...(useSingleFile
        ? [viteSingleFile({ removeViteModuleLoader: true, useRecommendedBuildConfig: true })]
        : []),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: false,
    },
    /**
     * 依赖预打包：一次性把全部运行时依赖列全。
     * 避免演示中途 Vite 触发「二次预打包」（会重建 node_modules/.vite 临时目录），
     * 保证 demo 全程零抖动。
     */
    optimizeDeps: {
      include: ['vue', 'vue-router', 'pinia', 'echarts'],
    },
    preview: {
      host: '127.0.0.1',
      port: 4173,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      assetsInlineLimit: 4096,
      chunkSizeWarningLimit: 1200,
    },
  }
})
