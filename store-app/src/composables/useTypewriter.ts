/**
 * 打字机逐字输出（PRD 4.4-F：AI 回复带打字机效果，400ms/句）。
 *
 * 用法：
 *   const { display, typing, play } = useTypewriter()
 *   await play('这是一句 AI 回复…')
 */
import { ref, onUnmounted } from 'vue'

/** 每句之间的停顿（毫秒），对应 PRD 的 400ms/句 */
const SENTENCE_INTERVAL = 400
/** 每个字的输出间隔（毫秒） */
const CHAR_INTERVAL = 26

export interface UseTypewriterOptions {
  /** 每字符间隔，默认 26ms */
  charInterval?: number
  /** 句子间隔，默认 400ms */
  sentenceInterval?: number
}

/**
 * 创建打字机控制器。
 *
 * @param options 速度参数
 */
export function useTypewriter(options: UseTypewriterOptions = {}) {
  const { charInterval = CHAR_INTERVAL, sentenceInterval = SENTENCE_INTERVAL } = options

  /** 当前显示的文本 */
  const display = ref<string>('')
  /** 是否正在输出 */
  const typing = ref<boolean>(false)

  let charTimer: number | null = null
  let sentenceTimer: number | null = null

  /** 清理定时器 */
  function clearAll(): void {
    if (charTimer !== null) window.clearTimeout(charTimer)
    if (sentenceTimer !== null) window.clearTimeout(sentenceTimer)
    charTimer = null
    sentenceTimer = null
  }

  /** 立即结束（演示时可跳过动画直接看全文） */
  function finish(fullText: string): void {
    clearAll()
    display.value = fullText
    typing.value = false
  }

  /**
   * 播放打字机效果。
   *
   * @param fullText 待输出全文
   * @returns Promise，输出完成时 resolve
   */
  function play(fullText: string): Promise<void> {
    clearAll()
    display.value = ''
    typing.value = true

    return new Promise<void>((resolve) => {
      const sentences = (fullText ?? '').split('\n')
      let lineIdx = 0

      /** 逐字输出当前行 */
      const typeLine = (): void => {
        if (lineIdx >= sentences.length) {
          typing.value = false
          resolve()
          return
        }
        const line = sentences[lineIdx]
        let charIdx = 0

        const step = (): void => {
          charIdx += 1
          display.value = sentences.slice(0, lineIdx).join('\n') + (lineIdx > 0 ? '\n' : '') + line.slice(0, charIdx)
          if (charIdx < line.length) {
            charTimer = window.setTimeout(step, charInterval)
          } else {
            lineIdx += 1
            sentenceTimer = window.setTimeout(typeLine, line.length > 0 ? sentenceInterval : 0)
          }
        }

        if (line.length === 0) {
          lineIdx += 1
          display.value = sentences.slice(0, lineIdx).join('\n')
          typeLine()
        } else {
          step()
        }
      }

      typeLine()
    })
  }

  onUnmounted(clearAll)

  return { display, typing, play, finish, clearAll }
}

export default useTypewriter
