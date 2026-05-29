'use client'

import { useState, useEffect } from 'react'
import type { Tag, Task } from '@/lib/types'
import { getTasks, getTags } from '@/app/actions'
import TaskCard from '@/components/TaskCard'
import TaskDetail from '@/components/TaskDetail'
import CreateTaskModal from '@/components/CreateTaskModal'
import Logo from '@/components/Logo'

export default function Page() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [tab, setTab] = useState<'active' | 'done'>('active')
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  useEffect(() => {
    Promise.all([getTasks(), getTags()]).then(([t, g]) => {
      setTasks(t)
      setTags(g)
      setIsLoading(false)
    })
  }, [])

  function handleTagCreated(tag: Tag) {
    setTags((prev) => [...prev, tag])
  }

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null

  const filteredTasks = tasks.filter((task) =>
    tab === 'active' ? !task.completed : task.completed,
  )

  function handleTaskUpdated(updated: Task) {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
    // Deselect if the task moved to the other tab (e.g. just completed or reopened)
    if (updated.id === selectedTaskId) {
      const stillInTab = tab === 'active' ? !updated.completed : updated.completed
      if (!stillInTab) setSelectedTaskId(null)
    }
  }

  function handleTaskDeleted(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id))
    if (selectedTaskId === id) setSelectedTaskId(null)
  }

  function handleTaskCreated(task: Task) {
    setTasks((prev) => [task, ...prev])
    setTab('active')
    setSelectedTaskId(task.id)
    setIsCreateOpen(false)
  }

  const hasNoTasks = !isLoading && tasks.length === 0

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-900">
      {/* Top bar */}
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-zinc-700 bg-zinc-900 px-4 py-2.5">
        <div className="mr-1 flex items-center gap-2">
          <Logo size={22} />
          <h1 className="text-base font-bold tracking-tight text-zinc-100">Tickr</h1>
        </div>

        <div className="ml-auto flex items-center gap-4">
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
          >
            <span className="text-base leading-none">+</span>
            New Task
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Task list */}
        <div
          className={`flex flex-shrink-0 flex-col border-r border-zinc-700 ${
            selectedTask ? 'w-[360px]' : 'w-full'
          }`}
        >
          <div className="flex h-10 items-center border-b border-zinc-700 px-4">
            <div className="flex h-full gap-5">
              {(['active', 'done'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTab(t)
                    setSelectedTaskId(null)
                  }}
                  className={`flex h-full items-center border-b-2 text-xs font-medium transition-colors ${
                    tab === t
                      ? 'border-zinc-300 text-zinc-100'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {t === 'active' ? 'Active' : 'Done'}
                </button>
              ))}
            </div>
            <span className="ml-auto text-xs text-zinc-500">
              {isLoading
                ? ''
                : `${filteredTasks.length} ${filteredTasks.length === 1 ? 'task' : 'tasks'}`}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {hasNoTasks ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-500">
                <p className="text-sm">No tasks yet</p>
                <button
                  onClick={() => setIsCreateOpen(true)}
                  className="text-sm text-blue-500 transition-colors hover:text-blue-400"
                >
                  Create your first task →
                </button>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-zinc-500">
                <p className="text-sm">
                  {tab === 'done' ? 'No completed tasks yet' : 'No active tasks'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    tags={tags}
                    isSelected={task.id === selectedTaskId}
                    onClick={() => setSelectedTaskId(task.id === selectedTaskId ? null : task.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Task detail panel */}
        {selectedTask ? (
          <div className="min-w-0 flex-1 overflow-hidden">
            <TaskDetail
              key={selectedTask.id}
              task={selectedTask}
              tags={tags}
              onUpdate={handleTaskUpdated}
              onDelete={handleTaskDeleted}
              onClose={() => setSelectedTaskId(null)}
              onTagCreated={handleTagCreated}
            />
          </div>
        ) : (
          !hasNoTasks && (
            <div className="hidden flex-1 items-center justify-center text-sm text-zinc-600 select-none md:flex">
              Select a task
            </div>
          )
        )}
      </div>

      {isCreateOpen && (
        <CreateTaskModal
          tags={tags}
          onCreated={handleTaskCreated}
          onClose={() => setIsCreateOpen(false)}
          onTagCreated={handleTagCreated}
        />
      )}
    </div>
  )
}
