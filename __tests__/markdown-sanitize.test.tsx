import MarkdownPreview from '@uiw/react-markdown-preview'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { sanitizeMarkdown } from '../lib/markdown-sanitize'

const render = (source: string) =>
  renderToStaticMarkup(<MarkdownPreview source={source} rehypePlugins={[sanitizeMarkdown]} />)

describe('sanitizeMarkdown', () => {
  it.each([
    ['srcdoc iframe', '<iframe srcdoc="<script>alert(1)</script>"></iframe>', /iframe|srcdoc/i],
    ['object', '<object data="/uploads/a.pdf"></object>', /<object/],
    ['embed', '<embed src="/uploads/a.pdf">', /<embed/],
    ['meta refresh', '<meta http-equiv="refresh" content="0;url=https://evil.test">', /<meta/],
    ['base', '<base href="https://evil.test/">', /<base/],
    ['style', '<style>body{display:none}</style>', /<style|display:none/],
    ['script', '<script>alert(1)</script>', /<script|alert/],
    ['form', '<form action="/x"><button formaction="/y">go</button></form>', /<form|formaction/i],
    ['event handler', '<img src="/a.png" onerror="alert(1)">', /onerror/i],
    ['javascript: link', '<a href="javascript:alert(1)">x</a>', /javascript:/],
  ])('removes %s', (_, source, forbidden) => {
    expect(render(source)).not.toMatch(forbidden)
  })

  it('keeps resized images', () => {
    expect(render('<img src="/uploads/a.png" alt="a" width="240">')).toMatch(
      /<img[^>]*src="\/uploads\/a\.png"[^>]*width="240"/,
    )
  })

  it('keeps collapsible sections', () => {
    const html = render('<details>\n<summary>More</summary>\n\nBody\n\n</details>')
    expect(html).toContain('<details>')
    expect(html).toContain('<summary>More</summary>')
  })

  it('keeps task mentions, checkboxes and tables', () => {
    const html = render('[t](#abc-123)\n\n- [x] done\n\n| a |\n|---|\n| b |')
    expect(html).toContain('href="#abc-123"')
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*checked/)
    expect(html).toContain('<table>')
  })

  it('keeps callouts, highlighted code, the copy button and heading anchors', () => {
    const html = render('# Title\n\n> [!NOTE]\n> hi\n\n```ts\nconst a = 1\n```')
    expect(html).toContain('id="title"')
    expect(html).toContain('class="anchor"')
    expect(html).toContain('octicon-copy')
    expect(html).toContain('data-code=')
    expect(html).toContain('code-line')
    expect(html).toMatch(/markdown-alert|octicon/)
  })
})
