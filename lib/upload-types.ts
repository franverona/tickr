// Extension → MIME for every file type /api/upload accepts. Shared by the
// upload route (what it accepts), the uploads route (Content-Type) and
// client-side import (re-uploading a backup).
export const UPLOAD_EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  webm: 'video/webm',
  zip: 'application/zip',
}
