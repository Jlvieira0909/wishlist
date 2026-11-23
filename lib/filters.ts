import type { Platform, WishItem } from "./types";

export type SortOrder = "recent" | "oldest" | "price-asc" | "price-desc";

export type Filters = {
  /** "all", "none" (sem categoria) ou o id de uma categoria */
  category: string;
  platform: Platform | "all";
  query: string;
  minPrice: string;
  maxPrice: string;
  sort: SortOrder;
};

export const DEFAULT_FILTERS: Filters = {
  category: "all",
  platform: "all",
  query: "",
  minPrice: "",
  maxPrice: "",
  sort: "recent",
};

export const normalizeText = (text: string) =>
  text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Aceita "1.234,50", "1234,5" e "1234.50". */
export function parseAmount(raw: string): number | null {
  const text = raw.replace(/\s/g, "");
  if (!text) return null;
  const value = Number(text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** Filtros além da categoria (a categoria funciona como "pasta", não como filtro). */
export function hasActiveFilters(filters: Filters): boolean {
  return (
    filters.platform !== "all" ||
    filters.query.trim() !== "" ||
    filters.minPrice.trim() !== "" ||
    filters.maxPrice.trim() !== "" ||
    filters.sort !== "recent"
  );
}

export function applyFilters(items: WishItem[], filters: Filters, categoryIds: ReadonlySet<string>): WishItem[] {
  const words = normalizeText(filters.query);
  const min = parseAmount(filters.minPrice);
  const max = parseAmount(filters.maxPrice);

  const result = items.filter((item) => {
    const category = item.categoryId && categoryIds.has(item.categoryId) ? item.categoryId : null;
    if (filters.category === "none" && category !== null) return false;
    if (filters.category !== "all" && filters.category !== "none" && category !== filters.category) return false;
    if (filters.platform !== "all" && item.platform !== filters.platform) return false;
    if (words && !normalizeText(item.title).includes(words)) return false;
    if (min !== null && (item.price === null || item.price < min)) return false;
    if (max !== null && (item.price === null || item.price > max)) return false;
    return true;
  });

  const newest = (a: WishItem, b: WishItem) => b.createdAt.localeCompare(a.createdAt);
  switch (filters.sort) {
    case "oldest":
      return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case "price-asc": // itens sem preço vão para o fim
      return result.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || newest(a, b));
    case "price-desc":
      return result.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity) || newest(a, b));
    default:
      return result.sort(newest);
  }
}
