import { getDB } from "../db/database";
import { DEFAULT_SETTINGS } from "../types";
import type { AppSettings } from "../types";

export class SettingsService {
  async get(): Promise<AppSettings> {
    const db = await getDB();
    const settings = await db.get("settings", "app");
    if (!settings) return DEFAULT_SETTINGS;
    // A settings record saved before a new field (e.g. geminiModel) was
    // added to AppSettings won't have it at all — IndexedDB returns exactly
    // what was stored, it doesn't backfill new fields on read. Merging over
    // DEFAULT_SETTINGS here means every existing user picks up new fields'
    // defaults automatically instead of the app crashing the first time
    // something assumes the field is always present (e.g. calling .trim()
    // on an unexpectedly undefined value).
    return { ...DEFAULT_SETTINGS, ...settings };
  }

  async update(changes: Partial<AppSettings>): Promise<AppSettings> {
    const db = await getDB();
    const current = await this.get();
    const updated = { ...current, ...changes };
    await db.put("settings", updated);
    return updated;
  }
}

export const settingsService = new SettingsService();
