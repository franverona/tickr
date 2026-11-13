'use client'

import dynamic from 'next/dynamic'
import { visit } from 'unist-util-visit'
import {
  convertOutlineList,
  detectTableDelimiter,
  insertAtCursor,
  uploadPlaceholder,
  toMarkdownTable,
  wrapSelectionAsLink,
} from '@/lib/paste-utils'

// Remark plugin: "1.1." isn't a list marker, so such sub-items end up in the
// parent item's paragraph; rebuild them as a nested ordered list
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

  // Update or add width on existing HTML img/video tags referencing this src
  // A whole `width` attribute (not data-width), quoted or bare
  const widthAttr = /(\s)width\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'/>]+)/i
  result = result.replace(
    /<(img|video)\b([^>]*?)(\s*\/)?>/gi,
    (match, tag: string, attrs: string, selfClose = '') => {
      if (!attrs.includes(src)) return match
      const sized = widthAttr.test(attrs)
        ? attrs.replace(widthAttr, `$1width="${newWidth}"`)
        : `${attrs} width="${newWidth}"`
      return `<${tag}${sized}${selfClose}>`
    },
  )

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
    // A proxy 413 or a crash page isn't JSON
    const error = await res
      .json()
      .then((b: { error?: string }) => b.error)
      .catch(() => undefined)
    throw new Error(error ?? `Upload failed (HTTP ${res.status})`)
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

export function makeImageHandlers(
  setValue: React.Dispatch<React.SetStateAction<string>>,
  onError: (message: string) => void,
) {
  async function handleFiles(files: File[], textarea: HTMLTextAreaElement) {
    // One insert for all files: the textarea's DOM value is stale until React
    // re-renders, so inserting per file would overwrite the earlier swaps
    const placeholders = files.map((f) => uploadPlaceholder(f.name))
    setValue(insertAtCursor(textarea, placeholders.join('')))
    for (const [i, file] of files.entries()) {
      const placeholder = placeholders[i]
      try {
        const url = await uploadFile(file)
        // Markdown has no video syntax, so videos go in as HTML (the sanitizer allows <video>)
        const markdown = file.type.startsWith('image/')
          ? `![${file.name}](${url})`
          : file.type.startsWith('video/')
            ? `<video src="${url}" controls></video>`
            : `[${file.name}](${url})`
        // Function replacer, so `$&` etc. in a file name stay literal
        setValue((v) => v.replace(placeholder, () => markdown))
      } catch (err) {
        setValue((v) => v.replace(placeholder, ''))
        onError(`Couldn't upload ${file.name}: ${err instanceof Error ? err.message : err}`)
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
