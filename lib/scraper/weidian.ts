import { DESKTOP_UA, cleanTitle, normalizeImageUrl, type ScrapeResult } from "./extract";

type WeidianReply = {
  status?: { code?: number; message?: string };
  result?: {
    itemTitle?: unknown;
    itemMainPic?: unknown;
    itemDiscountLowPrice?: unknown;
    itemOriginalLowPrice?: unknown;
  } | null;
};

/** O Weidian tem uma API pública de detalhes do item: rápida e sem navegador. */
export async function scrapeWeidian(itemId: string): Promise<ScrapeResult> {
  const param = encodeURIComponent(JSON.stringify({ itemId }));
  const response = await fetch(`https://thor.weidian.com/detail/getItemSkuInfo/1.0?param=${param}`, {
    cache: "no-store",
    headers: { "User-Agent": DESKTOP_UA, Referer: "https://weidian.com/", Accept: "application/json, text/plain, */*" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`a API do Weidian respondeu ${response.status}`);

  const data = (await response.json()) as WeidianReply;
  const result = data.result;
  if (data.status?.code !== 0 || !result) {
    throw new Error(`a API do Weidian não devolveu o item (${data.status?.message ?? "sem dados"})`);
  }

  // O Weidian manda o preço em centavos (fen).
  const cents = Number(result.itemDiscountLowPrice ?? result.itemOriginalLowPrice);
  return {
    title: cleanTitle(result.itemTitle),
    imageUrl: normalizeImageUrl(result.itemMainPic),
    price: Number.isFinite(cents) && cents > 0 ? cents / 100 : null,
    via: "API do Weidian",
  };
}
