import { createClient } from "redis";
import { redisUrl } from "../env";
import { messageOf } from "../scraper/extract";
import type { Category, WishItem } from "../types";
import { byName, withDefaults, type Database } from "./shared";

// Modo nuvem: cada item é uma chave JSON; um sorted set guarda a ordem por data;
// uma chave por produto (loja + ID) impede duplicados; as categorias ficam num hash.
const ITEMS = "garimpo:items";
const CATEGORIES = "garimpo:categories";
const itemKey = (id: string) => `garimpo:item:${id}`;
const refKey = (platform: string, productId: string) => `garimpo:ref:${platform}:${productId}`;

const newClient = () => createClient({ url: redisUrl() });
type RedisClient = ReturnType<typeof newClient>;

// Uma conexão por instância da função, reaproveitada entre requisições (e entre hot reloads no dev).
const globals = globalThis as typeof globalThis & { __garimpoRedis?: Promise<RedisClient> };

function connection(): Promise<RedisClient> {
  let pending = globals.__garimpoRedis;
  if (!pending) {
    const client = newClient();
    client.on("error", (error) => console.error(`[garimpo] Redis: ${messageOf(error)}`));
    pending = client
      .connect()
      .then(() => client)
      .catch((error: unknown) => {
        globals.__garimpoRedis = undefined;
        throw error;
      });
    globals.__garimpoRedis = pending;
  }
  return pending;
}

const parseItem = (raw: string) => withDefaults(JSON.parse(raw) as WishItem);

async function getItem(id: string): Promise<WishItem | null> {
  const raw = await (await connection()).get(itemKey(id));
  return typeof raw === "string" ? parseItem(raw) : null;
}

async function listItems(): Promise<WishItem[]> {
  const redis = await connection();
  const ids = await redis.zRange(ITEMS, 0, -1, { REV: true });
  if (ids.length === 0) return [];
  const raws = await redis.mGet(ids.map((id) => itemKey(String(id))));
  return raws.flatMap((raw) => (typeof raw === "string" ? [parseItem(raw)] : []));
}

export const redisDatabase: Database = {
  listItems,
  getItem,
  async findByRef(ref) {
    const id = await (await connection()).get(refKey(ref.platform, ref.id));
    return typeof id === "string" ? getItem(id) : null;
  },
  async insertItem(item) {
    const redis = await connection();
    const ref = refKey(item.platform, item.productId);
    const claimed = await redis.set(ref, item.id, { condition: "NX" });
    if (claimed === null) {
      const existingId = await redis.get(ref);
      const existing = typeof existingId === "string" ? await getItem(existingId) : null;
      if (existing) return { item: existing, duplicate: true };
      await redis.set(ref, item.id); // referência sobrando de um item apagado: reaproveita
    }
    await redis
      .multi()
      .set(itemKey(item.id), JSON.stringify(item))
      .zAdd(ITEMS, { score: Date.parse(item.createdAt), value: item.id })
      .exec();
    return { item, duplicate: false };
  },
  async updateItem(id, change) {
    const current = await getItem(id);
    if (!current) return null;
    const next: WishItem = { ...change(current), updatedAt: new Date().toISOString() };
    await (await connection()).set(itemKey(id), JSON.stringify(next));
    return next;
  },
  async deleteItem(id) {
    const item = await getItem(id);
    if (!item) return null;
    await (await connection())
      .multi()
      .del(itemKey(id))
      .zRem(ITEMS, id)
      .del(refKey(item.platform, item.productId))
      .exec();
    return item;
  },
  async listCategories() {
    const raws = await (await connection()).hVals(CATEGORIES);
    return raws.map((raw) => JSON.parse(String(raw)) as Category).sort(byName);
  },
  async saveCategory(category) {
    await (await connection()).hSet(CATEGORIES, category.id, JSON.stringify(category));
  },
  async deleteCategory(id) {
    const redis = await connection();
    const removed = await redis.hDel(CATEGORIES, id);
    if (!removed) return false;
    const affected = (await listItems()).filter((item) => item.categoryId === id);
    if (affected.length > 0) {
      const now = new Date().toISOString();
      const batch = redis.multi();
      for (const item of affected) batch.set(itemKey(item.id), JSON.stringify({ ...item, categoryId: null, updatedAt: now }));
      await batch.exec();
    }
    return true;
  },
};
