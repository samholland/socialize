const DB_NAME = "socialize.local.db";
const DB_VERSION = 4;
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
  storagePath?: string;
  campaignId?: string;
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

function ensureMediaStoreSchema(
  db: IDBDatabase,
  transaction: IDBTransaction | null
) {
  if (!db.objectStoreNames.contains(MEDIA_STORE)) {
    const store = db.createObjectStore(MEDIA_STORE, { keyPath: "id" });
    store.createIndex("workspaceId", "workspaceId", { unique: false });
    store.createIndex("storagePath", ["workspaceId", "storagePath"], {
      unique: false,
    });
    store.createIndex("campaignId", ["workspaceId", "campaignId"], {
      unique: false,
    });
    return;
  }
  if (!transaction) return;
  const store = transaction.objectStore(MEDIA_STORE);
  if (!store.indexNames.contains("workspaceId")) {
    store.createIndex("workspaceId", "workspaceId", { unique: false });
  }
  if (store.indexNames.contains("storagePath")) {
    const existing = store.index("storagePath");
    const keyPath = Array.isArray(existing.keyPath) ? existing.keyPath : [];
    const requiresRecreate =
      existing.unique || keyPath[0] !== "workspaceId" || keyPath[1] !== "storagePath";
    if (requiresRecreate) {
      store.deleteIndex("storagePath");
      store.createIndex("storagePath", ["workspaceId", "storagePath"], {
        unique: false,
      });
    }
  } else {
    store.createIndex("storagePath", ["workspaceId", "storagePath"], {
      unique: false,
    });
  }
  if (store.indexNames.contains("campaignId")) {
    const existing = store.index("campaignId");
    const keyPath = Array.isArray(existing.keyPath) ? existing.keyPath : [];
    const requiresRecreate =
      existing.unique || keyPath[0] !== "workspaceId" || keyPath[1] !== "campaignId";
    if (requiresRecreate) {
      store.deleteIndex("campaignId");
      store.createIndex("campaignId", ["workspaceId", "campaignId"], {
        unique: false,
      });
    }
  } else {
    store.createIndex("campaignId", ["workspaceId", "campaignId"], {
      unique: false,
    });
  }
}

function attachDbLifecycleHandlers(db: IDBDatabase) {
  db.onversionchange = () => {
    db.close();
    dbPromise = null;
  };
}

function openDb(): Promise<IDBDatabase> {
  if (!hasIndexedDb()) {
    return Promise.reject(new Error("IndexedDB is not available."));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const resolveOnce = (db: IDBDatabase) => {
      if (settled) return;
      settled = true;
      attachDbLifecycleHandlers(db);
      resolve(db);
    };
    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      dbPromise = null;
      reject(error);
    };

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction;
      if (!db.objectStoreNames.contains(WORKSPACE_STORE)) {
        db.createObjectStore(WORKSPACE_STORE, { keyPath: "workspaceId" });
      }
      ensureMediaStoreSchema(db, tx);
    };
    request.onsuccess = () => {
      resolveOnce(request.result);
    };
    request.onerror = () => {
      rejectOnce(request.error ?? new Error("Unable to open IndexedDB database."));
    };
    request.onblocked = () => {
      // If an upgrade is blocked (another tab/session), fall back to opening the
      // current DB version so reads/writes can continue instead of returning [].
      const fallbackRequest = window.indexedDB.open(DB_NAME);
      fallbackRequest.onsuccess = () => {
        resolveOnce(fallbackRequest.result);
      };
      fallbackRequest.onerror = () => {
        rejectOnce(
          fallbackRequest.error ??
            new Error("IndexedDB upgrade is blocked by another open tab.")
        );
      };
    };
  });

  return dbPromise;
}

function mediaId(workspaceId: string, storagePath: string): string {
  return `${workspaceId}::${storagePath}`;
}

function legacyMediaId(workspaceId: string, campaignId: string): string {
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
  } catch (error) {
    console.warn("IndexedDB: failed to write workspace snapshot.", error);
    return false;
  }
}

export async function putLocalMediaAsset(
  workspaceId: string,
  storagePath: string,
  media: {
    campaignId?: string;
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
      id: mediaId(workspaceId, storagePath),
      workspaceId,
      storagePath,
      campaignId: media.campaignId,
      kind: media.kind,
      blob: media.blob,
      mimeType: media.mimeType,
      fileName: media.fileName,
      updatedAt: Date.now(),
    } satisfies MediaAssetRecord);
    await transactionDone(transaction);
    return true;
  } catch (error) {
    console.warn("IndexedDB: failed to persist media asset.", error);
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
    const records = (store.indexNames.contains("workspaceId")
      ? await requestToPromise(store.index("workspaceId").getAll(IDBKeyRange.only(workspaceId)))
      : (await requestToPromise(store.getAll())).filter(
          (record) =>
            typeof record === "object" &&
            record !== null &&
            (record as { workspaceId?: string }).workspaceId === workspaceId
        )) as MediaAssetRecord[];
    await transactionDone(transaction);
    return records.map((record) => ({
      workspaceId: record.workspaceId,
      storagePath: record.storagePath,
      campaignId: record.campaignId,
      kind: record.kind,
      blob: record.blob,
      mimeType: record.mimeType,
      fileName: record.fileName,
      updatedAt: record.updatedAt,
    }));
  } catch (error) {
    console.warn("IndexedDB: failed to list media assets.", error);
    return [];
  }
}

export async function deleteLocalMediaAsset(
  workspaceId: string,
  storagePath: string
): Promise<void> {
  if (!hasIndexedDb()) return;
  try {
    const db = await openDb();
    const transaction = db.transaction(MEDIA_STORE, "readwrite");
    const store = transaction.objectStore(MEDIA_STORE);
    store.delete(mediaId(workspaceId, storagePath));
    await transactionDone(transaction);
  } catch {
    // noop
  }
}

export async function deleteLocalMediaAssets(
  workspaceId: string,
  storagePaths: string[]
): Promise<void> {
  if (!hasIndexedDb() || storagePaths.length === 0) return;
  try {
    const db = await openDb();
    const transaction = db.transaction(MEDIA_STORE, "readwrite");
    const store = transaction.objectStore(MEDIA_STORE);
    for (const storagePath of storagePaths) {
      store.delete(mediaId(workspaceId, storagePath));
    }
    await transactionDone(transaction);
  } catch {
    // noop
  }
}

export async function deleteLegacyLocalMediaAssets(
  workspaceId: string,
  campaignIds: string[]
): Promise<void> {
  if (!hasIndexedDb() || campaignIds.length === 0) return;
  try {
    const db = await openDb();
    const transaction = db.transaction(MEDIA_STORE, "readwrite");
    const store = transaction.objectStore(MEDIA_STORE);
    for (const campaignId of campaignIds) {
      store.delete(legacyMediaId(workspaceId, campaignId));
    }
    await transactionDone(transaction);
  } catch {
    // noop
  }
}
