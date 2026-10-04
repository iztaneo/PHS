// Decides what a file really is from its bytes, never from its name or the type the browser sent (D09).
export interface DetectedType {
  mime: string;
  extension: string;
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const starts = (buffer: Buffer, bytes: number[], offset = 0) => bytes.every((byte, i) => buffer[offset + i] === byte);
const OOXML: [string, DetectedType][] = [
  ['word/document.xml', { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extension: 'docx' }],
  ['xl/workbook.xml', { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx' }],
  ['ppt/presentation.xml', { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', extension: 'pptx' }],
];

// Returns null for anything that is not an accepted image, a PDF or a current Office document without macros.
export function detectFileType(buffer: Buffer): DetectedType | null {
  if (starts(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: 'image/png', extension: 'png' };
  if (starts(buffer, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', extension: 'jpg' };
  if (starts(buffer, [0x52, 0x49, 0x46, 0x46]) && starts(buffer, [0x57, 0x45, 0x42, 0x50], 8)) return { mime: 'image/webp', extension: 'webp' };
  if (starts(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { mime: 'application/pdf', extension: 'pdf' };
  if (starts(buffer, [0x50, 0x4b, 0x03, 0x04])) {
    // Office files are ZIP archives; entry names are stored as plain text in their headers.
    const has = (name: string) => buffer.includes(name, 0, 'latin1');
    if (!has('[Content_Types].xml') || has('vbaProject.bin')) return null;
    return OOXML.find(([entry]) => has(entry))?.[1] ?? null;
  }
  return null;
}

// Keeps a readable name and forces the extension of the detected type.
export function safeFileName(original: string, extension: string): string {
  const base = original.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '').normalize('NFC')
    .replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 120);
  return `${base || 'evidencia'}.${extension}`;
}

export const isImage = (mime: string) => mime.startsWith('image/');
