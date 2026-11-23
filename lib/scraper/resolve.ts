import { extractUrls, parseProductUrl } from "../links";
import { MOBILE_UA } from "./extract";

/** Segue um link curto (cssb.uy, m.tb.cn...) até chegar no link do produto. */
export async function resolveShortLink(url: string): Promise<string | null> {
  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    const response = await fetch(current, {
      redirect: "manual",
      cache: "no-store",
      headers: { "User-Agent": MOBILE_UA, "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8" },
      signal: AbortSignal.timeout(10_000),
    });

    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, current).toString();
      if (parseProductUrl(current)) return current;
      continue;
    }
    if (!response.ok) return null;

    // Alguns encurtadores devolvem uma página que redireciona via JavaScript.
    const html = (await response.text()).slice(0, 400_000).replace(/\\\//g, "/").replace(/&amp;/g, "&");
    return extractUrls(html).find((candidate) => parseProductUrl(candidate) !== null) ?? null;
  }
  return null;
}
