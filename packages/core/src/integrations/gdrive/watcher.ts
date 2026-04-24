// Google Drive watcher — Phase 2 stub.
// Wired in Phase 2 once OAuth + service account config is available.

export interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
}

const NOT_IMPLEMENTED = 'Not implemented - configure in Phase 2';

export async function listDriveFolder(folderName: string): Promise<DriveFileMeta[]> {
  void folderName;
  throw new Error(NOT_IMPLEMENTED);
}

export async function downloadDriveFile(fileId: string): Promise<Buffer> {
  void fileId;
  throw new Error(NOT_IMPLEMENTED);
}
