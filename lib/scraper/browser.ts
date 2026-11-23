import { promises as fs } from "node:fs";
import path from "node:path";
import type { Browser, Page, Response } from "playwright-core";
import type { ProductRef } from "../links";
import { blobEnabled, onVercel } from "../env";
import { DEBUG_DIR } from "../paths";
import { uploadDebugFile } from "../storage/images";
import {
  cleanTitle,
  isGenericTitle,
  messageOf,
  normalizeImageUrl,
  parseLooseJson,
  pickFromCaptures,
  ScrapeError,
  type Captured,
  type NetPick,
  type ScrapeResult,
} from "./extract";

const MAX_PARALLEL = 2; // páginas abertas ao mesmo tempo (colar 20 links não abre 20 abas)
const IDLE_CLOSE_MS = 90_000; // fecha o navegador depois de 1min30 sem uso
const NAVIGATION_TIMEOUT_MS = 30_000;
const EXTRACTION_TIMEOUT_MS = 20_000;
const POLL_MS = 800;

type PageInfo = {
  ldName: string;
  ldImage: string;
  ldPrice: number | null;
  ogTitle: string;
  ogImage: string;
  domTitle: string;
  domImage: string;
  domPrice: number | null;
};

type Reading = { title: string | null; imageUrl: string | null; price: number | null; confident: boolean };

type BrowserState = {
  browser: Browser | null;
  launching: Promise<Browser> | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
  active: number;
  waiting: Array<() => void>;
};

// Fica no globalThis para sobreviver ao hot reload do `next dev`.
const globals = globalThis as typeof globalThis & { __garimpoBrowser?: BrowserState };
const state: BrowserState = (globals.__garimpoBrowser ??= {
  browser: null,
  launching: null,
  idleTimer: null,
  active: 0,
  waiting: [],
});

/** Abre a página do produto no CSSBUY e devolve nome, foto e preço que ela mostrar. */
export async function scrapeWithBrowser(pageUrl: string, ref: ProductRef): Promise<ScrapeResult> {
  await acquireSlot();
  try {
    const browser = await getBrowser();
    const context = await browser.newContext({
      userAgent: userAgentFor(browser),
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
      viewport: { width: 1366, height: 900 },
      serviceWorkers: "block",
    });
    try {
      await context.addInitScript({ content: "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });" });
      await context.route("**/*", (route) => {
        const type = route.request().resourceType();
        return type === "media" || type === "font" ? route.abort() : route.continue();
      });
      const page = await context.newPage();
      const captured: Captured[] = [];
      page.on("response", (response) => void capture(response, captured));
      return await readProduct(page, pageUrl, ref, captured);
    } finally {
      await context.close().catch(() => undefined);
    }
  } finally {
    await releaseSlot();
  }
}

async function readProduct(page: Page, pageUrl: string, ref: ProductRef, captured: Captured[]): Promise<ScrapeResult> {
  const started = Date.now();
  try {
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
  } catch (error) {
    // Estourou o tempo: segue e tenta ler o que já carregou. Outro erro (sem internet etc.): desiste.
    if (!/timeout/i.test(messageOf(error))) {
      // "page.goto: net::ERR_NAME_NOT_RESOLVED at https://..." -> "net::ERR_NAME_NOT_RESOLVED"
      const reason = messageOf(error).replace(/^page\.goto:\s*/, "").replace(/\s+at\s+https?:\/\/\S+$/, "");
      const debugUrl = await saveDebug(page, captured, "ultima-falha", { pageUrl, motivo: reason });
      throw new ScrapeError(`não consegui abrir a página do CSSBUY: ${reason}`, debugUrl);
    }
  }

  const extractionStart = Date.now();
  let reading: Reading = { title: null, imageUrl: null, price: null, confident: false };
  let previous = "";
  let stableRounds = 0;
  while (Date.now() - extractionStart < EXTRACTION_TIMEOUT_MS) {
    await page.waitForTimeout(POLL_MS);
    const info = (await page.evaluate(READ_PAGE).catch(() => null)) as PageInfo | null;
    reading = combine(info, pickFromCaptures(captured, ref.id));
    if (reading.confident) break;

    // Sem dado "oficial" (API com o ID, JSON-LD, og:tags), mas nome e foto pararam de mudar: aceita.
    const signature = `${reading.title}\n${reading.imageUrl}`;
    stableRounds = reading.title && reading.imageUrl && signature === previous ? stableRounds + 1 : 0;
    previous = signature;
    if (stableRounds >= 3 && Date.now() - extractionStart > 4_000) break;
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (!reading.title && !reading.imageUrl) {
    const debugUrl = await saveDebug(page, captured, "ultima-falha", { pageUrl, segundos: seconds });
    throw new ScrapeError("a página do CSSBUY abriu, mas não achei nome nem foto nela", debugUrl);
  }
  if (process.env.GARIMPO_DEBUG === "1") {
    await saveDebug(page, captured, "ultima-busca", { pageUrl, segundos: seconds, leitura: reading });
  }
  console.info(
    `[garimpo] CSSBUY ${ref.platform} ${ref.id}: leitura ${reading.confident ? "completa" : "parcial"} em ${seconds}s`,
  );
  return { title: reading.title, imageUrl: reading.imageUrl, price: reading.price, via: "página do CSSBUY" };
}

/** Junta o que veio das respostas JSON com o que está na página, em ordem de confiança. */
function combine(info: PageInfo | null, net: NetPick | null): Reading {
  const titles = [net?.title, info?.ldName, info?.ogTitle, info?.domTitle];
  const title =
    titles.map((value) => cleanTitle(value)).find((value): value is string => !!value && !isGenericTitle(value)) ?? null;
  const images = [net?.image, info?.ldImage, info?.ogImage, info?.domImage];
  const imageUrl = images.map((value) => normalizeImageUrl(value)).find((value): value is string => !!value) ?? null;
  // O preço exibido na tela é o mais confiável (APIs às vezes mandam em centavos).
  const price = info?.domPrice ?? info?.ldPrice ?? net?.price ?? null;

  let confident = Boolean(net?.title && net.image && net.matchesId);
  if (info) {
    const ogTitle = cleanTitle(info.ogTitle);
    const ogImage = normalizeImageUrl(info.ogImage);
    if (info.ldName && info.ldImage) confident = true;
    if (ogTitle && !isGenericTitle(ogTitle) && ogImage && /alicdn|geilicdn|goofish|xianyu/i.test(ogImage)) confident = true;
  }
  return { title, imageUrl, price, confident };
}

async function capture(response: Response, into: Captured[]): Promise<void> {
  try {
    const kind = response.request().resourceType();
    if (kind !== "xhr" && kind !== "fetch") return;
    const type = response.headers()["content-type"] ?? "";
    if (!/json|javascript|text\/plain/i.test(type)) return;
    const text = await response.text();
    if (text.length > 5_000_000) return;
    const json = parseLooseJson(text);
    if (json !== undefined) into.push({ url: response.url(), json, preview: text.slice(0, 3_000) });
  } catch {
    // corpo indisponível (redirect, página já fechada)
  }
}

/**
 * Guarda print, HTML e respostas da página para investigar uma leitura que falhou.
 * Local: pasta data/debug. Na nuvem: Vercel Blob (devolve o link do print).
 */
async function saveDebug(
  page: Page,
  captured: Captured[],
  folder: string,
  details: Record<string, unknown>,
): Promise<string | null> {
  try {
    const screenshot = await takeScreenshot(page);
    const html = await page.content().catch(() => "");
    const respostas = captured.map(({ url, preview }) => ({ url, inicio: preview }));
    const report = JSON.stringify({ ...details, respostas }, null, 2);

    if (blobEnabled()) {
      await uploadDebugFile(`${folder}.json`, report, "application/json; charset=utf-8");
      await uploadDebugFile(`${folder}.html.txt`, html, "text/plain; charset=utf-8");
      const url = screenshot ? await uploadDebugFile(`${folder}.png`, screenshot, "image/png") : null;
      console.info(`[garimpo] print da página: ${url ?? "indisponível"}`);
      return url;
    }
    if (onVercel()) return null;

    const dir = path.join(DEBUG_DIR, folder);
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
    if (screenshot) await fs.writeFile(path.join(dir, "tela.png"), screenshot);
    await fs.writeFile(path.join(dir, "pagina.html"), html, "utf8");
    await fs.writeFile(path.join(dir, "detalhes.json"), report, "utf8");
    console.info(`[garimpo] detalhes salvos em data/debug/${folder}`);
    return null;
  } catch {
    return null; // depuração é opcional
  }
}

async function takeScreenshot(page: Page): Promise<Buffer | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await page.screenshot({ timeout: 10_000 });
    } catch (error) {
      console.warn(`[garimpo] print da página falhou (tentativa ${attempt}): ${messageOf(error)}`);
      await page.waitForTimeout(500).catch(() => undefined);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Navegador: um só, reaproveitado entre buscas e fechado quando fica parado.
// ---------------------------------------------------------------------------

async function acquireSlot(): Promise<void> {
  if (state.idleTimer) {
    clearTimeout(state.idleTimer);
    state.idleTimer = null;
  }
  if (state.active >= MAX_PARALLEL) await new Promise<void>((resolve) => state.waiting.push(resolve));
  state.active += 1;
}

async function releaseSlot(): Promise<void> {
  state.active -= 1;
  const next = state.waiting.shift();
  if (next) next();
  else if (state.active === 0) {
    // Na Vercel a função pode ser congelada depois da resposta: fecha o navegador já.
    if (onVercel()) await closeBrowser();
    else scheduleIdleClose();
  }
}

async function closeBrowser(): Promise<void> {
  const browser = state.browser;
  state.browser = null;
  await browser?.close().catch(() => undefined);
}

function scheduleIdleClose(): void {
  if (state.idleTimer) clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(() => {
    state.idleTimer = null;
    if (state.active > 0) return;
    void closeBrowser();
  }, IDLE_CLOSE_MS);
}

async function getBrowser(): Promise<Browser> {
  if (state.browser?.isConnected()) return state.browser;
  if (!state.launching) {
    state.launching = launchBrowser()
      .then((browser) => {
        state.browser = browser;
        browser.on("disconnected", () => {
          if (state.browser === browser) state.browser = null;
        });
        return browser;
      })
      .finally(() => {
        state.launching = null;
      });
  }
  return state.launching;
}

async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  if (onVercel()) {
    // Na Vercel não existe Chrome instalado: usa o Chromium feito para funções serverless.
    const serverless = (await import("@sparticuz/chromium")).default;
    const browser = await chromium.launch({
      args: serverless.args,
      executablePath: await serverless.executablePath(),
      headless: true,
    });
    console.info(`[garimpo] usando Chromium serverless ${browser.version()} para ler o CSSBUY`);
    return browser;
  }
  const customPath = process.env.GARIMPO_BROWSER_PATH?.trim();
  const headless = process.env.GARIMPO_SHOW_BROWSER !== "1";
  // Usa o navegador que já está instalado: Chrome primeiro, Edge (sempre presente no Windows) depois.
  const attempts: Array<{ label: string; channel?: string; executablePath?: string }> = customPath
    ? [{ label: customPath, executablePath: customPath }]
    : [
        { label: "Chrome", channel: "chrome" },
        { label: "Edge", channel: "msedge" },
      ];

  const problems: string[] = [];
  for (const { label, ...where } of attempts) {
    try {
      const browser = await chromium.launch({
        ...where,
        headless,
        args: ["--disable-blink-features=AutomationControlled"],
      });
      console.info(`[garimpo] usando ${label} ${browser.version()} para ler o CSSBUY`);
      return browser;
    } catch (error) {
      problems.push(`${label}: ${messageOf(error)}`);
    }
  }
  throw new Error(
    `não consegui abrir o Chrome nem o Edge (${problems.join(" / ")}). ` +
      "Se usa outro navegador, defina GARIMPO_BROWSER_PATH no .env.local",
  );
}

/** User-agent de navegador comum (o modo sem janela se anuncia como "HeadlessChrome"). */
function userAgentFor(browser: Browser): string {
  const major = browser.version().split(".")[0] || "141";
  const system =
    process.platform === "darwin"
      ? "Macintosh; Intel Mac OS X 10_15_7"
      : process.platform === "linux"
        ? "X11; Linux x86_64"
        : "Windows NT 10.0; Win64; x64";
  return `Mozilla/5.0 (${system}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

/**
 * Roda dentro da página. Fica como texto (e não como função) para o bundler do Next
 * não mexer no código antes de ele ir para o navegador.
 */
const READ_PAGE = String.raw`(() => {
  const out = { ldName: "", ldImage: "", ldPrice: null, ogTitle: "", ogImage: "", domTitle: "", domImage: "", domPrice: null };

  const visit = (node, depth) => {
    if (!node || typeof node !== "object" || depth > 8) return;
    if (Array.isArray(node)) { node.forEach((entry) => visit(entry, depth + 1)); return; }
    const type = node["@type"];
    const isProduct = type === "Product" || (Array.isArray(type) && type.indexOf("Product") >= 0);
    if (isProduct) {
      if (!out.ldName && typeof node.name === "string") out.ldName = node.name;
      let img = Array.isArray(node.image) ? node.image[0] : node.image;
      if (img && typeof img === "object") img = img.url || img.contentUrl || "";
      if (!out.ldImage && typeof img === "string") out.ldImage = img;
      const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
      const ldPrice = offer ? parseFloat(offer.price || offer.lowPrice) : NaN;
      if (out.ldPrice === null && ldPrice > 0) out.ldPrice = ldPrice;
    }
    if (node["@graph"]) visit(node["@graph"], depth + 1);
    if (node.mainEntity) visit(node.mainEntity, depth + 1);
  };
  document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
    try { visit(JSON.parse(script.textContent || ""), 0); } catch (error) {}
  });

  const meta = (name) => {
    const el = document.querySelector('meta[property="' + name + '"], meta[name="' + name + '"]');
    return el ? el.getAttribute("content") || "" : "";
  };
  out.ogTitle = meta("og:title");
  out.ogImage = meta("og:image");

  const outside = "header, nav, footer, [class*='recommend' i], [class*='similar' i], [class*='guess' i]";
  const CDN = /alicdn\.com|geilicdn\.com|goofish|xianyu|tbcdn|taobaocdn/i;
  const UI = /(?:^|[\/_.-])(?:logo|icons?|avatar|banner|qrcode|sprite|placeholder|loading)(?:[\/_.-]|$)/i;

  let bestImage = null;
  document.querySelectorAll("img").forEach((img) => {
    const src = img.currentSrc || img.src || img.getAttribute("data-src") || img.getAttribute("data-original") || "";
    if (!/^https?:/i.test(src) || UI.test(src) || img.closest(outside)) return;
    const box = img.getBoundingClientRect();
    if (box.width < 180 || box.height < 180 || box.top > 1600) return;
    const score = box.width * box.height * (CDN.test(src) ? 1.5 : 1);
    if (!bestImage || score > bestImage.score) bestImage = { src: src, score: score };
  });
  if (bestImage) out.domImage = bestImage.src;

  let bestTitle = null;
  document.querySelectorAll("h1, h2, h3, [class*='title' i], [class*='name' i]").forEach((el) => {
    if (el.closest(outside)) return;
    const text = (el.innerText || "").replace(/\s+/g, " ").trim();
    if (text.length < 6 || text.length > 300 || el.querySelectorAll("*").length > 15) return;
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height || box.top > 1200) return;
    const size = parseFloat(getComputedStyle(el).fontSize) || 12;
    const score = size + Math.min(text.length, 60) / 15 + (/[\u4e00-\u9fff]/.test(text) ? 3 : 0) + (el.tagName === "H1" ? 4 : 0);
    if (!bestTitle || score > bestTitle.score) bestTitle = { text: text, score: score };
  });
  if (bestTitle) out.domTitle = bestTitle.text;

  const priceEl = Array.from(document.querySelectorAll("[class*='price' i]")).find(
    (el) => !el.closest(outside) && /(?:CNY|¥|￥)\s*\d/.test(el.textContent || "")
  );
  const match = priceEl ? (priceEl.textContent || "").match(/(?:CNY|¥|￥)\s*(\d[\d,]*(?:\.\d+)?)/) : null;
  if (match) {
    const value = parseFloat(match[1].replace(/,/g, ""));
    if (value > 0) out.domPrice = value;
  }
  return out;
})()`;
