import { blobEnabled, onVercel, redisUrl } from "./env";
import { localDatabase } from "./storage/local";
import { redisDatabase } from "./storage/redis";
import type { Database } from "./storage/shared";

export { downloadImage, readStoredFile, removeImage, saveImage } from "./storage/images";

export type SetupProblem = "redis" | "blob";

/** O que falta configurar para o app funcionar na Vercel (vazio = tudo certo). */
export function setupProblems(): SetupProblem[] {
  if (!onVercel()) return [];
  const problems: SetupProblem[] = [];
  if (!redisUrl()) problems.push("redis");
  if (!blobEnabled()) problems.push("blob");
  return problems;
}

export function storageDescription(): string {
  if (redisUrl() && blobEnabled()) return "Lista salva no Redis e fotos no Vercel Blob.";
  if (redisUrl()) return "Lista salva no Redis; fotos na pasta data/images deste computador.";
  return "Lista e fotos salvas neste computador, na pasta data do projeto.";
}

/** Redis quando REDIS_URL existe; senão o arquivo local (que não funciona na Vercel). */
function database(): Database {
  if (redisUrl()) return redisDatabase;
  if (onVercel()) throw new Error("nenhum banco configurado: conecte um Redis ao projeto na Vercel");
  return localDatabase;
}

export const db: Database = {
  listItems: () => database().listItems(),
  getItem: (id) => database().getItem(id),
  findByRef: (ref) => database().findByRef(ref),
  insertItem: (item) => database().insertItem(item),
  updateItem: (id, change) => database().updateItem(id, change),
  deleteItem: (id) => database().deleteItem(id),
  listCategories: () => database().listCategories(),
  saveCategory: (category) => database().saveCategory(category),
  deleteCategory: (id) => database().deleteCategory(id),
};
