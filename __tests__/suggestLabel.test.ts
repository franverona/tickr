import { describe, expect, it } from 'vitest'
import { suggestLabel, ticketLabel } from '../lib/suggestLabel'

describe('ticketLabel', () => {
  it.each([
    ['https://acme.atlassian.net/browse/NDC-7921', 'NDC-7921'],
    ['https://jira.example.com/browse/AB2-15?focused=1', 'AB2-15'],
    ['https://gitlab.com/g/p/-/merge_requests/42', 'MR !42'],
    ['https://github.com/o/r/pull/7/files', 'PR #7'],
  ])('labels %s as %s', (url, label) => {
    expect(ticketLabel(url)).toBe(label)
  })

  it.each([
    'https://example.com/docs/page',
    'https://gitlab.com/g/p/-/pipelines/9',
    'javascript://x/browse/AB-1',
    'not a url',
  ])('ignores %s', (url) => {
    expect(ticketLabel(url)).toBeNull()
  })
})

describe('suggestLabel', () => {
  it('uses the ticket label first, then the other rules', () => {
    expect(suggestLabel('https://github.com/o/r/pull/7')).toBe('PR #7')
    expect(suggestLabel('https://gitlab.com/g/p/-/pipelines/9')).toBe('Pipeline - 9')
    expect(suggestLabel('https://example.com/docs/page')).toBe('page')
  })
})
