export interface WorkspaceEntryView {
  id: string
  revisionId: string
  logicalId: string
  parentId: string | null
  kind: string
  name: string
  normalizedPath: string
  sortOrder: number
  updatedAt: Date
  blob: {
    id: string
    sha256: string | null
    size: number
    mimeType: string
    originalFilename: string
    createdAt: Date
  } | null
}

export interface WorkspaceRevisionView {
  id: string
  baseRevisionId: string | null
  version: number | null
  status: string
  title: string | null
  note: string | null
  submittedAt: Date | null
  publishedAt: Date | null
  rejectedAt: Date | null
  createdAt: Date
  createdBy: { id: string; name: string | null } | null
  publishedBy: { id: string; name: string | null } | null
  entries: WorkspaceEntryView[]
}

export interface WorkspaceCommentView {
  id: string
  revisionId: string | null
  entryId: string | null
  parentId: string | null
  content: string
  resolvedAt: Date | null
  createdAt: Date
  updatedAt: Date
  author: { id: string; name: string | null; image: string | null }
  resolvedBy: { id: string; name: string | null } | null
}

export interface WorkspaceResourceDetailView {
  id: string
  workspaceId: string
  title: string
  description: string | null
  type: string
  filename: string | null
  url: string | null
  size: number | null
  mimeType: string | null
  currentRevisionId: string | null
  createdAt: Date
  updatedAt: Date
  workspace: { id: string; name: string }
  section: { id: string; name: string } | null
  uploader: { id: string; name: string | null; image: string | null }
  revisions: WorkspaceRevisionView[]
  comments: WorkspaceCommentView[]
}
