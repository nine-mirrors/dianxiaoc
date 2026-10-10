/**
 * 待办任务 store（★ 跨角色闭环联动的落点）。
 *
 * 经理下派 → 后端落库 SQLite → 业代端 P2 刷新即可见；
 * 业代在 P2 点「标记完成」→ 契约层 updateTaskStatus 真落库（管理有回执）。
 *
 * ⚠ 标记完成只用契约层 `updateTaskStatus`，本 store 不再重复实现，避免两套口径。
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Task } from '@/types'
import { getTasks } from '@/api'

export const useTasksStore = defineStore('tasks', () => {
  const list = ref<Task[]>([])
  const loading = ref<boolean>(false)

  /** 未完成待办 */
  const openTasks = computed<Task[]>(() => list.value.filter((t) => t.status === 'open'))
  /** 待办数量 */
  const openCount = computed<number>(() => openTasks.value.length)

  /**
   * 拉取指定负责人的任务列表。
   *
   * @param assigneeId 业代 id
   */
  async function refresh(assigneeId: string): Promise<void> {
    loading.value = true
    try {
      const res = await getTasks(assigneeId)
      list.value = res.tasks
    } finally {
      loading.value = false
    }
  }

  /** 本地插入（下派成功后即时可见，避免再发一次请求） */
  function push(task: Task): void {
    list.value = [task, ...list.value]
  }

  return { list, loading, openTasks, openCount, refresh, push }
})
