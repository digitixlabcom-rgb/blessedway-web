import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  Product,
  Category,
  ScanSession,
  LookupCacheEntry,
  AppSettings,
} from "../types";
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from "../types";
import { newId } from "../utils/id";

interface ScannerDBSchema extends DBSchema {
  products: {
    key: string;
    value: Product;
    indexes: {
      barcode: string;
      sessionId: string;
      category: string;
      lookupStatus: string;
      scanDate: string;
    };
  };
  categories: {
    key: string;
    value: Category;
    indexes: { name: string };
  };
  sessions: {
    key: string;
    value: ScanSession;
    indexes: { status: string };
  };
  lookupCache: {
    key: string;
    value: LookupCacheEntry;
  };
  settings: {
    key: string;
    value: AppSettings;
  };
}

const DB_NAME = "barcode-scanner-db";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<ScannerDBSchema>> | null = null;

export function getDB(): Promise<IDBPDatabase<ScannerDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<ScannerDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("products")) {
          const store = db.createObjectStore("products", { keyPath: "id" });
          store.createIndex("barcode", "barcode", { unique: true });
          store.createIndex("sessionId", "sessionId");
          store.createIndex("category", "category");
          store.createIndex("lookupStatus", "lookupStatus");
          store.createIndex("scanDate", "scanDate");
        }
        if (!db.objectStoreNames.contains("categories")) {
          const store = db.createObjectStore("categories", { keyPath: "id" });
          store.createIndex("name", "name", { unique: true });
        }
        if (!db.objectStoreNames.contains("sessions")) {
          const store = db.createObjectStore("sessions", { keyPath: "id" });
          store.createIndex("status", "status");
        }
        if (!db.objectStoreNames.contains("lookupCache")) {
          db.createObjectStore("lookupCache", { keyPath: "barcode" });
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

// Seeds default categories and settings on first run. Safe to call every boot.
export async function ensureSeedData(): Promise<void> {
  const db = await getDB();

  const existingSettings = await db.get("settings", "app");
  if (!existingSettings) {
    await db.put("settings", DEFAULT_SETTINGS);
  }

  const existingCategories = await db.getAll("categories");
  if (existingCategories.length === 0) {
    const tx = db.transaction("categories", "readwrite");
    const now = new Date().toISOString();
    await Promise.all(
      DEFAULT_CATEGORIES.map((name) =>
        tx.store.put({ id: newId(), name, isBuiltIn: true, createdAt: now })
      )
    );
    await tx.done;
  }
}
