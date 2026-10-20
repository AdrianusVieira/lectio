import type { DocKind, FileEntry } from './types';

const supported = new Set<DocKind>(['pdf', 'tex', 'bib', 'md', 'txt']);
export function fileEntry(file: File, path: string): FileEntry {
  const extension = file.name.split('.').pop()?.toLowerCase() as DocKind | undefined;
  const kind = extension && supported.has(extension) ? extension : undefined;
  return { file, path: path.replace(/^\/+/, ''), kind, ignored: !kind };
}

export async function pickDirectory(): Promise<FileEntry[]> {
  const picker = (window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
  if (!picker) throw new Error('Escolha a pasta pelo botão de fallback.');
  const root = await picker();
  const result: FileEntry[] = [];
  async function visit(directory: FileSystemDirectoryHandle, prefix: string) {
    for await (const [name, handle] of (directory as FileSystemDirectoryHandle & { entries(): AsyncIterableIterator<[string, FileSystemHandle]> }).entries()) {
      const path = `${prefix}${name}`;
      if (handle.kind === 'directory') await visit(handle as FileSystemDirectoryHandle, `${path}/`);
      else result.push(fileEntry(await (handle as FileSystemFileHandle).getFile(), path));
    }
  }
  await visit(root, '');
  return result.sort((a, b) => a.path.localeCompare(b.path, 'pt-BR'));
}

interface LegacyEntry { isFile: boolean; isDirectory: boolean; name: string; file?: (success: (file: File) => void, error?: (e: Error) => void) => void; createReader?: () => { readEntries: (success: (entries: LegacyEntry[]) => void, error?: (e: Error) => void) => void }; }

export async function droppedFiles(transfer: DataTransfer): Promise<FileEntry[]> {
  const result: FileEntry[] = [];
  async function visit(entry: LegacyEntry, prefix: string): Promise<void> {
    if (entry.isFile && entry.file) {
      const file = await new Promise<File>((resolve, reject) => entry.file!(resolve, reject));
      result.push(fileEntry(file, `${prefix}${entry.name}`));
    } else if (entry.isDirectory && entry.createReader) {
      const reader = entry.createReader();
      while (true) {
        const children = await new Promise<LegacyEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (!children.length) break;
        for (const child of children) await visit(child, `${prefix}${entry.name}/`);
      }
    }
  }
  const items = [...transfer.items];
  if (items.some(item => (item as DataTransferItem & { webkitGetAsEntry?: () => LegacyEntry }).webkitGetAsEntry)) {
    for (const item of items) {
      const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => LegacyEntry }).webkitGetAsEntry?.();
      if (entry) await visit(entry, '');
    }
  } else for (const file of [...transfer.files]) result.push(fileEntry(file, file.webkitRelativePath || file.name));
  return result.sort((a, b) => a.path.localeCompare(b.path, 'pt-BR'));
}
