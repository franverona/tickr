'use client'

import dynamic from 'next/dynamic'

export const MDEditor = dynamic(() => import('@uiw/react-md-editor'), {
  ssr: false,
})

export const MDPreview = dynamic(() => import('@uiw/react-markdown-preview'), {
  ssr: false,
})

async function uploadFile(file: File): Promise<string> {
  const body = new FormData()
  body.append('file', file)
  const res = await fetch('/api/upload', { method: 'POST', body })
  if (!res.ok) {
    const { error } = await res.json()
    throw new Error(error ?? 'Upload failed')
  }
  const { url } = await res.json()
  return url as string
}

function pickFiles(list: FileList | null): File[] {
  if (!list) return []
  return Array.from(list)
}

function insertAtCursor(textarea: HTMLTextAreaElement, text: string): string {
  const { value, selectionStart, selectionEnd } = textarea
  return value.slice(0, selectionStart) + text + value.slice(selectionEnd)
}

export function makeImageHandlers(setValue: React.Dispatch<React.SetStateAction<string>>) {
  async function handleFiles(files: File[], textarea: HTMLTextAreaElement) {
    for (const file of files) {
      const placeholder = `\`Uploading ${file.name}…\``
      setValue(insertAtCursor(textarea, placeholder))
      try {
        const url = await uploadFile(file)
        const isImage = file.type.startsWith('image/')
        const markdown = isImage ? `![${file.name}](${url})` : `[${file.name}](${url})`
        setValue((v) => v.replace(placeholder, markdown))
      } catch (err) {
        setValue((v) => v.replace(placeholder, ''))
        console.error('File upload failed:', err)
      }
    }
  }

  function onDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    const files = pickFiles(e.dataTransfer.files)
    if (!files.length) return
    e.preventDefault()
    handleFiles(files, e.currentTarget)
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = pickFiles(e.clipboardData.files)
    if (!files.length) return
    e.preventDefault()
    handleFiles(files, e.currentTarget)
  }

  return { onDrop, onPaste }
}
