// Winziger Schlüssel-Wert-Speicher auf IndexedDB für die Inhalte der
// Ziel-Playlists. Fällt IndexedDB aus, wird einfach jedes Mal neu geladen.

let db: Promise<IDBDatabase | null> | null = null;

function open() {
  return (db ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open("sortify", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  }));
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const d = await open();
  if (!d) return undefined;
  return new Promise((resolve) => {
    const req = d.transaction("kv").objectStore("kv").get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(undefined);
  });
}

export async function cacheSet(key: string, value: unknown) {
  const d = await open();
  if (!d) return;
  try {
    d.transaction("kv", "readwrite").objectStore("kv").put(value, key);
  } catch {
    // egal
  }
}
