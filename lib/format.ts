import type { Category, Platform, WishItem } from "./types";

export const PLATFORMS: Platform[] = ["xianyu", "taobao", "weidian", "1688"];

export const PLATFORM_LABEL: Record<Platform, string> = {
  taobao: "Taobao",
  weidian: "Weidian",
  "1688": "1688",
  xianyu: "Xianyu",
};

/** Nome provisório quando não deu para ler o nome do produto. */
export function fallbackTitle(platform: Platform, productId: string): string {
  return `Item ${productId} do ${PLATFORM_LABEL[platform]}`;
}

/** Item sem foto ou ainda com o nome provisório. */
export function needsAttention(item: WishItem): boolean {
  const noPhoto = !item.image && !item.imageSource;
  const noName = !item.titleEdited && item.title === fallbackTitle(item.platform, item.productId);
  return noPhoto || noName;
}

export const byName = (a: Category, b: Category) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });

/** 1234.5 -> "¥ 1.234,50" (formatação manual para servidor e navegador gerarem o mesmo texto). */
export function formatPrice(value: number): string {
  const [integer, decimals] = value.toFixed(2).split(".");
  return `¥ ${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decimals}`;
}

/** "12/11/2026" */
export function formatFullDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}
