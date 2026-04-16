const DB_NAME = 'pathfinder_pdf_snapshot_db';
const DB_VERSION = 1;
const STORE_NAME = 'pdf_snapshots';
const LAST_SNAPSHOT_KEY = 'last_itinerary_pdf';

const hasIndexedDb = () => typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

const openDatabase = () => new Promise((resolve, reject) => {
  if (!hasIndexedDb()) {
    resolve(null);
    return;
  }

  const request = window.indexedDB.open(DB_NAME, DB_VERSION);

  request.onerror = () => {
    reject(request.error || new Error('Failed to open PDF snapshot database'));
  };

  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    }
  };

  request.onsuccess = () => {
    resolve(request.result);
  };
});

const runReadWriteTransaction = async (fn) => {
  const db = await openDatabase();
  if (!db) return null;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    let operationResult = null;

    tx.oncomplete = () => {
      db.close();
      resolve(operationResult);
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('PDF snapshot transaction failed'));
    };

    operationResult = fn(store);
  });
};

const runReadOnlyTransaction = async (fn) => {
  const db = await openDatabase();
  if (!db) return null;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = fn(store);

    request.onerror = () => {
      db.close();
      reject(request.error || new Error('Failed to read PDF snapshot'));
    };

    request.onsuccess = () => {
      const result = request.result;
      tx.oncomplete = () => {
        db.close();
        resolve(result || null);
      };
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('PDF snapshot read transaction failed'));
    };
  });
};

export const savePdfBlobSnapshot = async (blob) => {
  if (!(blob instanceof Blob)) return false;

  try {
    await runReadWriteTransaction((store) => {
      store.put({
        id: LAST_SNAPSHOT_KEY,
        blob,
        updatedAt: Date.now()
      });
      return true;
    });
    return true;
  } catch (error) {
    console.warn('Failed to save PDF blob snapshot:', error);
    return false;
  }
};

export const loadPdfBlobSnapshotUrl = async () => {
  try {
    const record = await runReadOnlyTransaction((store) => store.get(LAST_SNAPSHOT_KEY));
    const blob = record?.blob;
    if (!(blob instanceof Blob)) return null;
    return URL.createObjectURL(blob);
  } catch (error) {
    console.warn('Failed to load PDF blob snapshot:', error);
    return null;
  }
};

export const hasPdfBlobSnapshot = async () => {
  try {
    const record = await runReadOnlyTransaction((store) => store.get(LAST_SNAPSHOT_KEY));
    return Boolean(record?.blob instanceof Blob);
  } catch (error) {
    console.warn('Failed to check PDF blob snapshot availability:', error);
    return false;
  }
};

export const clearPdfBlobSnapshot = async () => {
  try {
    await runReadWriteTransaction((store) => {
      store.delete(LAST_SNAPSHOT_KEY);
      return true;
    });
    return true;
  } catch (error) {
    console.warn('Failed to clear PDF blob snapshot:', error);
    return false;
  }
};
