// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeImageHandlers } from '../components/MdEditor'

describe('makeImageHandlers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('removes the placeholder and reports a failed upload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'File too large' }, { status: 413 })),
    )
    let value = ''
    const setValue = (next: string | ((v: string) => string)) => {
      value = typeof next === 'function' ? next(value) : next
    }
    const onError = vi.fn()
    const { onDrop } = makeImageHandlers(setValue as never, onError)

    onDrop({
      dataTransfer: { files: [new File(['x'], 'big.png', { type: 'image/png' })] },
      currentTarget: document.createElement('textarea'),
      preventDefault: () => {},
    } as never)

    await vi.waitFor(() =>
      expect(onError).toHaveBeenCalledWith("Couldn't upload big.png: File too large"),
    )
    expect(value).toBe('')
  })
})
