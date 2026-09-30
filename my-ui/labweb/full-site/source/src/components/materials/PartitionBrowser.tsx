'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  ChevronLeft,
  Download,
  Files,
  FolderInput,
  FolderPlus,
  Loader2,
  Pencil,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { FileTree } from '@/components/workspace/resource/FileTree'
import { FilePreview } from '@/components/workspace/resource/FilePreview'
import { FolderContents } from '@/components/materials/FolderContents'
import type { MaterialEntryView } from '@/lib/material-partitions/entries'
import {
  createMaterialPartitionFolder,
  deleteMaterialPartitionEntry,
  moveMaterialPartitionEntry,
} from '@/actions/material-partition-entry'
import { uploadMaterialPartitionFiles } from '@/lib/chunked-upload'

interface PartitionBrowserProps {
  partitionId: string
  entries: MaterialEntryView[]
  selectedEntry: MaterialEntryView | null
  canEdit: boolean
  canDeleteSelected: boolean
}

export function PartitionBrowser({
  partitionId,
  entries,
  selectedEntry,
  canEdit,
  canDeleteSelected,
}: PartitionBrowserProps) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const [treeOpen, setTreeOpen] = useState(false)
  const [movePickerOpen, setMovePickerOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const entryById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries])

  // 파일을 고르면 미리보기, 폴더를 고르면(또는 아무것도 안 고르면) 그 폴더의 목록을 본다.
  const isFileSelected = selectedEntry?.kind === 'FILE'
  const currentFolder = isFileSelected
    ? (selectedEntry?.parentId ? (entryById.get(selectedEntry.parentId) ?? null) : null)
    : selectedEntry

  const fileUrl = selectedEntry?.blob
    ? `/api/materials/partitions/${partitionId}/entries/${selectedEntry.id}/file`
    : null

  // 업로드는 지금 보고 있는 폴더 안으로 들어간다.
  const uploadBasePath = currentFolder?.normalizedPath ?? ''
  const archiveUrl = currentFolder
    ? `/api/materials/partitions/${partitionId}/archive?path=${encodeURIComponent(currentFolder.normalizedPath)}`
    : `/api/materials/partitions/${partitionId}/archive`

  /** 선택한 항목을 넣을 수 있는 폴더 목록 (자기 자신과 하위 폴더는 뺀다) */
  const moveTargets = useMemo(() => {
    if (!selectedEntry) return []
    const blocked = new Set<string>([selectedEntry.id])
    let changed = true
    while (changed) {
      changed = false
      for (const entry of entries) {
        if (entry.parentId && blocked.has(entry.parentId) && !blocked.has(entry.id)) {
          blocked.add(entry.id)
          changed = true
        }
      }
    }
    return entries
      .filter((entry) => entry.kind === 'FOLDER' && !blocked.has(entry.id))
      .filter((entry) => entry.id !== (selectedEntry.parentId ?? null))
      .sort((left, right) => left.normalizedPath.localeCompare(right.normalizedPath, 'ko'))
  }, [entries, selectedEntry])

  function selectPath(path: string) {
    const next = new URLSearchParams(searchParams.toString())
    next.set('path', path)
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
    setTreeOpen(false)
  }

  function clearSelection() {
    const next = new URLSearchParams(searchParams.toString())
    next.delete('path')
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
    setTreeOpen(false)
  }

  async function handleFiles(fileList: FileList | null, useRelativePath: boolean) {
    if (!fileList || fileList.length === 0) return
    setError(null)
    setMessage(null)
    setUploading(true)
    setProgress(0)

    const files = Array.from(fileList).map((file) => {
      const relative = useRelativePath
        ? (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
        : file.name
      return {
        file,
        relativePath: uploadBasePath ? `${uploadBasePath}/${relative}` : relative,
      }
    })

    try {
      const result = await uploadMaterialPartitionFiles({
        partitionId,
        files,
        onProgress: setProgress,
      })
      if (result.failedCount > 0) {
        const first = result.results.find((item) => !item.success)
        setError(`${result.failedCount}개 실패 — ${first?.error ?? '알 수 없는 오류'}`)
      }
      if (result.successCount > 0) {
        setMessage(`${result.successCount}개 업로드 완료`)
      }
      router.refresh()
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '업로드에 실패했습니다.')
    } finally {
      setUploading(false)
      setProgress(0)
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (folderInputRef.current) folderInputRef.current.value = ''
    }
  }

  function handleNewFolder() {
    const name = window.prompt('새 폴더 이름을 입력하세요.')
    if (!name?.trim()) return
    setError(null)
    startTransition(async () => {
      const result = await createMaterialPartitionFolder(
        partitionId,
        currentFolder?.id ?? null,
        name.trim()
      )
      if ('error' in result) setError(result.error)
      else router.refresh()
    })
  }

  function handleRename() {
    if (!selectedEntry) return
    const name = window.prompt('새 이름을 입력하세요.', selectedEntry.name)
    if (!name?.trim() || name.trim() === selectedEntry.name) return
    setError(null)
    startTransition(async () => {
      const result = await moveMaterialPartitionEntry(selectedEntry.id, { name: name.trim() })
      if ('error' in result) setError(result.error)
      else {
        clearSelection()
        router.refresh()
      }
    })
  }

  function handleMove(entryId: string, targetParentId: string | null) {
    setError(null)
    setMessage(null)
    setMovePickerOpen(false)
    startTransition(async () => {
      const result = await moveMaterialPartitionEntry(entryId, { targetParentId })
      if ('error' in result) {
        setError(result.error)
        return
      }
      const moved = entryById.get(entryId)
      const target = targetParentId ? entryById.get(targetParentId) : null
      setMessage(`'${moved?.name ?? '항목'}'을(를) ${target ? `'${target.name}' 안으로` : '최상위로'} 옮겼습니다.`)
      router.refresh()
    })
  }

  function handleDelete() {
    if (!selectedEntry) return
    const label = selectedEntry.kind === 'FOLDER' ? '폴더와 그 안의 모든 파일' : '파일'
    if (!window.confirm(`'${selectedEntry.name}' ${label}을(를) 삭제할까요? 되돌릴 수 없습니다.`)) {
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await deleteMaterialPartitionEntry(selectedEntry.id)
      if ('error' in result) setError(result.error)
      else {
        clearSelection()
        router.refresh()
      }
    })
  }

  const busy = uploading || pending
  const tree = (
    <FileTree
      entries={entries}
      selectedPath={selectedEntry?.normalizedPath ?? null}
      onSelect={selectPath}
      onMoveEntry={canEdit ? handleMove : undefined}
    />
  )

  return (
    <section className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center gap-2 border-y border-slate-200 py-3 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setTreeOpen(true)}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 lg:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <Files className="h-4 w-4" />
          파일
        </button>

        {canEdit ? (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              파일 업로드
            </button>
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              disabled={busy}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <Upload className="h-4 w-4" />
              폴더 업로드
            </button>
            <button
              type="button"
              onClick={handleNewFolder}
              disabled={busy}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <FolderPlus className="h-4 w-4" />
              새 폴더
            </button>
          </>
        ) : null}

        <div className="relative ml-auto flex items-center gap-2">
          {/* 파일이면 그 파일, 폴더면 폴더 전체를 ZIP으로 */}
          <a
            href={fileUrl ?? archiveUrl}
            download={fileUrl ? selectedEntry?.name : undefined}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <Download className="h-4 w-4" />
            {fileUrl ? '다운로드' : currentFolder ? '폴더 다운로드' : '전체 다운로드'}
          </a>

          {canEdit && selectedEntry ? (
            <button
              type="button"
              onClick={() => setMovePickerOpen((open) => !open)}
              disabled={busy}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <FolderInput className="h-4 w-4" />
              이동
            </button>
          ) : null}

          {movePickerOpen && selectedEntry ? (
            <div className="absolute right-0 top-11 z-20 w-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
              <div className="border-b border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-slate-700">
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {selectedEntry.name}
                </span>
                을(를) 옮길 위치
              </div>
              <div className="max-h-64 overflow-y-auto py-1">
                {selectedEntry.parentId !== null ? (
                  <button
                    type="button"
                    onClick={() => handleMove(selectedEntry.id, null)}
                    className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    최상위
                  </button>
                ) : null}
                {moveTargets.map((target) => (
                  <button
                    key={target.id}
                    type="button"
                    onClick={() => handleMove(selectedEntry.id, target.id)}
                    className="block w-full break-all px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {target.normalizedPath}
                  </button>
                ))}
                {moveTargets.length === 0 && selectedEntry.parentId === null ? (
                  <p className="px-3 py-4 text-center text-xs text-slate-500">
                    옮길 수 있는 폴더가 없습니다.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {canEdit && selectedEntry ? (
            <button
              type="button"
              onClick={handleRename}
              disabled={busy}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <Pencil className="h-4 w-4" />
              이름 변경
            </button>
          ) : null}
          {canDeleteSelected && selectedEntry ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-rose-200 bg-white px-3 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:bg-slate-900 dark:text-rose-300"
            >
              <Trash2 className="h-4 w-4" />
              삭제
            </button>
          ) : null}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => handleFiles(event.target.files, false)}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="hidden"
          // @ts-expect-error - 폴더 선택은 비표준 속성이지만 Chrome/Edge에서 동작한다.
          webkitdirectory=""
          directory=""
          onChange={(event) => handleFiles(event.target.files, true)}
        />
      </div>

      {uploading ? (
        <div className="mb-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">업로드 중… {progress}%</p>
        </div>
      ) : null}

      {error ? (
        <p className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </p>
      ) : null}
      {message && !error ? (
        <p className="mb-3 text-sm text-emerald-700 dark:text-emerald-400">{message}</p>
      ) : null}

      <div className="grid min-h-[620px] min-w-0 grid-cols-1 overflow-hidden rounded-lg border border-slate-200 bg-white lg:grid-cols-[260px_minmax(0,1fr)] dark:border-slate-800 dark:bg-slate-900">
        <aside className="hidden min-w-0 border-r border-slate-200 lg:block dark:border-slate-800">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:text-white">
            파일
          </div>
          <div className="max-h-[72vh] min-h-[560px] overflow-y-auto px-2">{tree}</div>
        </aside>

        <div className="min-w-0 overflow-hidden">
          {isFileSelected ? (
            <>
              {/* 미리보기에서 폴더 목록으로 돌아가는 길 (왼쪽 트리 말고도) */}
              <button
                type="button"
                onClick={() =>
                  currentFolder ? selectPath(currentFolder.normalizedPath) : clearSelection()
                }
                className="flex w-full items-center gap-2 border-b border-slate-200 px-4 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50"
              >
                <ChevronLeft className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {currentFolder ? `'${currentFolder.name}' 폴더로` : '최상위로'}
                </span>
              </button>
              {/*
                editableDraft는 반드시 false로 둔다. true로 켜면 CodePreview의 저장이
                workspace-resource-entry 액션을 타는데, 그 액션은 WorkspaceRevisionEntry를
                찾으므로 MaterialPartitionEntry id로는 절대 맞지 않는다.
              */}
              <FilePreview
                entries={entries}
                entry={selectedEntry}
                fileUrl={fileUrl}
                onlyOfficeConfig={null}
                onlyOfficeMode="view"
                documentServerUrl={null}
                editableDraft={false}
              />
            </>
          ) : (
            <FolderContents
              entries={entries}
              folder={currentFolder}
              partitionId={partitionId}
              canEdit={canEdit}
              onSelect={selectPath}
              onOpenRoot={clearSelection}
              onMove={handleMove}
            />
          )}
        </div>
      </div>

      {treeOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="파일 목록 닫기"
            onClick={() => setTreeOpen(false)}
            className="absolute inset-0 bg-slate-950/40"
          />
          <aside className="absolute inset-y-0 left-0 w-[min(86vw,320px)] overflow-y-auto bg-white shadow-xl dark:bg-slate-900">
            <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">파일</h2>
              <button type="button" onClick={() => setTreeOpen(false)} className="p-2" title="닫기">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-2">{tree}</div>
          </aside>
        </div>
      ) : null}
    </section>
  )
}
