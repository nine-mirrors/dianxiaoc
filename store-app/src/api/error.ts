/**
 * API 错误类型（独立模块，避免 client.ts 与 mock/handlers.ts 形成循环依赖）。
 */
export class ApiError extends Error {
  code: number

  /**
   * @param code 业务码（非 0 视为业务错误）
   * @param message 友好提示文案（绝不直接展示浏览器原生报错）
   */
  constructor(code: number, message: string) {
    super(message)
    this.code = code
    this.name = 'ApiError'
  }
}

export default ApiError
