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

  it('reports the status when the error response is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Payload Too Large', { status: 413 })),
    )
    const onError = vi.fn()
    const { onDrop } = makeImageHandlers((() => {}) as never, onError)

    onDrop({
      dataTransfer: { files: [new File(['x'], 'big.png', { type: 'image/png' })] },
      currentTarget: document.createElement('textarea'),
      preventDefault: () => {},
    } as never)

    await vi.waitFor(() =>
      expect(onError).toHaveBeenCalledWith("Couldn't upload big.png: Upload failed (HTTP 413)"),
    )
  })

  it('keeps a link for every dropped file', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const file = (init.body as FormData).get('file') as File
        return Response.json({ url: `/uploads/${file.name}` })
      }),
    )
    let value = ''
    const setValue = (next: string | ((v: string) => string)) => {
      value = typeof next === 'function' ? next(value) : next
    }
    const onError = vi.fn()
    const { onDrop } = makeImageHandlers(setValue as never, onError)

    // The textarea's DOM value stays '' throughout, as it does before React re-renders
    onDrop({
      dataTransfer: {
        files: [
          new File(['a'], 'a.png', { type: 'image/png' }),
          new File(['b'], 'b$&.pdf', { type: 'application/pdf' }),
          new File(['c'], 'c.mp4', { type: 'video/mp4' }),
        ],
      },
      currentTarget: document.createElement('textarea'),
      preventDefault: () => {},
    } as never)

    await vi.waitFor(() =>
      expect(value).toBe(
        '![a.png](/uploads/a.png)[b$&.pdf](/uploads/b$&.pdf)<video src="/uploads/c.mp4" controls></video>',
      ),
    )
    expect(onError).not.toHaveBeenCalled()
  })
})
