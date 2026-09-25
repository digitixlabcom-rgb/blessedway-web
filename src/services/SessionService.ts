import { getDB } from "../db/database";
import { newId } from "../utils/id";
import { trimField } from "../utils/validation";
import type { Product, ScanSession, SessionStatus } from "../types";

export interface SessionStats {
  scanned: number;
  found: number;
  manual: number;
  notFound: number;
}

export class SessionService {
  async getAll(): Promise<ScanSession[]> {
    const db = await getDB();
    const all = await db.getAll("sessions");
    return all.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  }

  async get(id: string): Promise<ScanSession | undefined> {
    const db = await getDB();
    return db.get("sessions", id);
  }

  async start(name: string): Promise<ScanSession> {
    const db = await getDB();
    const now = new Date().toISOString();
    const session: ScanSession = {
      id: newId(),
      name: trimField(name) || `Session ${new Date().toLocaleString()}`,
      status: "active",
      startedAt: now,
      updatedAt: now,
      endedAt: null,
    };
    await db.add("sessions", session);
    return session;
  }

  async setStatus(id: string, status: SessionStatus): Promise<void> {
    const db = await getDB();
    const session = await db.get("sessions", id);
    if (!session) return;
    await db.put("sessions", {
      ...session,
      status,
      updatedAt: new Date().toISOString(),
      endedAt: status === "completed" ? new Date().toISOString() : session.endedAt,
    });
  }

  async rename(id: string, name: string): Promise<void> {
    const db = await getDB();
    const session = await db.get("sessions", id);
    if (!session) return;
    await db.put("sessions", { ...session, name: trimField(name), updatedAt: new Date().toISOString() });
  }

  async remove(id: string): Promise<void> {
    const db = await getDB();
    await db.delete("sessions", id);
  }

  computeStats(products: Product[], sessionId: string): SessionStats {
    const sessionProducts = products.filter((p) => p.sessionId === sessionId);
    return {
      scanned: sessionProducts.length,
      found: sessionProducts.filter((p) => p.lookupStatus === "found").length,
      manual: sessionProducts.filter((p) => p.lookupStatus === "manual").length,
      notFound: sessionProducts.filter((p) => p.lookupStatus === "not_found").length,
    };
  }
}

export const sessionService = new SessionService();
