'use client'

// 폴더를 선택했을 때 오른쪽 넓은 영역에 뜨는 탐색기식 목록.
// 미리보기 대신 파일 이름을 그대로 다 보여주는 게 목적이라 이름 칸은 줄바꿈시킨다.

import { useMemo, useState } from 'react'
import {
  ChevronUp,
  Download,
  File as FileIcon,
  Folder,
  FolderOpen,
} from 'lucide-react'
import type { MaterialEntryView } from '@/lib/material-partitions/entries'

interface FolderContentsProps {
  entries: MaterialEntryView[]
  /** 현재 열려 있는 폴더. null이면 최상위 */
  folder: MaterialEntryView | null
  partitionId: string
  canEdit: boolean
  onSelect: (path: string) => void
  onOpenRoot: () => void
  /** 드래그로 옮겼을 때. targetParentId가 null이면 최상위로 */
  onMove: (entryId: string, targetParentId: string | null) => void
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`
}

function formatDay(date: Date) {
  const value = new Date(date)
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${value.getFullYear()}.${month}.${day}`
}

function sortRows(left: MaterialEntryView, right: MaterialEntryView) {
  if (left.kind !== right.kind) return left.kind === 'FOLDER' ? -1 : 1
  return left.name.localeCompare(right.name, 'ko')
}

export function FolderContents({
  entries,
  folder,
  partitionId,
  canEdit,
  onSelect,
  onOpenRoot,
  onMove,
}: FolderContentsProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [dropOnSelf, setDropOnSelf] = useState(false)

  const entryById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries])

  const rows = useMemo(() => {
    const parentId = folder?.id ?? null
    return entries
      .filter((entry) => {
        // 부모가 트리에서 사라진 항목은 최상위로 본다(FileTree와 같은 규칙).
        const key = entry.parentId && entryById.has(entry.parentId) ? entry.parentId : null
        return key === parentId
      })
      .sort(sortRows)
  }, [entries, entryById, folder])

  const parentFolder = folder?.parentId ? (entryById.get(folder.parentId) ?? null) : null
  const fileCount = rows.filter((row) => row.kind === 'FILE').length
  const folderCount = rows.length - fileCount

  const archiveUrl = folder
    ? `/api/materials/partitions/${partitionId}/archive?path=${encodeURIComponent(folder.normalizedPath)}`
    : `/api/materials/partitions/${partitionId}/archive`

  /** 자기 자신이나 자기 하위 폴더로는 옮길 수 없다 */
  function canDropInto(targetId: string | null) {
    if (!draggingId) return false
    if (draggingId === targetId) return false

    const dragged = entryById.get(draggingId)
    if (!dragged) return false
    if ((dragged.parentId ?? null) === targetId) return false

    if (targetId) {
      let cursor: string | null = targetId
      while (cursor) {
        if (cursor === draggingId) return false
        cursor = entryById.get(cursor)?.parentId ?? null
      }
    }
    return true
  }

  function handleDrop(targetId: string | null) {
    const entryId = draggingId
    setDraggingId(null)
    setDropTargetId(null)
    setDropOnSelf(false)
    if (entryId && canDropInto(targetId)) onMove(entryId, targetId)
  }

  const breadcrumb = folder ? folder.normalizedPath.split('/') : []

  return (
    <div
      className={`flex min-h-[560px] flex-col ${
        dropOnSelf ? 'bg-blue-50/60 dark:bg-blue-950/20' : ''
      }`}
      onDragOver={(event) => {
        if (!canDropInto(folder?.id ?? null)) return
        event.preventDefault()
        setDropOnSelf(true)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        setDropOnSelf(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        handleDrop(folder?.id ?? null)
      }}
    >
      {/* 현재 위치 + 폴더 통째 다운로드 */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
        <button
          type="button"
          onClick={onOpenRoot}
          className="text-sm font-semibold text-slate-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
        >
          최상위
        </button>
        {breadcrumb.map((segment, index) => {
          const path = breadcrumb.slice(0, index + 1).join('/')
          const isLast = index === breadcrumb.length - 1
          return (
            <span key={path} className="flex items-center gap-2 text-sm">
              <span className="text-slate-400">/</span>
              {isLast ? (
                <span className="font-semibold text-slate-900 dark:text-white">{segment}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(path)}
                  className="text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400"
                >
                  {segment}
                </button>
              )}
            </span>
          )
        })}

        <span className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-500">
            폴더 {folderCount} · 파일 {fileCount}
          </span>
          {fileCount + folderCount > 0 ? (
            <a
              href={archiveUrl}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              title={folder ? '이 폴더를 ZIP으로 내려받습니다' : '전체를 ZIP으로 내려받습니다'}
            >
              <Download className="h-3.5 w-3.5" />
              {folder ? '폴더 다운로드' : '전체 다운로드'}
            </a>
          ) : null}
        </span>
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto">
        {parentFolder || folder ? (
          <button
            type="button"
            onClick={() => (parentFolder ? onSelect(parentFolder.normalizedPath) : onOpenRoot())}
            onDragOver={(event) => {
              if (!draggingId) return
              event.stopPropagation()
              if (!canDropInto(parentFolder?.id ?? null)) return
              event.preventDefault()
              setDropTargetId('..')
            }}
            onDragLeave={() => setDropTargetId(null)}
            onDrop={(event) => {
              if (!draggingId) return
              event.stopPropagation()
              if (!canDropInto(parentFolder?.id ?? null)) return
              event.preventDefault()
              handleDrop(parentFolder?.id ?? null)
            }}
            className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-left text-sm text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${
              dropTargetId === '..' ? 'bg-blue-50 ring-1 ring-inset ring-blue-400 dark:bg-blue-950/40' : ''
            }`}
          >
            <ChevronUp className="h-4 w-4 shrink-0" />
            상위 폴더로
          </button>
        ) : null}

        {rows.length === 0 ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
            <Folder className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-700" />
            <p className="text-sm text-slate-500">이 폴더는 비어 있습니다.</p>
            {canEdit ? (
              <p className="mt-1 text-xs text-slate-400">
                위의 업로드 버튼을 쓰거나, 파일을 여기로 끌어다 놓으세요.
              </p>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((row) => {
              const isFolder = row.kind === 'FOLDER'
              const isDropTarget = dropTargetId === row.id
              const isDragging = draggingId === row.id

              return (
                <li
                  key={row.id}
                  draggable={canEdit}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', row.id)
                    setDraggingId(row.id)
                  }}
                  onDragEnd={() => {
                    setDraggingId(null)
                    setDropTargetId(null)
                    setDropOnSelf(false)
                  }}
                  onDragOver={(event) => {
                    if (!draggingId) return
                    // 행이 이벤트를 가져간다. 안 그러면 거부한 드롭이 컨테이너로 올라가
                    // '지금 폴더로 이동'으로 처리된다.
                    event.stopPropagation()
                    if (!isFolder || !canDropInto(row.id)) return
                    event.preventDefault()
                    setDropTargetId(row.id)
                  }}
                  onDragLeave={() => setDropTargetId((current) => (current === row.id ? null : current))}
                  onDrop={(event) => {
                    if (!draggingId) return
                    event.stopPropagation()
                    if (!isFolder || !canDropInto(row.id)) return
                    event.preventDefault()
                    handleDrop(row.id)
                  }}
                  className={`group flex items-start gap-3 px-4 py-2.5 transition-colors ${
                    isDropTarget
                      ? 'bg-blue-50 ring-1 ring-inset ring-blue-400 dark:bg-blue-950/40'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  } ${isDragging ? 'opacity-40' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(row.normalizedPath)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    {isFolder ? (
                      <Folder className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                    ) : (
                      <FileIcon className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
                    )}
                    <span className="min-w-0 flex-1">
                      {/* 이름은 자르지 않고 넓은 칸에서 줄바꿈시킨다 */}
                      <span className="block break-all text-sm font-medium text-slate-900 dark:text-white">
                        {row.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500 sm:hidden">
                        {row.blob ? `${formatSize(row.blob.size)} · ` : ''}
                        {formatDay(row.createdAt)}
                      </span>
                    </span>
                  </button>

                  <span className="hidden w-24 shrink-0 pt-0.5 text-right text-xs text-slate-500 sm:block">
                    {row.blob ? formatSize(row.blob.size) : '폴더'}
                  </span>
                  <span className="hidden w-28 shrink-0 truncate pt-0.5 text-right text-xs text-slate-500 lg:block">
                    {row.uploaderName ?? '-'}
                  </span>
                  <span className="hidden w-24 shrink-0 pt-0.5 text-right text-xs text-slate-500 sm:block">
                    {formatDay(row.createdAt)}
                  </span>

                  <a
                    href={
                      isFolder
                        ? `/api/materials/partitions/${partitionId}/archive?path=${encodeURIComponent(row.normalizedPath)}`
                        : `/api/materials/partitions/${partitionId}/entries/${row.id}/file`
                    }
                    download={isFolder ? undefined : row.name}
                    onClick={(event) => event.stopPropagation()}
                    title={isFolder ? '폴더를 ZIP으로 내려받기' : '내려받기'}
                    className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-300 transition hover:bg-slate-200 hover:text-slate-700 group-hover:text-slate-500 dark:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-100 dark:group-hover:text-slate-400"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
