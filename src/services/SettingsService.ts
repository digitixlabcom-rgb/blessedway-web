import { getDB } from "../db/database";
import { DEFAULT_SETTINGS } from "../types";
import type { AppSettings } from "../types";

export class SettingsService {
  async get(): Promise<AppSettings> {
    const db = await getDB();
    const settings = await db.get("settings", "app");
    return settings ?? DEFAULT_SETTINGS;
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
