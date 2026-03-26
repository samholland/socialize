const DB_NAME = "socialize.local.db";
const DB_VERSION = 1;
const WORKSPACE_STORE = "workspace_states";
const MEDIA_STORE = "media_assets";

type WorkspaceStateRecord = {
  workspaceId: string;
  state: unknown;
  updatedAt: number;
};

type MediaAssetRecord = {
  id: string;
  workspaceId: string;
  campaignId: string;
  kind: "image" | "video";
  blob: Blob;
  mimeType: string;
  fileName: string;
  updatedAt: number;
};

export type LocalMediaAsset = Omit<MediaAssetRecord, "id">;

function hasIndexedDb(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

let dbPromise: Promise<IDBDatabase> | null = null;

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

function openDb(): Promise<IDBDatabase> {
  if (!hasIndexedDb()) {
    return Promise.reject(new Error("IndexedDB is not available."));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(WORKSPACE_STORE)) {
        db.createObjectStore(WORKSPACE_STORE, { keyPath: "workspaceId" });
      }
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        const store = db.createObjectStore(MEDIA_STORE, { keyPath: "id" });
        store.createIndex("workspaceId", "workspaceId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Unable to open IndexedDB database."));
  });

  return dbPromise;
}

function mediaId(workspaceId: string, campaignId: string): string {
  return `${workspaceId}::${campaignId}`;
}

export async function getLocalWorkspaceState<T>(
  workspaceId: string
): Promise<T | null> {
  if (!hasIndexedDb()) return null;
  try {
    const db = await openDb();
    const transaction = db.transaction(WORKSPACE_STORE, "readonly");
    const store = transaction.objectStore(WORKSPACE_STORE);
    const record = (await requestToPromise(
      store.get(workspaceId)
    )) as WorkspaceStateRecord | undefined;
    await transactionDone(transaction);
    return (record?.state as T | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function listLocalWorkspaceStates<T>(): Promise<
  Array<{ workspaceId: string; state: T }>
> {
  if (!hasIndexedDb()) return [];
  try {
    const db = await openDb();
    const transaction = db.transaction(WORKSPACE_STORE, "readonly");
    const store = transaction.objectStore(WORKSPACE_STORE);
    const records = (await requestToPromise(
      store.getAll()
    )) as WorkspaceStateRecord[];
    await transactionDone(transaction);
    return records.map((record) => ({
      workspaceId: record.workspaceId,
      state: record.state as T,
    }));
  } catch {
    return [];
  }
}

export async function setLocalWorkspaceState<T>(
  workspaceId: string,
  state: T
): Promise<boolean> {
  if (!hasIndexedDb()) return false;
  try {
    const db = await openDb();
    const transaction = db.transaction(WORKSPACE_STORE, "readwrite");
    const store = transaction.objectStore(WORKSPACE_STORE);
    store.put({
      workspaceId,
      state,
      updatedAt: Date.now(),
    } satisfies WorkspaceStateRecord);
    await transactionDone(transaction);
    return true;
  } catch {
    return false;
  }
}

export async function putLocalMediaAsset(
  workspaceId: string,
  campaignId: string,
  media: {
    kind: "image" | "video";
    blob: Blob;
    mimeType: string;
    fileName: string;
  }
): Promise<boolean> {
  if (!hasIndexedDb()) return false;
  try {
    const db = await openDb();
    const transaction = db.transaction(MEDIA_STORE, "readwrite");
    const store = transaction.objectStore(MEDIA_STORE);
    store.put({
      id: mediaId(workspaceId, campaignId),
      workspaceId,
      campaignId,
      kind: media.kind,
      blob: media.blob,
      mimeType: media.mimeType,
      fileName: media.fileName,
      updatedAt: Date.now(),
    } satisfies MediaAssetRecord);
    await transactionDone(transaction);
    return true;
  } catch {
    return false;
  }
}

export async function listLocalMediaAssetsForWorkspace(
  workspaceId: string
): Promise<LocalMediaAsset[]> {
  if (!hasIndexedDb()) return [];
  try {
    const db = await openDb();
    const transaction = db.transaction(MEDIA_STORE, "readonly");
    const store = transaction.objectStore(MEDIA_STORE);
    const index = store.index("workspaceId");
    const records = (await requestToPromise(
      index.getAll(IDBKeyRange.only(workspaceId))
    )) as MediaAssetRecord[];
    await transactionDone(transaction);
    return records.map((record) => ({
      workspaceId: record.workspaceId,
      campaignId: record.campaignId,
      kind: record.kind,
      blob: record.blob,
      mimeType: record.mimeType,
      fileName: record.fileName,
      updatedAt: record.updatedAt,
    }));
  } catch {
    return [];
  }
}

export async function deleteLocalMediaAsset(
  workspaceId: string,
  campaignId: string
): Promise<void> {
  if (!hasIndexedDb()) return;
  try {
    const db = await openDb();
    const transaction = db.transaction(MEDIA_STORE, "readwrite");
    const store = transaction.objectStore(MEDIA_STORE);
    store.delete(mediaId(workspaceId, campaignId));
    await transactionDone(transaction);
  } catch {
    // noop
  }
}

export async function deleteLocalMediaAssets(
  workspaceId: string,
  campaignIds: string[]
): Promise<void> {
  if (!hasIndexedDb() || campaignIds.length === 0) return;
  try {
    const db = await openDb();
    const transaction = db.transaction(MEDIA_STORE, "readwrite");
    const store = transaction.objectStore(MEDIA_STORE);
    for (const campaignId of campaignIds) {
      store.delete(mediaId(workspaceId, campaignId));
    }
    await transactionDone(transaction);
  } catch {
    // noop
  }
}
