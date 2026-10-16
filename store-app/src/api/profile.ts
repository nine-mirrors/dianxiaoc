/**
 * 个人账号相关接口（头像上传 / 绑定）—— 独立契约文件。
 *
 * ⚠ 为什么单开一个文件而不是写进 api/admin.ts / api/messages.ts：
 *   那两个文件由并行开发分工持有，本模块只负责「头像」这一条闭环，
 *   避免多人同时改同一文件产生冲突。公告置顶（pinAnnouncement）本应落在
 *   api/admin.ts，暂按同一理由落在此处，后续可并入 admin.ts / messages.ts。
 *
 * 所有请求走统一 `request<T>({ path, method, body, query })`：
 *  - 上传复用后端既有统一图片通道 POST /api/v1/uploads（base64 + 白名单 + 落盘）；
 *  - 头像绑定走 PATCH /api/v1/auth/profile；
 *  - 公告置顶走 POST /api/v1/messages/announcements/:id/pin（仅管理员）。
 */
import { request } from './client'
import type { User } from '@/types'
// 仅「只读引用」admin.ts 的公告类型（不修改该文件，避免与并行开发冲突）
import type { AnnouncementItem } from './admin'

/** 图片上传结果（与后端 saveUpload 返回一致） */
export interface UploadResult {
  /** 落盘照片 id */
  photoId: string
  /** 可访问的绝对 URL（形如 http://host/uploads/UP_xxx.jpg） */
  url: string
}

/**
 * POST /api/v1/uploads —— 统一图片上传（base64 → 落盘 → 返回 URL）。
 *
 * @param data base64 数据（含 `data:image/...;base64,` 前缀）
 * @param filename 原文件名（后端只取白名单扩展名 jpg/jpeg/png/webp）
 */
export async function uploadAvatarImage(data: string, filename: string): Promise<UploadResult> {
  return request<UploadResult>({
    path: '/api/v1/uploads',
    method: 'POST',
    body: { data, filename },
  })
}

/**
 * PATCH /api/v1/auth/profile —— 保存当前登录用户的头像，返回更新后的用户对象。
 *
 * ⚠ 兼容两种返回形态：后端直接返回用户对象，或包一层 `{ user }`
 *   （契约描述为「返回更新后的用户对象」，此处做防御式解包，不改变调用方写法）。
 *
 * @param avatarUrl 上游 uploadAvatarImage 拿到的 URL
 * @returns 更新后的用户对象（含 avatarUrl）
 */
export async function updateProfile(avatarUrl: string): Promise<User> {
  const res = await request<User | { user?: User }>({
    path: '/api/v1/auth/profile',
    method: 'PATCH',
    body: { avatarUrl },
  })
  return (res as { user?: User })?.user ?? (res as User)
}

/**
 * POST /api/v1/messages/announcements/:id/pin —— 公告置顶 / 取消置顶（仅管理员可用）。
 *
 * @param id 公告 id
 * @param pinned 目标置顶状态
 * @returns 更新后的公告对象（pinned 为 0 / 1）
 */
export async function pinAnnouncement(id: string, pinned: boolean): Promise<AnnouncementItem> {
  return request<AnnouncementItem>({
    path: `/api/v1/messages/announcements/${id}/pin`,
    method: 'POST',
    body: { pinned },
  })
}
