import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import type { Options } from 'rehype-sanitize'

// The preview enables rehype-raw, so without this description HTML runs in the
// app's origin. Only the preview's own classes survive, so a description can't
// borrow Tailwind classes to draw over the UI.
const PREVIEW_CLASSES = [
  'contains-task-list',
  'task-list-item',
  'footnotes',
  'data-footnote-backref',
  'sr-only',
  'anchor',
  'icon',
  'icon-link',
  'copied',
  'octicon',
  /^octicon-[\w-]+$/,
  // The heading-link icon sets className as one string, not a list
  /^octicon octicon-[\w-]+$/,
  /^language-[\w+-]+$/,
  'markdown-alert',
  /^markdown-alert-[\w-]+$/,
]

const schema: Options = {
  ...defaultSchema,
  // Keep heading ids as rehype-slug wrote them
  clobberPrefix: '',
  strip: ['script', 'style'],
  tagNames: [...(defaultSchema.tagNames ?? []), 'svg', 'path', 'video'],
  attributes: {
    ...defaultSchema.attributes,
    // No `name`: <img name="getElementById"> would shadow document properties
    '*': [
      ...(defaultSchema.attributes?.['*'] ?? []).filter((a) => a !== 'name'),
      ['className', ...PREVIEW_CLASSES],
      ['class', ...PREVIEW_CLASSES],
    ],
    a: [...(defaultSchema.attributes?.a ?? []), 'ariaHidden', 'tabIndex'],
    div: [...(defaultSchema.attributes?.div ?? []), 'data-code', 'dataCode'],
    svg: ['ariaHidden', 'viewBox', 'fill', 'height', 'width', 'version'],
    path: ['fillRule', 'd'],
    // No autoplay or poster: a description can't play sound or load other images on open
    video: ['src', 'controls', 'width'],
  },
}

export const sanitizeMarkdown: [typeof rehypeSanitize, Options] = [rehypeSanitize, schema]
