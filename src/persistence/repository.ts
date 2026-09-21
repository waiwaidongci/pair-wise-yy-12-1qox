// 持久化层：只负责 localStorage 读写、版本校验与跨标签页同步通知。
// 不包含任何业务规则；规则全部在 domain/rules.ts。

import { AppData } from "../domain/types";
import { createSeedData } from "../domain/seed";

const STORAGE_KEY = "hxyfront-62011:fitting-data:v1";

export interface Persistence {
  load(): AppData;
  save(data: AppData): void;
  reset(): AppData;
  subscribe(listener: () => void): () => void;
}

function isAppData(value: unknown): value is AppData {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.orders) &&
    Array.isArray(v.shoes) &&
    Array.isArray(v.farriers)
  );
}

export function createPersistence(): Persistence {
  const listeners = new Set<() => void>();

  if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY) listeners.forEach((fn) => fn());
    });
  }

  return {
    load() {
      if (typeof window === "undefined") return createSeedData();
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          const seeded = createSeedData();
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
          return seeded;
        }
        const parsed: unknown = JSON.parse(raw);
        if (isAppData(parsed)) return parsed;
        // 数据损坏：回退种子而不是崩溃
        const seeded = createSeedData();
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
        return seeded;
      } catch {
        return createSeedData();
      }
    },

    save(data: AppData) {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      // 同标签页内也广播一次，保证列表 / 库存 / 提醒等视图刷新一致
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    },

    reset() {
      const seeded = createSeedData();
      this.save(seeded);
      return seeded;
    },

    subscribe(listener) {
      listeners.add(listener);
      const onStorage = () => listener();
      if (typeof window !== "undefined") {
        window.addEventListener("storage", onStorage);
      }
      return () => {
        listeners.delete(listener);
        if (typeof window !== "undefined") {
          window.removeEventListener("storage", onStorage);
        }
      };
    },
  };
}
