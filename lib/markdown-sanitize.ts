import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import type { Options } from 'rehype-sanitize'

// The preview always enables rehype-raw, so without this any HTML in a
// description (including from an imported backup) runs in the app's origin.
// Starts from GitHub's allowlist, plus what the preview itself generates: the
// copy button and heading icons (svg/path, class names, data-code).
// The classes the preview's own plugins add before sanitizing (GFM task lists
// and footnotes, alerts, heading icons, the copy button, code languages);
// Prism's token classes come after. Any other class is dropped, so a
// description can't borrow the app's Tailwind classes (`fixed inset-0 z-50`)
// to draw over the UI.
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
    // No `name`: with no clobberPrefix, <img name="getElementById"> would
    // shadow that document property (document's named properties override
    // built-ins), and nothing the preview generates needs it
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
