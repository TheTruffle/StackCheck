const DB_NAME = "stack-check-history";
const STORE = "searches";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Record a brand search/selection or manual entry name, most-recent-first.
export async function addSearchHistory(query) {
  if (!query || !query.trim() || typeof indexedDB === "undefined") return;
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).add({ query: query.trim(), ts: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("Couldn't save search history:", err);
  }
}

// Most recent unique queries, newest first.
export async function getRecentSearches(limit = 8) {
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).openCursor(null, "prev");
      const all = [];
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor && all.length < limit * 4) {
          all.push(cursor.value);
          cursor.continue();
        } else {
          const seen = new Set();
          const deduped = [];
          for (const item of all) {
            if (!seen.has(item.query)) {
              seen.add(item.query);
              deduped.push(item.query);
            }
            if (deduped.length >= limit) break;
          }
          resolve(deduped);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("Couldn't read search history:", err);
    return [];
  }
}
