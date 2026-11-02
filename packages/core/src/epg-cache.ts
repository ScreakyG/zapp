import type { XmltvProgramme } from './xmltv';

export interface CachedGuide {
  savedAt: number;
  programmes: XmltvProgramme[];
}

/** The last guide read, tied to the URL it came from so a source switch never reuses it. */
export interface EpgStore {
  load(url: string): Promise<CachedGuide | undefined>;
  save(url: string, programmes: XmltvProgramme[]): Promise<void>;
}

/** In memory: tests, and platforms without IndexedDB. */
export class MemoryEpgStore implements EpgStore {
  private saved?: CachedGuide & { url: string };
  async load(url: string) {
    return this.saved?.url === url ? this.saved : undefined;
  }
  async save(url: string, programmes: XmltvProgramme[]) {
    this.saved = { url, savedAt: Date.now(), programmes };
  }
}

const DB_NAME = 'zapp-epg';
const STORE = 'guide';
const KEY = 'xmltv';

/**
 * IndexedDB store, so the TV does not download and parse the XMLTV again on every start. One
 * record holds the whole window (a few thousand programmes), replaced on each refresh.
 */
export class IndexedDbEpgStore implements EpgStore {
  /** `idb` is resolved on use: constructing the store must not throw where IndexedDB is missing. */
  constructor(
    private readonly key = KEY,
    private readonly idb?: IDBFactory,
  ) {}

  async load(url: string) {
    const db = await this.open();
    try {
      const record = await request<StoredGuide | undefined>(
        db.transaction(STORE, 'readonly').objectStore(STORE).get(this.key),
      );
      if (!record || record.url !== url) return undefined;
      return {
        savedAt: record.savedAt,
        programmes: record.programmes.map((p) => ({
          ...p,
          start: new Date(p.start),
          end: new Date(p.end),
        })),
      };
    } finally {
      db.close();
    }
  }

  async save(url: string, programmes: XmltvProgramme[]) {
    const db = await this.open();
    try {
      const record: StoredGuide = {
        url,
        savedAt: Date.now(),
        programmes: programmes.map((p) => ({
          ...p,
          start: p.start.getTime(),
          end: p.end.getTime(),
        })),
      };
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record, this.key);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }

  private open(): Promise<IDBDatabase> {
    const idb = this.idb ?? globalThis.indexedDB;
    if (!idb) return Promise.reject(new Error('IndexedDB indisponible'));
    const req = idb.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onblocked = () => console.warn('EPG cache upgrade blocked by another tab');
    return request(req);
  }
}

interface StoredGuide {
  url: string;
  savedAt: number;
  programmes: (Omit<XmltvProgramme, 'start' | 'end'> & { start: number; end: number })[];
}

function request<T>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}
