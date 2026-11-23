import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { DATA_DIR } from "../paths";
import type { Category, WishItem } from "../types";
import { byName, newestFirst, withDefaults, type Database } from "./shared";

// Modo local: tudo num arquivo JSON dentro de data/ (é o que roda no `npm run dev` sem Redis).
const DB_FILE = path.join(DATA_DIR, "wishlist.json");
const BACKUP_FILE = path.join(DATA_DIR, "wishlist.backup.json");

type Data = { items: WishItem[]; categories: Category[] };

// Uma escrita por vez, para dois links colados juntos não apagarem um ao outro.
const globals = globalThis as typeof globalThis & { __garimpoWrites?: Promise<unknown> };

function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = (globals.__garimpoWrites ?? Promise.resolve()).then(task);
  globals.__garimpoWrites = run.catch(() => undefined);
  return run;
}

async function readData(): Promise<Data> {
  let raw: string;
  try {
    raw = await fs.readFile(DB_FILE, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { items: [], categories: [] };
    throw error;
  }
  let data: { items?: unknown; categories?: unknown };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    throw new Error(`O arquivo ${DB_FILE} está corrompido. A versão anterior está em ${BACKUP_FILE}.`);
  }
  return {
    items: Array.isArray(data.items) ? (data.items as WishItem[]).map(withDefaults) : [],
    categories: Array.isArray(data.categories) ? (data.categories as Category[]) : [],
  };
}

async function writeData(data: Data): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const temp = `${DB_FILE}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(temp, JSON.stringify({ version: 2, ...data }, null, 2), "utf8");
  await fs.copyFile(DB_FILE, BACKUP_FILE).catch(() => undefined);
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(temp, DB_FILE); // troca atômica: nunca fica meio arquivo escrito
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      // No Windows, antivírus ou editor às vezes seguram o arquivo por um instante.
      if (attempt < 6 && (code === "EPERM" || code === "EBUSY" || code === "EACCES")) {
        await new Promise((resolve) => setTimeout(resolve, 80 * (attempt + 1)));
        continue;
      }
      await fs.rm(temp, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}

export const localDatabase: Database = {
  async listItems() {
    return (await readData()).items.sort(newestFirst);
  },
  async getItem(id) {
    return (await readData()).items.find((item) => item.id === id) ?? null;
  },
  async findByRef(ref) {
    return (await readData()).items.find((item) => item.platform === ref.platform && item.productId === ref.id) ?? null;
  },
  insertItem(item) {
    return exclusive(async () => {
      const data = await readData();
      const existing = data.items.find((entry) => entry.platform === item.platform && entry.productId === item.productId);
      if (existing) return { item: existing, duplicate: true };
      data.items.unshift(item);
      await writeData(data);
      return { item, duplicate: false };
    });
  },
  updateItem(id, change) {
    return exclusive(async () => {
      const data = await readData();
      const index = data.items.findIndex((entry) => entry.id === id);
      if (index === -1) return null;
      const next: WishItem = { ...change(data.items[index]), updatedAt: new Date().toISOString() };
      data.items[index] = next;
      await writeData(data);
      return next;
    });
  },
  deleteItem(id) {
    return exclusive(async () => {
      const data = await readData();
      const item = data.items.find((entry) => entry.id === id);
      if (!item) return null;
      data.items = data.items.filter((entry) => entry.id !== id);
      await writeData(data);
      return item;
    });
  },
  async listCategories() {
    return (await readData()).categories.sort(byName);
  },
  saveCategory(category) {
    return exclusive(async () => {
      const data = await readData();
      const index = data.categories.findIndex((entry) => entry.id === category.id);
      if (index === -1) data.categories.push(category);
      else data.categories[index] = category;
      await writeData(data);
    });
  },
  deleteCategory(id) {
    return exclusive(async () => {
      const data = await readData();
      if (!data.categories.some((entry) => entry.id === id)) return false;
      const now = new Date().toISOString();
      data.categories = data.categories.filter((entry) => entry.id !== id);
      data.items = data.items.map((item) => (item.categoryId === id ? { ...item, categoryId: null, updatedAt: now } : item));
      await writeData(data);
      return true;
    });
  },
};
