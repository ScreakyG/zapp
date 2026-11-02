import type { XmltvProgramme } from './xmltv';

/** Programmes kept per EPG channel id, with the time they were downloaded. */
export interface EpgStore {
  load(): Promise<{ savedAt: number; programmes: XmltvProgramme[] } | undefined>;
  save(programmes: XmltvProgramme[]): Promise<void>;
}

/** In memory: tests, and platforms without IndexedDB. */
export class MemoryEpgStore implements EpgStore {
  private saved?: { savedAt: number; programmes: XmltvProgramme[] };
  async load() {
    return this.saved;
  }
  async save(programmes: XmltvProgramme[]) {
    this.saved = { savedAt: Date.now(), programmes };
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
  constructor(
    private readonly key = KEY,
    private readonly idb: IDBFactory = indexedDB,
  ) {}

  async load() {
    const db = await this.open();
    try {
      const record = await request<StoredGuide | undefined>(
        db.transaction(STORE, 'readonly').objectStore(STORE).get(this.key),
      );
      if (!record) return undefined;
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

  async save(programmes: XmltvProgramme[]) {
    const db = await this.open();
    try {
      const record: StoredGuide = {
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
    const req = this.idb.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    return request(req);
  }
}

interface StoredGuide {
  savedAt: number;
  programmes: (Omit<XmltvProgramme, 'start' | 'end'> & { start: number; end: number })[];
}

function request<T>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}
