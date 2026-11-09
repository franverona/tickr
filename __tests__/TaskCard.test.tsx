// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TaskCard from '../components/TaskCard'
import { formatDueDate, localDateKey } from '../lib/dates'
import type { Tag, Task } from '../lib/types'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Fix the flaky test',
    description: '',
    tags: [],
    completed: false,
    archived: false,
    dueDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    completedAt: null,
    archivedAt: null,
    urls: [],
    ...overrides,
  }
}

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: 'tag-1',
    label: 'bug',
    color: 'bg-red-600 text-red-100 border-red-500',
    ...overrides,
  }
}

describe('TaskCard', () => {
  afterEach(() => cleanup())

  it('renders the task title', () => {
    render(<TaskCard task={makeTask()} tags={[]} isSelected={false} onClick={() => {}} />)
    expect(screen.getByText('Fix the flaky test')).toBeInTheDocument()
  })

  it('renders a tag badge for each tag on the task', () => {
    const tag = makeTag()
    render(
      <TaskCard
        task={makeTask({ tags: [tag.id] })}
        tags={[tag]}
        isSelected={false}
        onClick={() => {}}
      />,
    )
    expect(screen.getByText('bug')).toBeInTheDocument()
  })

  it('renders a due-date badge when the task has a due date', () => {
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 1)
    const dueDateStr = dueDate.toISOString().slice(0, 10)
    render(
      <TaskCard
        task={makeTask({ dueDate: dueDateStr })}
        tags={[]}
        isSelected={false}
        onClick={() => {}}
      />,
    )
    expect(screen.getByText(formatDueDate(dueDateStr))).toBeInTheDocument()
  })

  it.each([
    [2, 'sky'],
    [10, 'surface'],
  ])('colors a badge due in %i days with %s', (days, color) => {
    const due = new Date()
    due.setDate(due.getDate() + days)
    const dueDate = localDateKey(due)
    render(
      <TaskCard task={makeTask({ dueDate })} tags={[]} isSelected={false} onClick={() => {}} />,
    )
    expect(screen.getByText(formatDueDate(dueDate)).className).toContain(`text-${color}-300`)
  })

  it('shows checklist progress when the description has checkboxes', () => {
    render(
      <TaskCard
        task={makeTask({ description: '- [x] a\n- [ ] b\n- [ ] c' })}
        tags={[]}
        isSelected={false}
        onClick={() => {}}
      />,
    )
    expect(screen.getByTitle('1 of 3 checklist items done')).toHaveTextContent('1/3')
  })

  it('links each ticket and review once, without opening the task', () => {
    const onClick = vi.fn()
    const jira = 'https://acme.atlassian.net/browse/NDC-1'
    const mr = 'https://gitlab.com/g/p/-/merge_requests/42'
    const urls = [jira, mr, jira, 'https://example.com/notes'].map((url, i) => ({
      id: `u${i}`,
      url,
      label: 'x',
    }))
    render(<TaskCard task={makeTask({ urls })} tags={[]} isSelected={false} onClick={onClick} />)

    const links = screen.getAllByRole('link')
    expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['NDC-1', jira],
      ['MR !42', mr],
    ])
    expect(links[0]).toHaveAttribute('target', '_blank')
    fireEvent.click(links[0])
    expect(onClick).not.toHaveBeenCalled()
  })

  it('hides ticket links in select mode', () => {
    const urls = [{ id: 'u1', url: 'https://github.com/o/r/pull/1', label: 'PR' }]
    render(
      <TaskCard
        task={makeTask({ urls })}
        tags={[]}
        isSelected={false}
        onClick={() => {}}
        selectMode
      />,
    )
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('calls onClick exactly once when clicked', () => {
    const onClick = vi.fn()
    render(<TaskCard task={makeTask()} tags={[]} isSelected={false} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('reflects the checked prop via aria-checked in select mode', () => {
    const { rerender } = render(
      <TaskCard
        task={makeTask()}
        tags={[]}
        isSelected={false}
        onClick={() => {}}
        selectMode
        checked={false}
      />,
    )
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'false')

    rerender(
      <TaskCard
        task={makeTask()}
        tags={[]}
        isSelected={false}
        onClick={() => {}}
        selectMode
        checked={true}
      />,
    )
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true')
  })

  it('strips a markdown link down to its label, not a stray trailing "("', () => {
    render(
      <TaskCard
        task={makeTask({ description: '[Docs](https://example.com/docs) has the details' })}
        tags={[]}
        isSelected={false}
        onClick={() => {}}
      />,
    )
    expect(screen.getByText('Docs has the details')).toBeInTheDocument()
  })
})
