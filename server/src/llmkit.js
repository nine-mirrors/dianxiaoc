/**
 * LLM 流式工具包（llmkit.js）—— W2+ 各业务路由共用，与 index.js 既有
 * /api/v1/ai/* 的帧协议、降级矩阵保持完全一致（避免每个路由重写一遍）。
 *
 * 导出：
 *  - LLM              解析后的文本模型配置 { key, baseUrl, model }
 *  - sseGuard/setSseHeaders/ssePing  SSE 守卫与响应头
 *  - streamLLM(messages, res, fallback, opts?)  逐 token 流式 + 无 key/失败兜底
 *  - askLLMOnce(messages, opts?)                 非流式取整段（用于内部摘要）
 */
import { loadEnv } from './env.js'
loadEnv() // 模块顶层立即加载，保证 process.env 可读

export const LLM = {
  key: process.env.LLM_API_KEY || process.env.DASHSCOPE_API_KEY || '',
  baseUrl:
    process.env.LLM_BASE_URL ||
    'https://dashscope.aliyuncs.com/compatible-mode/v1',
  model: process.env.LLM_MODEL || 'qwen-plus',
}

/* ───────────────────────────── SSE 基础设施 ───────────────────────────── */

/** 判断当前请求是否可作为 SSE 响应；不可用时回 JSON 错误 */
export function sseGuard(req, res) {
  if (req.headers.accept && !/text\/event-stream|\*\/\*/.test(req.headers.accept)) {
    res.status(406).json({ code: 406, message: '该接口仅支持 SSE（Accept: text/event-stream）' })
    return false
  }
  return true
}

export function setSseHeaders(res) {
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // 关闭 Nginx 缓冲，保证逐 token 即时下发
  })
  res.flushHeaders?.()
}

/**
 * 流式调用 LLM。帧协议（前端 streamSse 已按此解析）：
 *   data: {"delta":"片段"}\n\n
 *   data: {"done":true,"source":"llm|fallback"}\n\n
 * 无 key / 上游失败 / 空响应 → 兜底文案切句下发，source 如实为 fallback；
 * 已收到真增量后中断 → 直接收尾 source=llm，绝不补兜底造成混排。
 */
export async function streamLLM(messages, res, fallback, opts = {}) {
  const temperature = opts.temperature ?? 0.7
  const maxTokens = opts.maxTokens ?? 600
  const alive = () => !res.writableEnded && !res.destroyed
  const sendFrame = (obj) => {
    if (alive()) res.write(`data: ${JSON.stringify(obj)}\n\n`)
  }

  async function sendFallback() {
    const text = String(fallback || '').trim() || '（暂时没有生成内容，请稍后再试）'
    const size = 18
    for (let i = 0; i < text.length; i += size) {
      if (!alive()) return 'fallback'
      sendFrame({ delta: text.slice(i, i + size) })
      await new Promise((r) => setTimeout(r, 24))
    }
    return 'fallback'
  }

  const controller = new AbortController()
  const onClose = () => controller.abort()
  res.on('close', onClose)
  const timer = setTimeout(() => controller.abort(), 25000)

  let source = 'fallback'
  let delivered = 0
  try {
    if (!LLM.key) {
      source = await sendFallback()
    } else {
      const upstream = await fetch(`${LLM.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LLM.key}` },
        body: JSON.stringify({ model: LLM.model, messages, temperature, max_tokens: maxTokens, stream: true }),
        signal: controller.signal,
      })
      if (!upstream.ok || !upstream.body) {
        source = await sendFallback()
      } else {
        const reader = upstream.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let finished = false
        while (!finished && alive()) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue
            const payload = trimmed.slice(5).trim()
            if (payload === '[DONE]') { finished = true; break }
            if (!payload) continue
            try {
              const j = JSON.parse(payload)
              const delta = j.choices?.[0]?.delta?.content
              if (delta) { sendFrame({ delta }); delivered += delta.length }
            } catch {
              /* 心跳/碎片帧跳过 */
            }
          }
        }
        source = delivered > 0 ? 'llm' : await sendFallback()
      }
    }
  } catch {
    if (delivered > 0) source = 'llm'
    else if (alive()) source = await sendFallback()
  } finally {
    clearTimeout(timer)
    res.off('close', onClose)
  }
  if (alive()) {
    sendFrame({ done: true, source })
    res.end()
  }
}

/** 非流式取一整段；失败/无 key 返回 null（调用方自行兜底） */
export async function askLLMOnce(messages, opts = {}) {
  if (!LLM.key) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const r = await fetch(`${LLM.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LLM.key}` },
      body: JSON.stringify({
        model: LLM.model,
        messages,
        temperature: opts.temperature ?? 0.6,
        max_tokens: opts.maxTokens ?? 800,
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!r.ok) return null
    const j = await r.json()
    return j.choices?.[0]?.message?.content || null
  } catch {
    clearTimeout(timer)
    return null
  }
}
