import { getAccessToken, invalidateAccessTokenCache } from "./googleOAuth";

const FILES_URL = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const METADATA_FIELDS = "id,name,modifiedTime,headRevisionId,trashed";

/** Custom Drive `appProperties` tag every file this app creates carries, so
 * the picker can find them again even if the user renames the file. */
const APP_PROPERTY_KEY = "tonoteDocument";

export type DriveApiErrorKind = "unauthorized" | "forbidden" | "not-found" | "network" | "server";

export class DriveApiError extends Error {
  constructor(
    message: string,
    public readonly kind: DriveApiErrorKind,
    public readonly status?: number,
  ) {
    super(message);
  }
}

export interface DriveFileMetadata {
  id: string;
  name: string;
  modifiedTime: string;
  headRevisionId: string;
  trashed: boolean;
}

async function driveFetch(url: string, init: RequestInit, allowRetry = true): Promise<Response> {
  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    throw new DriveApiError(err instanceof Error ? err.message : String(err), "unauthorized");
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${accessToken}` },
    });
  } catch (err) {
    throw new DriveApiError(`Network error reaching Google Drive: ${String(err)}`, "network");
  }

  // A 401 despite a cached token that looked unexpired means it was revoked
  // externally — bust the cache and retry exactly once with a fresh one.
  if (res.status === 401 && allowRetry) {
    invalidateAccessTokenCache();
    return driveFetch(url, init, false);
  }
  if (!res.ok) {
    const kind: DriveApiErrorKind =
      res.status === 403
        ? "forbidden"
        : res.status === 404
          ? "not-found"
          : res.status === 401
            ? "unauthorized"
            : "server";
    throw new DriveApiError(`Google Drive API error ${res.status}: ${await res.text()}`, kind, res.status);
  }
  return res;
}

export async function createFile(name: string, content: string): Promise<DriveFileMetadata> {
  const metadata = {
    name,
    mimeType: "application/json",
    appProperties: { [APP_PROPERTY_KEY]: "true" },
  };
  const boundary = `tonote-${crypto.randomUUID()}`;
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`;

  const res = await driveFetch(`${UPLOAD_URL}?uploadType=multipart&fields=${METADATA_FIELDS}`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  return (await res.json()) as DriveFileMetadata;
}

export async function getFileMetadata(fileId: string): Promise<DriveFileMetadata> {
  const res = await driveFetch(`${FILES_URL}/${fileId}?fields=${METADATA_FIELDS}`, { method: "GET" });
  return (await res.json()) as DriveFileMetadata;
}

export async function downloadFileContent(fileId: string): Promise<string> {
  const res = await driveFetch(`${FILES_URL}/${fileId}?alt=media`, { method: "GET" });
  return res.text();
}

export async function updateFileContent(fileId: string, content: string): Promise<DriveFileMetadata> {
  const res = await driveFetch(`${UPLOAD_URL}/${fileId}?uploadType=media&fields=${METADATA_FIELDS}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: content,
  });
  return (await res.json()) as DriveFileMetadata;
}

/** Lists every file this app has created, newest first — backs the "Open
 * from Google Drive" picker. */
export async function listAppDocuments(): Promise<DriveFileMetadata[]> {
  const q = `appProperties has { key='${APP_PROPERTY_KEY}' and value='true' } and trashed=false`;
  const res = await driveFetch(
    `${FILES_URL}?q=${encodeURIComponent(q)}&fields=files(${METADATA_FIELDS})&orderBy=modifiedTime desc`,
    { method: "GET" },
  );
  const data = (await res.json()) as { files: DriveFileMetadata[] };
  return data.files;
}
