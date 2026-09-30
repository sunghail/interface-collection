'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, FileText, Folder, FolderOpen } from 'lucide-react'
import type { WorkspaceEntryView } from './types'

interface FileTreeProps {
  entries: WorkspaceEntryView[]
  selectedPath: string | null
  onSelect: (path: string) => void
  /**
   * 넘기면 항목을 끌어서 폴더로 옮길 수 있게 된다.
   * 넘기지 않으면 드래그 자체가 꺼져 있어 기존 화면은 그대로다.
   * targetParentId가 null이면 최상위로 옮긴다는 뜻.
   */
  onMoveEntry?: (entryId: string, targetParentId: string | null) => void
}

function sortEntries(left: WorkspaceEntryView, right: WorkspaceEntryView) {
  if (left.kind !== right.kind) return left.kind === 'FOLDER' ? -1 : 1
  if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder
  return left.name.localeCompare(right.name, 'ko')
}

export function FileTree({ entries, selectedPath, onSelect, onMoveEntry }: FileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const entryById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries])
  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, WorkspaceEntryView[]>()

    for (const entry of entries) {
      const parentKey = entry.parentId && entryById.has(entry.parentId) ? entry.parentId : null
      const children = map.get(parentKey) ?? []
      children.push(entry)
      map.set(parentKey, children)
    }
    for (const children of map.values()) children.sort(sortEntries)
    return map
  }, [entries, entryById])

  useEffect(() => {
    const selected = entries.find((entry) => entry.normalizedPath === selectedPath)
    if (!selected) return

    setExpanded((current) => {
      const next = new Set(current)
      let parentId = selected.parentId
      while (parentId) {
        next.add(parentId)
        parentId = entryById.get(parentId)?.parentId ?? null
      }
      return next
    })
  }, [entries, entryById, selectedPath])

  function toggle(entryId: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(entryId)) next.delete(entryId)
      else next.add(entryId)
      return next
    })
  }

  /** 자기 자신이나 자기 하위 폴더로는 옮길 수 없다 */
  function canDropInto(targetId: string | null) {
    if (!onMoveEntry || !draggingId) return false
    if (draggingId === targetId) return false

    const dragged = entryById.get(draggingId)
    if (!dragged) return false
    if ((dragged.parentId ?? null) === targetId) return false

    let cursor = targetId
    while (cursor) {
      if (cursor === draggingId) return false
      cursor = entryById.get(cursor)?.parentId ?? null
    }
    return true
  }

  function handleDrop(targetId: string | null) {
    const entryId = draggingId
    const allowed = canDropInto(targetId)
    setDraggingId(null)
    setDropTargetId(null)
    if (entryId && allowed) onMoveEntry?.(entryId, targetId)
  }

  function renderRows(parentId: string | null, depth: number, ancestors: Set<string>) {
    return (childrenByParent.get(parentId) ?? []).map((entry) => {
      if (ancestors.has(entry.id)) return null

      const isFolder = entry.kind === 'FOLDER'
      const isExpanded = isFolder && expanded.has(entry.id)
      const isSelected = entry.normalizedPath === selectedPath
      const nextAncestors = new Set(ancestors).add(entry.id)

      return (
        <div key={entry.id} role="treeitem" aria-expanded={isFolder ? isExpanded : undefined}>
          <button
            type="button"
            draggable={Boolean(onMoveEntry)}
            onDragStart={(event) => {
              if (!onMoveEntry) return
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', entry.id)
              setDraggingId(entry.id)
            }}
            onDragEnd={() => {
              setDraggingId(null)
              setDropTargetId(null)
            }}
            onDragOver={(event) => {
              if (!draggingId) return
              // 행이 이벤트를 가져간다. 안 그러면 거부한 드롭이 컨테이너로 올라가
              // '최상위로 이동'으로 처리된다.
              event.stopPropagation()
              if (!isFolder || !canDropInto(entry.id)) return
              event.preventDefault()
              setDropTargetId(entry.id)
            }}
            onDragLeave={() =>
              setDropTargetId((current) => (current === entry.id ? null : current))
            }
            onDrop={(event) => {
              if (!draggingId) return
              event.stopPropagation()
              if (!isFolder || !canDropInto(entry.id)) return
              event.preventDefault()
              handleDrop(entry.id)
            }}
            onClick={() => {
              onSelect(entry.normalizedPath)
              if (isFolder) toggle(entry.id)
            }}
            className={`flex h-9 w-full min-w-0 items-center gap-2 rounded-md pr-2 text-left text-sm transition-colors ${
              isSelected
                ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            } ${
              dropTargetId === entry.id
                ? 'ring-1 ring-inset ring-blue-400 bg-blue-50 dark:bg-blue-950/40'
                : ''
            } ${draggingId === entry.id ? 'opacity-40' : ''}`}
            style={{ paddingLeft: `${8 + depth * 16}px` }}
            title={entry.normalizedPath}
          >
            {isFolder ? (
              <ChevronRight
                className={`h-3.5 w-3.5 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              />
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            {isFolder ? (
              isExpanded ? (
                <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
              ) : (
                <Folder className="h-4 w-4 shrink-0 text-amber-500" />
              )
            ) : (
              <FileText className="h-4 w-4 shrink-0 text-blue-500" />
            )}
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
          </button>
          {isExpanded && depth < 10 ? renderRows(entry.id, depth + 1, nextAncestors) : null}
        </div>
      )
    })
  }

  if (entries.length === 0) {
    return <p className="px-3 py-8 text-center text-sm text-slate-500">아직 파일이 없습니다.</p>
  }

  return (
    <div
      role="tree"
      aria-label="자료 파일"
      // 빈 곳에 떨어뜨리면 최상위로 옮긴다
      onDragOver={(event) => {
        if (!canDropInto(null)) return
        event.preventDefault()
        setDropTargetId('__root__')
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        setDropTargetId((current) => (current === '__root__' ? null : current))
      }}
      onDrop={(event) => {
        event.preventDefault()
        handleDrop(null)
      }}
      className={`min-h-full space-y-0.5 py-2 ${
        dropTargetId === '__root__' ? 'bg-blue-50/60 dark:bg-blue-950/20' : ''
      }`}
    >
      {renderRows(null, 0, new Set())}
    </div>
  )
}
