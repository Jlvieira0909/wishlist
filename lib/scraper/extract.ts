/** Ajudantes compartilhados pelos leitores de produto. */

export const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
export const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

export type ScrapeResult = {
  title: string | null;
  imageUrl: string | null;
  /** Preço em yuan. */
  price: number | null;
  /** De onde veio o dado (só para o log). */
  via: string;
};

export function messageOf(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.split("\n")[0].slice(0, 240);
}

export function normalizeImageUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let url = raw.trim();
  if (url.startsWith("//")) url = `https:${url}`;
  if (!/^https?:\/\//i.test(url)) return null;
  // Miniatura do alicdn (foto.jpg_400x400q90.jpg_.webp) -> imagem original (foto.jpg)
  return url.replace(/(\.(?:jpe?g|png|webp|gif))_[^/]*$/i, "$1");
}

const SITE_SUFFIX =
  /\s*[-|–—_]\s*(?:cssbuy|淘宝网?|taobao|tmall|天猫|闲鱼|goofish|微店|weidian|阿里巴巴)[^-|–—_]*$/i;

export function cleanTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").replace(SITE_SUFFIX, "").trim();
  if (text.length < 2) return null;
  return text.length > 300 ? `${text.slice(0, 299)}…` : text;
}

/** Títulos que são do site, não do produto ("CSSBuy: Taobao Agent", "淘宝网"...). */
export function isGenericTitle(title: string): boolean {
  const text = title.trim().toLowerCase();
  return (
    text.length < 3 ||
    /^(?:cssbuy|css buy)\b/.test(text) ||
    /(?:taobao|shopping|purchasing) agent/.test(text) ||
    /^(?:淘宝网?|天猫|闲鱼|微店|1688|goofish|weidian|taobao|xianyu|loading|carregando)\.*$/.test(text)
  );
}

export function parsePrice(raw: unknown): number | null {
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.replace(/,/g, "").match(/\d+(?:\.\d+)?/)?.[0]) : NaN;
  return Number.isFinite(value) && value > 0 && value < 10_000_000 ? value : null;
}

/** JSON normal ou JSONP (callback({...})). */
export function parseLooseJson(text: string): unknown {
  const body = text.trim();
  if (!body) return undefined;
  try {
    if (body.startsWith("{") || body.startsWith("[")) return JSON.parse(body);
    const jsonp = body.match(/^[\w$.]+\s*\(([\s\S]*)\)\s*;?$/);
    return jsonp ? JSON.parse(jsonp[1]) : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Garimpo nas respostas JSON que a página do CSSBUY recebe enquanto carrega.
// Não sabemos o formato exato da API deles, então procuramos o objeto que tem
// um título + uma foto, de preferência junto com o ID do produto.
// ---------------------------------------------------------------------------

export type Captured = { url: string; json: unknown; preview: string };
export type NetPick = { title: string | null; image: string | null; price: number | null; matchesId: boolean };

const keyOf = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");

const TITLE_KEYS = new Set([
  "title", "itemtitle", "goodstitle", "goodsname", "productname", "producttitle", "itemname",
  "subject", "titlecn", "titleen", "cntitle", "entitle", "translatetitle", "titletranslate", "name",
]);
const IMAGE_KEYS = new Set([
  "pic", "picurl", "mainpic", "mainpicurl", "itemmainpic", "image", "imageurl", "img", "imgurl",
  "mainimage", "mainimageurl", "mainimg", "picture", "cover", "coverurl", "thumb", "thumbnail",
  "goodsimg", "goodsimage", "itemimg", "itempic", "picpath", "images", "imgs", "pics", "piclist",
  "itemimgs", "imagelist", "mainimages", "imgurls", "picurls", "smallimages", "topimages",
  "gallery", "imglist", "mainpics", "itempics", "picturelist",
]);
const PRICE_KEYS = new Set([
  "price", "saleprice", "promotionprice", "itemprice", "goodsprice", "minprice", "lowprice",
  "pricemin", "discountprice", "currentprice", "showprice",
]);
const ID_KEYS = new Set(["id", "itemid", "goodsid", "numiid", "productid", "offerid", "itemnumid"]);

const UI_ASSET =
  /cssbuy\.com\/(?:static|images?|img|assets)\/|(?:^|[/_.-])(?:logo|icons?|avatar|banner|qrcode|sprite|placeholder)(?:[/_.-]|$)/i;
const HAS_LETTERS = /[a-z\u00c0-\u024f\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/i;

function looksLikeImage(value: string): boolean {
  const text = value.trim();
  if (!/^(?:https?:)?\/\//i.test(text) || UI_ASSET.test(text)) return false;
  return (
    /\.(?:jpe?g|png|webp|gif|avif)(?:$|[?_!#.])/i.test(text) ||
    /alicdn\.com|geilicdn\.com|tbcdn|taobaocdn|goofish|xianyu/i.test(text)
  );
}

function firstImage(value: unknown, depth = 0): string | null {
  if (depth > 3) return null;
  if (typeof value === "string") return looksLikeImage(value) ? normalizeImageUrl(value) : null;
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 6)) {
      const found = firstImage(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (!/^(?:url|src|img|image|pic|picurl|fullpath|path|original|large|big)$/i.test(key)) continue;
      const found = firstImage(entry, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function titleFrom(key: string, value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  // "name" aparece em tudo (loja, cor, categoria), então exige um texto mais longo.
  if (text.length < (key === "name" ? 8 : 4) || text.length > 400) return null;
  if (/^(?:https?:)?\/\//i.test(text) || !HAS_LETTERS.test(text)) return null;
  return cleanTitle(text);
}

type Frame = { node: unknown; inList: boolean; idAbove: boolean; depth: number };
type Best = {
  both: { title: string; image: string; price: number | null; matchesId: boolean; score: number } | null;
  title: { value: string; score: number } | null;
  image: { value: string; score: number } | null;
};

export function pickFromCaptures(captures: Captured[], itemId: string): NetPick | null {
  const best: Best = { both: null, title: null, image: null };

  for (const capture of captures) {
    const urlMatches = capture.url.includes(itemId);
    const stack: Frame[] = [{ node: capture.json, inList: false, idAbove: false, depth: 0 }];
    let budget = 40_000;

    while (budget-- > 0) {
      const frame = stack.pop();
      if (!frame) break;
      const { node, inList, idAbove, depth } = frame;
      if (!node || typeof node !== "object" || depth > 12) continue;

      if (Array.isArray(node)) {
        // Listas longas costumam ser "produtos parecidos": valem menos.
        const longList = inList || node.length > 4;
        for (const child of node.slice(0, 300)) stack.push({ node: child, inList: longList, idAbove, depth: depth + 1 });
        continue;
      }

      const record = node as Record<string, unknown>;
      let title: string | null = null;
      let image: string | null = null;
      let price: number | null = null;
      let hasId = false;
      for (const [rawKey, value] of Object.entries(record)) {
        const key = keyOf(rawKey);
        if (!title && TITLE_KEYS.has(key)) title = titleFrom(key, value);
        if (!image && IMAGE_KEYS.has(key)) image = firstImage(value);
        if (price === null && PRICE_KEYS.has(key)) price = parsePrice(value);
        if (!hasId && ID_KEYS.has(key) && String(value) === itemId) hasId = true;
      }

      const matchesId = hasId || idAbove || urlMatches;
      const base = (matchesId ? 4 : 0) + (hasId ? 2 : 0) - (inList ? 4 : 0);
      if (title && image) {
        const score = base + 6 + (price !== null ? 1 : 0) + Math.min(title.length, 60) / 30;
        if (!best.both || score > best.both.score) best.both = { title, image, price, matchesId, score };
      } else if (matchesId && !inList) {
        if (title) {
          const score = base + Math.min(title.length, 60) / 30;
          if (!best.title || score > best.title.score) best.title = { value: title, score };
        }
        if (image && (!best.image || base > best.image.score)) best.image = { value: image, score: base };
      }

      for (const child of Object.values(record)) {
        stack.push({ node: child, inList, idAbove: idAbove || hasId, depth: depth + 1 });
      }
    }
  }

  if (best.both?.matchesId) {
    const { title, image, price } = best.both;
    return { title, image, price, matchesId: true };
  }
  const title = best.title?.value ?? best.both?.title ?? null;
  const image = best.image?.value ?? best.both?.image ?? null;
  if (!title && !image) return null;
  return { title, image, price: best.both?.price ?? null, matchesId: Boolean(best.title && best.image) };
}

/** Erro de leitura que pode trazer o link de um print da página (para investigar na nuvem). */
export class ScrapeError extends Error {
  debugUrl: string | null;
  constructor(message: string, debugUrl: string | null = null) {
    super(message);
    this.name = "ScrapeError";
    this.debugUrl = debugUrl;
  }
}

export const debugUrlOf = (error: unknown): string | null => (error instanceof ScrapeError ? error.debugUrl : null);
