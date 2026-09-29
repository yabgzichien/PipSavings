import * as XLSX from 'xlsx-js-style';
import { docKindFromMime } from '../import';
import { kindFromUtterance } from './vision';
import type { AskPipEntryKind } from './catalog';

export type ComposerAttachKind = 'image' | 'pdf' | 'csv' | 'xlsx' | 'unsupported';

export const COMPOSER_PICKER_TYPES = [
  'image/*',
  'application/pdf',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

export type ComposerPickedAsset = {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
};

export type ComposerAttachment = {
  id: string;
  name: string;
  mime: string;
  uri: string;
  kind: Exclude<ComposerAttachKind, 'unsupported'>;
};

export type ComposerSendPlan =
  | { type: 'none' }
  | { type: 'pick_kind' }
  | { type: 'vision'; kind: AskPipEntryKind; utterance: string }
  | { type: 'turn'; utterance: string };

export function composerAttachKind(mime: string, name: string): ComposerAttachKind {
  const doc = docKindFromMime(mime, name);
  if (doc === 'csv') return 'csv';
  if (doc === 'xlsx') return 'xlsx';
  if (doc === 'binary') {
    const lower = `${mime} ${name}`.toLowerCase();
    if (mime.toLowerCase() === 'application/pdf' || lower.includes('.pdf')) return 'pdf';
    return 'image';
  }
  return 'unsupported';
}

function fallbackMime(kind: Exclude<ComposerAttachKind, 'unsupported'>): string {
  switch (kind) {
    case 'image':
      return 'image/jpeg';
    case 'pdf':
      return 'application/pdf';
    case 'csv':
      return 'text/csv';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
}

export function attachmentsFromPickerAssets(
  assets: ComposerPickedAsset[],
  nextId: () => string,
): ComposerAttachment[] {
  const out: ComposerAttachment[] = [];
  for (const asset of assets) {
    const name = (asset.name ?? '').trim() || 'file';
    const mime = asset.mimeType ?? '';
    const kind = composerAttachKind(mime, name);
    if (kind === 'unsupported' || !asset.uri) continue;
    out.push({
      id: nextId(),
      name,
      mime: mime || fallbackMime(kind),
      uri: asset.uri,
      kind,
    });
  }
  return out;
}

export function composerSendUtterance(
  draft: string,
  attachmentCount: number,
  lookAtFiles: string,
): string {
  const trimmed = draft.trim();
  if (trimmed) return trimmed;
  return attachmentCount > 0 ? lookAtFiles : '';
}

export function isComposerBinaryKind(kind: ComposerAttachKind): boolean {
  return kind === 'image' || kind === 'pdf';
}

/** One attached photo for the current scan; leftover photos wait until this one is saved. */
export function takeNextScanImage<T>(images: T[]): { image: T; remaining: T[] } | null {
  const image = images[0];
  if (image === undefined) return null;
  return { image, remaining: images.slice(1) };
}

export function planComposerSend(
  draft: string,
  attachments: { kind: ComposerAttachKind }[],
  lookAtFiles: string,
): ComposerSendPlan {
  const trimmed = draft.trim();
  const hasBinary = attachments.some((file) => isComposerBinaryKind(file.kind));
  if (!trimmed && hasBinary) return { type: 'pick_kind' };
  const utterance = composerSendUtterance(draft, attachments.length, lookAtFiles);
  if (!utterance) return { type: 'none' };
  const named = kindFromUtterance(utterance);
  if (named && hasBinary) {
    return { type: 'vision', kind: named, utterance };
  }
  return { type: 'turn', utterance };
}

export function formatAskPipAttachmentBlock(
  files: Array<{ name: string; kind: ComposerAttachKind; text?: string }>,
): string | null {
  if (files.length === 0) return null;
  const lines = ['Attached files:'];
  for (const file of files) {
    lines.push(`- ${file.name} (${file.kind})`);
    const text = file.text?.trim();
    if (text) {
      lines.push(`--- ${file.name} ---`);
      lines.push(text);
    }
  }
  return lines.join('\n');
}

export function spreadsheetBytesToText(bytes: Uint8Array): string {
  const wb = XLSX.read(bytes, { type: 'array' });
  return wb.SheetNames.map((name) => {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name] ?? {});
    return wb.SheetNames.length > 1 ? `# ${name}\n${csv}` : csv;
  }).join('\n\n');
}
