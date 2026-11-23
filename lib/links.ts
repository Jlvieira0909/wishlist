import type { Platform } from "./types";

/** Produto identificado por loja de origem + ID. Roda no servidor e no navegador. */
export type ProductRef = { platform: Platform; id: string };

// Para antes de espaço, aspas e pontuação chinesa (texto de "compartilhar" do Taobao/Xianyu).
const URL_IN_TEXT = /https?:\/\/[^\s"'<>\u3000-\u303f\uff01-\uff60]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}>'"]+$/;
const PRODUCT_ID = /^\d{5,20}$/;

/** Todos os links de um texto colado (dá para colar vários de uma vez). */
export function extractUrls(text: string): string[] {
  const found = (text.match(URL_IN_TEXT) ?? []).map((url) => url.replace(TRAILING_PUNCTUATION, ""));
  if (found.length === 0) {
    const bare = text.trim();
    if (/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S*$/i.test(bare)) found.push(`https://${bare}`);
  }
  return [...new Set(found)];
}

const isDomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

function idFromQuery(url: URL, ...names: string[]): string | null {
  for (const name of names) {
    const value = url.searchParams.get(name);
    if (value && PRODUCT_ID.test(value)) return value;
  }
  return null;
}

/** Converte o "type" do CSSBUY (micro, 1688, xianyu, taobao, tmall...) na loja de origem. */
function platformFromCssbuyType(type: string | null | undefined): Platform {
  switch ((type ?? "").toLowerCase()) {
    case "micro":
    case "weidian":
      return "weidian";
    case "1688":
    case "ali":
    case "alibaba":
      return "1688";
    case "xianyu":
    case "goofish":
    case "idle":
      return "xianyu";
    default:
      return "taobao"; // taobao e tmall compartilham o mesmo tipo no CSSBUY
  }
}

/**
 * Lê loja + ID de um link de produto. Formatos aceitos:
 * - CSSBUY antigo: /item-123.html, /item-micro-123.html, /item-1688-123.html, /item-xianyu-123.html
 * - CSSBUY novo:   /shop/goodsDetail?type=micro&id=123
 * - Links diretos do Taobao/Tmall, Weidian, 1688 e Xianyu/Goofish
 */
export function parseProductUrl(raw: string): ProductRef | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const path = url.pathname;

  if (isDomain(host, "cssbuy.com")) {
    const oldStyle = path.match(/item-(?:([a-z0-9]+)-)?(\d{5,20})/i);
    if (oldStyle) return { platform: platformFromCssbuyType(oldStyle[1]), id: oldStyle[2] };
    const id = idFromQuery(url, "id", "itemId", "goodsId");
    return id ? { platform: platformFromCssbuyType(url.searchParams.get("type")), id } : null;
  }

  const isXianyu =
    isDomain(host, "goofish.com") ||
    isDomain(host, "xianyu.com") ||
    host === "2.taobao.com" ||
    (isDomain(host, "taobao.com") && /idle|fleamarket|xianyu/i.test(path));
  if (isXianyu) {
    const id = idFromQuery(url, "id", "itemId", "item_id") ?? path.match(/\/item\/(\d{5,20})/)?.[1] ?? null;
    return id ? { platform: "xianyu", id } : null;
  }

  if (isDomain(host, "taobao.com") || isDomain(host, "tmall.com") || isDomain(host, "tmall.hk")) {
    const id =
      idFromQuery(url, "id", "itemId", "item_id") ?? path.match(/\/(?:item\/|i)(\d{6,20})/)?.[1] ?? null;
    return id ? { platform: "taobao", id } : null;
  }

  if (isDomain(host, "weidian.com") || isDomain(host, "youshop10.com") || isDomain(host, "koudai.com")) {
    const id =
      idFromQuery(url, "itemID", "itemId", "itemid", "item_id", "id") ??
      path.match(/\/item\/(\d{5,20})/)?.[1] ??
      null;
    return id ? { platform: "weidian", id } : null;
  }

  if (isDomain(host, "1688.com")) {
    const id = path.match(/\/offer\/(\d{5,20})/)?.[1] ?? idFromQuery(url, "offerId", "offerid", "id");
    return id ? { platform: "1688", id } : null;
  }

  return null;
}

/** Link do produto no formato atual do CSSBUY. */
export function cssbuyUrl(ref: ProductRef): string {
  const type = ref.platform === "weidian" ? "micro" : ref.platform;
  return `https://www.cssbuy.com/shop/goodsDetail?type=${type}&id=${ref.id}`;
}

export function isCssbuyUrl(raw: string): boolean {
  try {
    return isDomain(new URL(raw).hostname.toLowerCase(), "cssbuy.com");
  } catch {
    return false;
  }
}

// Encurtadores: link de afiliado do CSSBUY e links de "compartilhar" dos apps chineses.
const SHORT_LINK_DOMAINS = ["cssb.uy", "tb.cn", "qr.1688.com", "k.youshop10.com"];

export function isShortLink(raw: string): boolean {
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return SHORT_LINK_DOMAINS.some((domain) => isDomain(host, domain));
  } catch {
    return false;
  }
}
