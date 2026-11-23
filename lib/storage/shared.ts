import { byName } from "../format";
import type { ProductRef } from "../links";
import type { Category, WishItem } from "../types";

/** O que cada forma de guardar a lista (arquivo local ou Redis) precisa saber fazer. */
export interface Database {
  listItems(): Promise<WishItem[]>;
  getItem(id: string): Promise<WishItem | null>;
  findByRef(ref: ProductRef): Promise<WishItem | null>;
  insertItem(item: WishItem): Promise<{ item: WishItem; duplicate: boolean }>;
  updateItem(id: string, change: (item: WishItem) => WishItem): Promise<WishItem | null>;
  deleteItem(id: string): Promise<WishItem | null>;
  listCategories(): Promise<Category[]>;
  saveCategory(category: Category): Promise<void>;
  /** Apaga a categoria e deixa os itens dela sem categoria. */
  deleteCategory(id: string): Promise<boolean>;
}

export const newestFirst = (a: WishItem, b: WishItem) => b.createdAt.localeCompare(a.createdAt);
export { byName };

/** Completa campos que não existiam em versões anteriores do app. */
export function withDefaults(raw: WishItem): WishItem {
  const image = raw.image ?? null;
  return {
    ...raw,
    titleEdited: raw.titleEdited ?? false,
    categoryId: raw.categoryId ?? null,
    image: image && !image.includes("/") ? `/api/images/${image}` : image, // v1 guardava só o nome do arquivo
    imageSource: raw.imageSource ?? null,
    price: typeof raw.price === "number" ? raw.price : null,
  };
}
