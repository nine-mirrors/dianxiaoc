/**
 * Fixture Schema 版本（ARCHITECTURE §8.5）。
 *
 * ⚠ 结构变更必须 +1 版本号，并在此处登记变更说明。
 *   1.0 —— 初版：users / stores / skus / visits / diagnoses / dashboard / chat-qa
 */
export const SCHEMA_VERSION = '1.0'

/** 每个 fixture JSON 的根形态：均带 schemaVersion */
export interface FixtureRoot<T> {
  schemaVersion: string
  items: T
}

/**
 * 校验 fixture 版本。
 *
 * 不匹配只 console.warn，**绝不抛错阻断**，避免演示现场因数据变更翻车。
 *
 * @param name fixture 名称
 * @param root fixture 根对象
 * @returns 是否匹配
 */
export function checkFixture(name: string, root: { schemaVersion?: string }): boolean {
  const ok = root?.schemaVersion === SCHEMA_VERSION
  if (!ok) {
    // eslint-disable-next-line no-console
    console.warn(`[fixtures] ${name}.json 的 schemaVersion 为 ${root?.schemaVersion}，期望 ${SCHEMA_VERSION}，请检查数据结构是否已变更。`)
  }
  return ok
}
