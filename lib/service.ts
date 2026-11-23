import { randomUUID } from "node:crypto";
import { fallbackTitle, needsAttention } from "./format";
import { cssbuyUrl, extractUrls, isCssbuyUrl, isShortLink, parseProductUrl } from "./links";
import { scrapeProduct } from "./scraper";
import { debugUrlOf, messageOf, type ScrapeResult } from "./scraper/extract";
import { resolveShortLink } from "./scraper/resolve";
import { db, downloadImage, removeImage, saveImage } from "./store";
import type { Category, WishItem } from "./types";

type Reply = { status: number; body: Record<string, unknown> };

const ok = (body: Record<string, unknown>, status = 200): Reply => ({ status, body });
const fail = (status: number, error: string): Reply => ({ status, body: { error } });
const GONE = "Esse item não existe mais. Recarregue a página.";
const GONE_CATEGORY = "Essa categoria não existe mais. Recarregue a página.";

const cleanText = (raw: unknown, max: number) =>
  typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, max) : "";
const sameName = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }) === 0;

/** Roda uma ação da API e transforma qualquer erro inesperado numa resposta legível. */
export async function respond(action: () => Promise<Reply>): Promise<Response> {
  try {
    const { status, body } = await action();
    return Response.json(body, { status });
  } catch (error) {
    console.error("[garimpo]", error);
    return Response.json(
      { error: `Erro inesperado no servidor (${messageOf(error)}). Os detalhes estão no log (terminal ou painel da Vercel).` },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Itens
// ---------------------------------------------------------------------------

export async function addFromText(text: string, rawCategoryId: unknown): Promise<Reply> {
  const [link] = extractUrls(text);
  if (!link) return fail(400, "Cole o link da página do produto no CSSBUY.");

  let source = link;
  let ref = parseProductUrl(source);
  if (!ref && isShortLink(source)) {
    const resolved = await resolveShortLink(source).catch(() => null);
    if (resolved) {
      source = resolved;
      ref = parseProductUrl(resolved);
    }
  }
  if (!ref) {
    return fail(
      422,
      "Não reconheci esse link como um produto. Use o link da página do item no CSSBUY, ou um link direto do Taobao, Weidian, 1688 ou Xianyu.",
    );
  }

  const existing = await db.findByRef(ref);
  if (existing) return ok({ item: existing, duplicate: true });

  const categoryId =
    typeof rawCategoryId === "string" && (await db.listCategories()).some((c) => c.id === rawCategoryId)
      ? rawCategoryId
      : null;
  const now = new Date().toISOString();
  const draft: WishItem = {
    id: randomUUID(),
    platform: ref.platform,
    productId: ref.id,
    url: isCssbuyUrl(source) ? source : cssbuyUrl(ref),
    title: fallbackTitle(ref.platform, ref.id),
    titleEdited: false,
    categoryId,
    image: null,
    imageSource: null,
    price: null,
    createdAt: now,
    updatedAt: now,
  };

  const { problem, debugUrl } = await fillFromSource(draft);
  const { item, duplicate } = await db.insertItem(draft);
  if (duplicate) {
    await removeImage(draft.image);
    return ok({ item, duplicate: true });
  }
  console.info(`[garimpo] salvo: ${item.title} (${item.platform} ${item.productId})`);
  return ok({ item, warning: warningFor(item, problem), debugUrl }, 201);
}

/** Renomear e/ou mudar a categoria. */
export async function editItem(id: string, input: { title?: unknown; categoryId?: unknown }): Promise<Reply> {
  const patch: Partial<WishItem> = {};
  if (input.title !== undefined) {
    const title = cleanText(input.title, 300);
    if (!title) return fail(400, "O nome não pode ficar vazio.");
    patch.title = title;
    patch.titleEdited = true;
  }
  if (input.categoryId !== undefined) {
    if (input.categoryId === null || input.categoryId === "") patch.categoryId = null;
    else if (typeof input.categoryId === "string" && (await db.listCategories()).some((c) => c.id === input.categoryId)) {
      patch.categoryId = input.categoryId;
    } else return fail(400, GONE_CATEGORY);
  }
  if (Object.keys(patch).length === 0) return fail(400, "Nada para alterar.");
  const item = await db.updateItem(id, (stored) => ({ ...stored, ...patch }));
  return item ? ok({ item }) : fail(404, GONE);
}

export async function refreshItem(id: string): Promise<Reply> {
  const current = await db.getItem(id);
  if (!current) return fail(404, GONE);

  const draft: WishItem = { ...current };
  const { problem, debugUrl, replaced } = await fillFromSource(draft);
  const item = await db.updateItem(id, (stored) => ({
    ...stored,
    title: stored.titleEdited ? stored.title : draft.title,
    price: draft.price,
    image: draft.image,
    imageSource: draft.imageSource,
  }));
  if (!item) {
    if (draft.image !== current.image) await removeImage(draft.image);
    return fail(404, GONE);
  }
  await removeImage(replaced);
  return ok({ item, warning: warningFor(item, problem), debugUrl });
}

export async function replaceImage(id: string, data: Buffer): Promise<Reply> {
  if (!(await db.getItem(id))) return fail(404, GONE);
  let url: string;
  try {
    url = await saveImage(id, data);
  } catch (error) {
    return fail(415, `Não deu para usar essa imagem: ${messageOf(error)}.`);
  }
  let previous: string | null = null;
  const item = await db.updateItem(id, (stored) => {
    previous = stored.image;
    return { ...stored, image: url };
  });
  if (!item) {
    await removeImage(url);
    return fail(404, GONE);
  }
  await removeImage(previous);
  return ok({ item });
}

export async function removeItem(id: string): Promise<Reply> {
  const item = await db.deleteItem(id);
  if (!item) return fail(404, "Esse item já tinha sido excluído.");
  await removeImage(item.image);
  return ok({ ok: true });
}

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

export async function createCategory(rawName: unknown): Promise<Reply> {
  const name = cleanText(rawName, 40);
  if (!name) return fail(400, "Dê um nome para a categoria.");
  const existing = (await db.listCategories()).find((category) => sameName(category.name, name));
  if (existing) return ok({ category: existing, duplicate: true });
  const category: Category = { id: randomUUID(), name, createdAt: new Date().toISOString() };
  await db.saveCategory(category);
  return ok({ category }, 201);
}

export async function renameCategory(id: string, rawName: unknown): Promise<Reply> {
  const name = cleanText(rawName, 40);
  if (!name) return fail(400, "O nome da categoria não pode ficar vazio.");
  const categories = await db.listCategories();
  const current = categories.find((category) => category.id === id);
  if (!current) return fail(404, GONE_CATEGORY);
  if (categories.some((category) => category.id !== id && sameName(category.name, name))) {
    return fail(409, "Já existe uma categoria com esse nome.");
  }
  const category: Category = { ...current, name };
  await db.saveCategory(category);
  return ok({ category });
}

export async function deleteCategory(id: string): Promise<Reply> {
  return (await db.deleteCategory(id)) ? ok({ ok: true }) : fail(404, GONE_CATEGORY);
}

// ---------------------------------------------------------------------------

/** Preenche nome, preço e foto a partir da loja. Devolve o problema (se houver) e a foto substituída. */
async function fillFromSource(
  item: WishItem,
): Promise<{ problem: string | null; debugUrl: string | null; replaced: string | null }> {
  let found: ScrapeResult;
  try {
    found = await scrapeProduct({ platform: item.platform, id: item.productId }, item.url);
  } catch (error) {
    const problem = messageOf(error);
    console.warn(`[garimpo] não consegui ler ${item.platform} ${item.productId}: ${problem}`);
    return { problem, debugUrl: debugUrlOf(error), replaced: null };
  }

  console.info(`[garimpo] ${item.platform} ${item.productId} lido via ${found.via}`);
  if (found.title && !item.titleEdited) item.title = found.title;
  if (found.price !== null) item.price = found.price;

  let replaced: string | null = null;
  if (found.imageUrl) {
    item.imageSource = found.imageUrl;
    try {
      const url = await downloadImage(found.imageUrl, item.id);
      replaced = item.image;
      item.image = url;
    } catch (error) {
      console.warn(`[garimpo] não consegui guardar a foto (${messageOf(error)}); vou mostrar direto do link original`);
    }
  }
  return { problem: null, debugUrl: null, replaced };
}

function warningFor(item: WishItem, problem: string | null): string | null {
  if (problem) {
    return `Salvei o link, mas faltaram o nome e a foto (${problem}). Tente “Buscar de novo” no card, ou cole a foto direto nele.`;
  }
  if (needsAttention(item)) return "Salvei, mas veio só parte dos dados. Dá para completar o nome ou a foto direto no card.";
  return null;
}
