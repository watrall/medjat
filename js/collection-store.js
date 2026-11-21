import { readCollection, mergeCollections, MAX_SAVED } from './collection.js';

const DATABASE = 'ancient-egypt-research';
const CHANNEL = 'ancient-egypt-collection-changes';
const SESSION_WARNING =
  'Browser storage is unavailable. Changes are kept for this visit only. Export your collection to keep a copy.';

// A read/write transaction serializes changes across tabs. Notifications only
// invalidate views; the database, not another tab's snapshot, is authoritative.
export function createCollectionStore({ storage, database = globalThis.indexedDB } = {}) {
  let db,
    records = new Map(),
    warning = '',
    sessionOnly = false;
  const listeners = new Set();
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) : null;
  const snapshot = () => ({ records: new Map(records), warning });
  const read = () =>
    new Promise((resolve, reject) => {
      const transaction = db.transaction('publications');
      const request = transaction.objectStore('publications').getAll();
      transaction.oncomplete = () =>
        resolve(new Map(request.result.map((entry) => [entry.work.id, entry])));
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  const ready = (async () => {
    const legacy = readCollection(storage);
    records = legacy.records;
    try {
      if (!database) throw new Error('Storage unavailable');
      db = await new Promise((resolve, reject) => {
        const request = database.open(DATABASE, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore('publications', { keyPath: 'work.id' });
          request.result.createObjectStore('settings');
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Storage is busy'));
      });
      db.onversionchange = () => db.close();
      // Migrate the existing backup once, inside the same transaction as the
      // marker, so an older tab can never reimport a subsequently removed item.
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['settings', 'publications'], 'readwrite');
        const settings = tx.objectStore('settings');
        const marker = settings.get('legacy-imported');
        marker.onsuccess = () => {
          if (!marker.result) {
            if (legacy.warning) {
              tx.abort();
              return;
            }
            for (const entry of legacy.records.values()) tx.objectStore('publications').put(entry);
            settings.put(true, 'legacy-imported');
          }
        };
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Could not read previous collection'));
      });
      records = await read();
    } catch {
      sessionOnly = true;
      warning = legacy.warning || SESSION_WARNING;
    }
    return snapshot();
  })();

  async function refresh() {
    await ready;
    if (!sessionOnly) {
      try {
        records = await read();
      } catch {
        warning = SESSION_WARNING;
        sessionOnly = true;
      }
    }
    for (const listener of listeners) listener(snapshot());
    return snapshot();
  }
  async function change(operation) {
    await ready;
    const apply = (current) => {
      const next = new Map(current);
      if (operation.remove) next.delete(operation.remove);
      if (operation.update) {
        if (!next.has(operation.update.work.id))
          throw new Error(
            'This publication was removed from the collection. Save it again before updating.',
          );
        if (
          operation.expectedRaw &&
          JSON.stringify(next.get(operation.update.work.id).work.raw) !==
            JSON.stringify(operation.expectedRaw)
        )
          throw new Error(
            'This saved record changed in another tab. Run the check again before accepting.',
          );
        next.set(operation.update.work.id, operation.update);
      }
      if (operation.add) next.set(operation.add.work.id, operation.add);
      const merged = operation.import
        ? mergeCollections(next, operation.import, operation.reviewedImport)
        : next;
      if (merged.size > MAX_SAVED)
        throw new Error(
          `Your collection supports ${MAX_SAVED} publications. Export a copy and remove some before adding more.`,
        );
      return merged;
    };
    if (sessionOnly) records = apply(records);
    else {
      let validationError,
        latest = records;
      try {
        records = await new Promise((resolve, reject) => {
          const tx = db.transaction('publications', 'readwrite');
          const store = tx.objectStore('publications');
          const request = store.getAll();
          let next;
          request.onsuccess = () => {
            try {
              latest = new Map(request.result.map((entry) => [entry.work.id, entry]));
              next = apply(latest);
              if (operation.remove) store.delete(operation.remove);
              if (operation.update) store.put(operation.update);
              if (operation.add) store.put(operation.add);
              if (operation.import)
                for (const [id, entry] of operation.import)
                  if (next.get(id) === entry) store.put(entry);
            } catch (error) {
              validationError = error;
              tx.abort();
            }
          };
          tx.oncomplete = () => resolve(next);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(validationError || tx.error);
        });
        channel?.postMessage('changed');
      } catch {
        if (validationError) throw validationError;
        sessionOnly = true;
        warning = SESSION_WARNING;
        records = apply(latest);
      }
    }
    return snapshot();
  }
  if (channel) channel.onmessage = () => refresh();
  const onFocus = () => refresh();
  globalThis.addEventListener?.('focus', onFocus);
  return {
    ready,
    change,
    refresh,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      channel?.close();
      db?.close();
      globalThis.removeEventListener?.('focus', onFocus);
    },
  };
}
