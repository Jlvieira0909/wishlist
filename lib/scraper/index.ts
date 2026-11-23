import type { ProductRef } from "../links";
import { scrapeWithBrowser } from "./browser";
import { debugUrlOf, messageOf, ScrapeError, type ScrapeResult } from "./extract";
import { scrapeWeidian } from "./weidian";

/**
 * Descobre nome, foto e preço de um produto.
 * - Weidian: API pública primeiro (rápido).
 * - Demais lojas, ou se a API falhar: abre a página do produto no CSSBUY num Chromium sem janela
 *   (o Chrome/Edge instalado no PC, ou o Chromium serverless na Vercel) e lê o que a página carregou.
 */
export async function scrapeProduct(ref: ProductRef, pageUrl: string): Promise<ScrapeResult> {
  const problems: string[] = [];
  let partial: ScrapeResult | null = null;
  let debugUrl: string | null = null;

  if (ref.platform === "weidian") {
    try {
      const result = await scrapeWeidian(ref.id);
      if (result.title && result.imageUrl) return result;
      partial = result;
    } catch (error) {
      problems.push(messageOf(error));
    }
  }

  try {
    const result = await scrapeWithBrowser(pageUrl, ref);
    if (!partial) return result;
    return {
      title: result.title ?? partial.title,
      imageUrl: result.imageUrl ?? partial.imageUrl,
      price: result.price ?? partial.price,
      via: result.via,
    };
  } catch (error) {
    problems.push(messageOf(error));
    debugUrl = debugUrlOf(error);
  }

  if (partial) return partial;
  throw new ScrapeError(problems.join("; "), debugUrl);
}
