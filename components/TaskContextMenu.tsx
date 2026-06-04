'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  x: number
  y: number
  tab: 'active' | 'done' | 'archived'
  onComplete: () => void
  onReopen: () => void
  onArchive: () => void
  onUnarchive: () => void
  onDelete: () => void
  onClose: () => void
}

export default function TaskContextMenu({
  x,
  y,
  tab,
  onComplete,
  onReopen,
  onArchive,
  onUnarchive,
  onDelete,
  onClose,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let nx = x
    let ny = y
    if (x + rect.width > vw) nx = vw - rect.width - 8
    if (y + rect.height > vh) ny = vh - rect.height - 8
    if (nx !== x || ny !== y) setPos({ x: nx, y: ny })
  }, [x, y])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const item =
    'flex w-full items-center px-3 py-1.5 text-left text-sm text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100'
  const danger =
    'flex w-full items-center px-3 py-1.5 text-left text-sm text-red-400 transition-colors hover:bg-zinc-700 hover:text-red-300'

  return (
    <>
      <div
        className="fixed inset-0 z-30"
        onMouseDown={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        ref={menuRef}
        style={{ left: pos.x, top: pos.y }}
        className="fixed z-40 w-44 rounded-lg border border-zinc-700 bg-zinc-800 py-1 shadow-xl"
      >
        {tab === 'active' && (
          <button onClick={onComplete} className={item}>
            Mark as Complete
          </button>
        )}
        {tab === 'done' && (
          <button onClick={onReopen} className={item}>
            Reopen
          </button>
        )}
        {(tab === 'active' || tab === 'done') && (
          <button onClick={onArchive} className={item}>
            Archive
          </button>
        )}
        {tab === 'archived' && (
          <button onClick={onUnarchive} className={item}>
            Unarchive
          </button>
        )}
        <div className="my-1 border-t border-zinc-700" />
        {confirmDelete ? (
          <button onClick={onDelete} className={danger}>
            Confirm Delete?
          </button>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className={danger}>
            Delete
          </button>
        )}
      </div>
    </>
  )
}
