'use client'

import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null,
  )
}

/**
 * Traps Tab/Shift+Tab focus cycling within the returned container ref, moves
 * initial focus into it on mount (a specific element if given, otherwise the
 * first focusable one), and restores focus to whatever was focused before on
 * unmount. Intended for modal dialogs (role="dialog" aria-modal="true").
 */
export function useFocusTrap<T extends HTMLElement>(
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  const containerRef = useRef<T>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const initial = initialFocusRef?.current ?? getFocusable(container)[0]
    initial?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !container) return
      const items = getFocusable(container)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement

      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last || !container.contains(active)) {
        e.preventDefault()
        first.focus()
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => {
      container.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return containerRef
}
