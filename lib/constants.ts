import type { Tag } from './types'

// Predefined tags — seeded into the DB on first run.
// To add more defaults, add here; they'll be inserted on next startup.
export const PREDEFINED_TAGS: Tag[] = [
  {
    id: 'wip',
    label: 'WIP',
    color: 'bg-blue-600 text-blue-100 border-blue-500',
  },
  {
    id: 'uat',
    label: 'UAT',
    color: 'bg-purple-600 text-purple-100 border-purple-500',
  },
  {
    id: 'pipeline',
    label: 'Pipeline',
    color: 'bg-amber-600 text-amber-100 border-amber-500',
  },
  {
    id: 'blocked',
    label: 'Blocked',
    color: 'bg-red-600 text-red-100 border-red-500',
  },
  {
    id: 'waiting-for-review',
    label: 'Review',
    color: 'bg-orange-600 text-orange-100 border-orange-500',
  },
]

// Color options for new tags. All class strings appear literally here so
// Tailwind includes them in the CSS bundle even when applied dynamically.
export const COLOR_PALETTE = [
  {
    name: 'Blue',
    classes: 'bg-blue-600 text-blue-100 border-blue-500',
    dot: 'bg-blue-500',
  },
  {
    name: 'Purple',
    classes: 'bg-purple-600 text-purple-100 border-purple-500',
    dot: 'bg-purple-500',
  },
  {
    name: 'Amber',
    classes: 'bg-amber-600 text-amber-100 border-amber-500',
    dot: 'bg-amber-500',
  },
  {
    name: 'Red',
    classes: 'bg-red-600 text-red-100 border-red-500',
    dot: 'bg-red-500',
  },
  {
    name: 'Orange',
    classes: 'bg-orange-600 text-orange-100 border-orange-500',
    dot: 'bg-orange-500',
  },
  {
    name: 'Green',
    classes: 'bg-green-600 text-green-100 border-green-500',
    dot: 'bg-green-500',
  },
  {
    name: 'Teal',
    classes: 'bg-teal-600 text-teal-100 border-teal-500',
    dot: 'bg-teal-500',
  },
  {
    name: 'Pink',
    classes: 'bg-pink-600 text-pink-100 border-pink-500',
    dot: 'bg-pink-500',
  },
  {
    name: 'Indigo',
    classes: 'bg-indigo-600 text-indigo-100 border-indigo-500',
    dot: 'bg-indigo-500',
  },
  {
    name: 'Cyan',
    classes: 'bg-cyan-600 text-cyan-100 border-cyan-500',
    dot: 'bg-cyan-500',
  },
] as const
