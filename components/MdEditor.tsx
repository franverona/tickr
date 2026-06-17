'use client'

import dynamic from 'next/dynamic'
import { visit } from 'unist-util-visit'
import {
  convertOutlineList,
  detectTableDelimiter,
  insertAtCursor,
  toMarkdownTable,
  wrapSelectionAsLink,
} from '@/lib/paste-utils'

// Remark plugin: finds "X.X. text" sub-items that were merged into a parent
// list item's paragraph (because "1.1." is not a valid markdown list marker)
// and restructures them as a proper nested ordered list in the AST.
export function remarkOutlineList() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tree: any) => {
    const SUB_RE = /^\s*(\d+(?:\.\d+)+)\.[ \t]+(.+)$/
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visit(tree, 'listItem', (listItem: any) => {
      for (let ci = 0; ci < listItem.children.length; ci++) {
        const para = listItem.children[ci]
        if (para.type !== 'paragraph') continue

        for (let ti = 0; ti < para.children.length; ti++) {
          const node = para.children[ti]
          if (node.type !== 'text') continue

          const lines: string[] = node.value.split('\n')
          if (!lines.some((l: string) => SUB_RE.test(l))) continue

          const mainLines: string[] = []
          const subItems: { num: number; text: string }[] = []
          for (const line of lines) {
            const m = line.match(SUB_RE)
            if (m) {
              subItems.push({ num: parseInt(m[1].split('.').pop()!), text: m[2].trim() })
            } else {
              mainLines.push(line)
            }
          }

          para.children[ti] = { type: 'text', value: mainLines.join('\n') }
          listItem.children.splice(ci + 1, 0, {
            type: 'list',
            ordered: true,
            start: subItems[0].num,
            spread: false,
            children: subItems.map((item) => ({
              type: 'listItem',
              spread: false,
              checked: null,
              children: [{ type: 'paragraph', children: [{ type: 'text', value: item.text }] }],
            })),
          })
        }
      }
    })
  }
}

export function replaceImageWidth(markdown: string, src: string, newWidth: number): string {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // Replace markdown image syntax: ![alt](url) or ![alt](url "title")
  let result = markdown.replace(
    new RegExp(`!\\[([^\\]]*)\\]\\(${esc(src)}(\\s+"[^"]*")?\\)`, 'g'),
    (_, alt) => `<img src="${src}" alt="${alt}" width="${newWidth}">`,
  )

  // Update or add width on existing HTML img tags referencing this src
  result = result.replace(/<img\b([^>]*)>/gi, (match, attrs: string) => {
    if (!attrs.includes(src)) return match
    if (/\bwidth\s*=/i.test(attrs)) {
      return `<img${attrs.replace(/\bwidth\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/i, `width="${newWidth}"`)}>`
    }
    return `<img${attrs} width="${newWidth}">`
  })

  return result
}

export const MDEditor = dynamic(() => import('@uiw/react-md-editor'), {
  ssr: false,
})

export function MarkdownLink(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} target="_blank" rel="noopener noreferrer" />
}

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

const URL_RE = /^https?:\/\/\S+$/

function nodeToMd(node: Node, listDepth: number): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/[\t\r\n]+/g, ' ')
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const el = node as Element
  const tag = el.tagName.toLowerCase()
  const kids = () =>
    Array.from(el.childNodes)
      .map((c) => nodeToMd(c, listDepth))
      .join('')
  switch (tag) {
    case 'br':
      return '\n'
    case 'hr':
      return '\n---\n'
    case 'h1':
      return `\n# ${kids().trim()}\n`
    case 'h2':
      return `\n## ${kids().trim()}\n`
    case 'h3':
      return `\n### ${kids().trim()}\n`
    case 'h4':
      return `\n#### ${kids().trim()}\n`
    case 'h5':
      return `\n##### ${kids().trim()}\n`
    case 'h6':
      return `\n###### ${kids().trim()}\n`
    case 'p':
      return `\n${kids().trim()}\n`
    case 'b':
    case 'strong':
      return `**${kids()}**`
    case 'i':
    case 'em':
      return `*${kids()}*`
    case 's':
    case 'del':
      return `~~${kids()}~~`
    case 'code':
      return el.closest('pre') ? kids() : `\`${kids()}\``
    case 'pre':
      return `\n\`\`\`\n${el.textContent?.trim()}\n\`\`\`\n`
    case 'blockquote':
      return kids()
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n')
    case 'a': {
      const href = el.getAttribute('href') ?? ''
      const text = kids()
      return href && href !== text ? `[${text}](${href})` : text
    }
    case 'img': {
      const src = el.getAttribute('src') ?? ''
      const alt = el.getAttribute('alt') ?? ''
      return src ? `![${alt}](${src})` : ''
    }
    case 'ul':
    case 'ol': {
      const indent = '  '.repeat(listDepth)
      return (
        '\n' +
        Array.from(el.children)
          .filter((c) => c.tagName.toLowerCase() === 'li')
          .map((li, i) => {
            const prefix = tag === 'ul' ? `${indent}- ` : `${indent}${i + 1}. `
            const text = Array.from(li.childNodes)
              .map((c) => nodeToMd(c, listDepth + 1))
              .join('')
              .trimEnd()
            return `${prefix}${text}`
          })
          .join('\n') +
        '\n'
      )
    }
    case 'li':
      return kids()
    case 'table': {
      const rows = Array.from(el.querySelectorAll('tr'))
      if (!rows.length) return kids()
      const cells = rows
        .map((r) =>
          Array.from(r.querySelectorAll('th,td')).map((c) =>
            (c.textContent?.trim() ?? '').replace(/\|/g, '\\|'),
          ),
        )
        .filter((r) => r.length > 0)
      if (!cells.length) return ''
      const header = `| ${cells[0].join(' | ')} |`
      const sep = `| ${cells[0].map(() => '---').join(' | ')} |`
      const body = cells.slice(1).map((r) => `| ${r.join(' | ')} |`)
      return '\n' + [header, sep, ...body].join('\n') + '\n'
    }
    case 'head':
    case 'script':
    case 'style':
      return ''
    default:
      return kids()
  }
}

function htmlToMarkdown(html: string): string | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  if (
    !doc.body.querySelector(
      'b,strong,i,em,s,del,a[href],h1,h2,h3,h4,h5,h6,ul,ol,pre,code,table,blockquote',
    )
  )
    return null
  return (
    nodeToMd(doc.body, 0)
      .replace(/\n{3,}/g, '\n\n')
      .trim() || null
  )
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
    if (files.length) {
      e.preventDefault()
      handleFiles(files, e.currentTarget)
      return
    }

    const textarea = e.currentTarget
    const text = e.clipboardData.getData('text').trim()
    if (URL_RE.test(text) && textarea.selectionStart !== textarea.selectionEnd) {
      e.preventDefault()
      setValue(wrapSelectionAsLink(textarea, text))
      return
    }

    const htmlClip = e.clipboardData.getData('text/html')
    if (htmlClip) {
      const md = htmlToMarkdown(htmlClip)
      if (md) {
        e.preventDefault()
        setValue(insertAtCursor(textarea, md))
        return
      }
    }

    const outlineMd = convertOutlineList(text)
    if (outlineMd !== null) {
      e.preventDefault()
      setValue(insertAtCursor(textarea, outlineMd))
      return
    }

    const delimiter = detectTableDelimiter(text)
    const table = delimiter ? toMarkdownTable(text, delimiter) : null
    if (table) {
      e.preventDefault()
      setValue(insertAtCursor(textarea, table))
    }
  }

  return { onDrop, onPaste }
}
