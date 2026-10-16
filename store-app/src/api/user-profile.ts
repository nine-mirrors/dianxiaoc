/**
 * 个人资料编辑接口（姓名 / 电话 / 辖区）—— 独立契约文件。
 *
 * ⚠ 为什么单开一个文件：api/profile.ts 只负责「头像」闭环、api/index.ts 是全员共享入口，
 *   两者都在并行开发分工内；本模块只承载「资料三字段」这一条闭环，避免改动同一文件冲突。
 *
 * 接口：PATCH /api/v1/auth/profile
 *   body 仅传需要修改的字段（未传字段后端保持原值；空串=清除该字段）；
 *   后端校验长度：name ≤ 20、phone ≤ 20（宽松字符集）、region ≤ 30，超长返回 400。
 *   返回更新后的完整用户对象（含 avatarUrl / name / phone / region）。
 *
 * 与头像闭环共用同一端点：api/profile.ts 的 updateProfile 传 { avatarUrl }，
 * 本模块传 { name, phone, region }，互不覆盖对方的字段。
 */
import { request } from './client'
import type { User } from '@/types'

/** 可编辑的个人资料字段（全部可选，仅传需要修改的） */
export interface UserProfilePatch {
  /** 姓名（≤20 字；空串=清除，回落到账号绑定姓名） */
  name?: string
  /** 联系电话（≤20 字；宽松校验数字/空格/+ - ( )） */
  phone?: string
  /** 辖区（≤30 字自由文本） */
  region?: string
}

/**
 * PATCH /api/v1/auth/profile —— 保存当前登录用户的个人资料，返回更新后的用户对象。
 *
 * ⚠ 兼容两种返回形态：后端直接返回用户对象，或包一层 `{ user }`（防御式解包，不改变调用方写法）。
 */
export async function updateUserProfile(patch: UserProfilePatch): Promise<User> {
  const res = await request<User | { user?: User }>({
    path: '/api/v1/auth/profile',
    method: 'PATCH',
    body: patch,
  })
  return (res as { user?: User })?.user ?? (res as User)
}
