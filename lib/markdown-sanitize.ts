import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import type { Options } from 'rehype-sanitize'

// The preview always enables rehype-raw, so without this any HTML in a
// description (including from an imported backup) runs in the app's origin.
// Starts from GitHub's allowlist, plus what the preview itself generates: the
// copy button and heading icons (svg/path, class names, data-code).
const schema: Options = {
  ...defaultSchema,
  // Keep heading ids as rehype-slug wrote them
  clobberPrefix: '',
  strip: ['script', 'style'],
  tagNames: [...(defaultSchema.tagNames ?? []), 'svg', 'path'],
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'className', 'class'],
    a: [...(defaultSchema.attributes?.a ?? []), 'ariaHidden', 'tabIndex'],
    div: [...(defaultSchema.attributes?.div ?? []), 'data-code', 'dataCode'],
    svg: ['ariaHidden', 'viewBox', 'fill', 'height', 'width', 'version'],
    path: ['fillRule', 'd'],
  },
}

export const sanitizeMarkdown: [typeof rehypeSanitize, Options] = [rehypeSanitize, schema]
