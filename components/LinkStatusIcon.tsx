import type { LinkStatus } from '@/lib/types'

// Keyed by stored status; a missing (or unknown) one means still in review
const STATUSES = {
  review: {
    label: 'In review',
    className: 'text-amber-400',
    icon: (
      <>
        <circle cx="18" cy="18" r="3" />
        <circle cx="6" cy="6" r="3" />
        <path d="M13 6h3a2 2 0 0 1 2 2v7" />
        <line x1="6" y1="9" x2="6" y2="21" />
      </>
    ),
  },
  draft: {
    label: 'Draft',
    className: 'text-surface-400',
    icon: (
      <>
        <circle cx="18" cy="18" r="3" />
        <circle cx="6" cy="6" r="3" />
        <path d="M18 6V5" />
        <path d="M18 11v-1" />
        <line x1="6" y1="9" x2="6" y2="21" />
      </>
    ),
  },
  merged: {
    label: 'Merged',
    className: 'text-purple-400',
    icon: (
      <>
        <circle cx="18" cy="18" r="3" />
        <circle cx="6" cy="6" r="3" />
        <path d="M6 21V9a9 9 0 0 0 9 9" />
      </>
    ),
  },
  closed: {
    label: 'Closed',
    className: 'text-red-400',
    icon: (
      <>
        <circle cx="6" cy="6" r="3" />
        <path d="M6 9v12" />
        <path d="m21 3-6 6" />
        <path d="m21 9-6-6" />
        <path d="M18 11.5V15" />
        <circle cx="18" cy="18" r="3" />
      </>
    ),
  },
}

function meta(status: LinkStatus | undefined) {
  return status && Object.hasOwn(STATUSES, status) ? STATUSES[status] : STATUSES.review
}

export function linkStatusLabel(status: LinkStatus | undefined): string {
  return meta(status).label
}

// In review → merged → closed → in review
export function nextLinkStatus(status: LinkStatus | undefined): LinkStatus | null {
  return status === 'merged' ? 'closed' : status === 'closed' ? null : 'merged'
}

export function LinkStatusIcon({ status, size }: { status: LinkStatus | undefined; size: number }) {
  const { className, icon } = meta(status)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {icon}
    </svg>
  )
}
