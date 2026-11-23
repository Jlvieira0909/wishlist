import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { del, get, put } from "@vercel/blob";
import { blobCredentials, blobEnabled, onVercel } from "../env";
import { IMAGES_DIR } from "../paths";
import { DESKTOP_UA, messageOf } from "../scraper/extract";

// Fotos: no Vercel Blob quando BLOB_READ_WRITE_TOKEN existe; senão em data/images (modo local).
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const ROUTE_PREFIX = "/api/images/";
const BLOB_FOLDER = "garimpo/";
const IMAGE_FILE = /^[a-f0-9-]{36}-[a-f0-9]{6}\.(?:jpg|png|webp|gif|avif)$/;
const DEBUG_FILE = /^debug-[a-z-]+\.(?:png|json|html\.txt)$/;
const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  json: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
};

const typeOf = (file: string) => MIME[file.split(".").pop() ?? ""] ?? "application/octet-stream";

function detectImageType(data: Buffer): string | null {
  if (data.length < 12) return null;
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpg";
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (data.toString("ascii", 0, 3) === "GIF") return "gif";
  if (data.toString("ascii", 4, 8) === "ftyp" && /^avi[fs]/.test(data.toString("ascii", 8, 12))) return "avif";
  return null;
}

// ---------------------------------------------------------------------------
// Blob público ou privado: o tipo é escolhido ao criar o store na Vercel e o código
// não tem como saber de antemão. Tenta privado, depois público, e lembra o que funcionou.
// ---------------------------------------------------------------------------

type Access = "public" | "private";

/** Token clássico ou ID do store (OIDC), passados explicitamente para aceitar nomes com prefixo. */
const auth = () => blobCredentials() ?? {};
const globals = globalThis as typeof globalThis & { __garimpoBlobAccess?: Access };

async function putBlob(
  pathname: string,
  data: Buffer | string,
  options: { contentType: string; maxAge: number; overwrite?: boolean },
): Promise<{ url: string; access: Access }> {
  const known = globals.__garimpoBlobAccess;
  const order: Access[] = known ? [known, known === "private" ? "public" : "private"] : ["private", "public"];
  let firstError: unknown = null;
  for (const access of order) {
    try {
      const blob = await put(pathname, data, {
        access,
        contentType: options.contentType,
        addRandomSuffix: false,
        allowOverwrite: options.overwrite ?? false,
        cacheControlMaxAge: options.maxAge,
        ...auth(),
      });
      globals.__garimpoBlobAccess = access;
      return { url: blob.url, access };
    } catch (error) {
      firstError ??= error;
    }
  }
  throw firstError;
}

/** Com VERCEL_BLOB_API_URL (um emulador local do Blob, usado em testes), lê dele em vez da Vercel. */
function blobTarget(pathname: string): string {
  const override = process.env.VERCEL_BLOB_API_URL?.trim();
  return override ? new URL(pathname, override.endsWith("/") ? override : `${override}/`).toString() : pathname;
}

// ---------------------------------------------------------------------------

/**
 * Guarda a foto e devolve o endereço para mostrar na tela.
 * Blob público: o link do próprio Blob. Blob privado ou modo local: /api/images/..., que exige a senha.
 */
export async function saveImage(itemId: string, data: Buffer): Promise<string> {
  if (data.length > MAX_IMAGE_BYTES) throw new Error("a imagem passa de 15 MB");
  const extension = detectImageType(data);
  if (!extension) throw new Error("o arquivo não é uma imagem JPG, PNG, WebP, GIF ou AVIF");
  const name = `${itemId}-${randomBytes(3).toString("hex")}.${extension}`;

  if (blobEnabled()) {
    // o nome muda quando a foto é trocada, então pode ficar em cache por um ano
    const { url, access } = await putBlob(BLOB_FOLDER + name, data, { contentType: MIME[extension], maxAge: 31_536_000 });
    return access === "public" ? url : ROUTE_PREFIX + name;
  }
  if (onVercel()) throw new Error("conecte um Vercel Blob ao projeto para salvar fotos");

  await fs.mkdir(IMAGES_DIR, { recursive: true });
  await fs.writeFile(path.join(IMAGES_DIR, name), data);
  return ROUTE_PREFIX + name;
}

export async function downloadImage(url: string, itemId: string): Promise<string> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": DESKTOP_UA, Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`a foto respondeu ${response.status}`);
  return saveImage(itemId, Buffer.from(await response.arrayBuffer()));
}

export async function removeImage(url: string | null): Promise<void> {
  if (!url) return;
  try {
    if (/\.blob\.vercel-storage\.com\//i.test(url)) {
      if (blobEnabled()) await del(url, auth());
      return;
    }
    const file = url.startsWith(ROUTE_PREFIX) ? url.slice(ROUTE_PREFIX.length) : url;
    if (!IMAGE_FILE.test(file)) return;
    if (blobEnabled()) await del(BLOB_FOLDER + file, auth());
    await fs.rm(path.join(IMAGES_DIR, file), { force: true });
  } catch (error) {
    console.warn(`[garimpo] não consegui apagar a foto antiga (${messageOf(error)})`);
  }
}

export type StoredFile = {
  body: ReadableStream<Uint8Array> | Uint8Array<ArrayBuffer>;
  type: string;
  /** prints de depuração são sobrescritos, então não podem ficar em cache */
  debug: boolean;
};

/** Lê um arquivo para a rota /api/images: do Blob privado ou da pasta data/images. */
export async function readStoredFile(file: string): Promise<StoredFile | null> {
  const debug = DEBUG_FILE.test(file);
  if (!debug && !IMAGE_FILE.test(file)) return null;

  if (blobEnabled()) {
    try {
      const result = await get(blobTarget(BLOB_FOLDER + file), { access: "private", ...auth() });
      if (result?.statusCode === 200) return { body: result.stream, type: result.blob.contentType || typeOf(file), debug };
    } catch (error) {
      console.warn(`[garimpo] não consegui ler ${file} do Blob (${messageOf(error)})`);
    }
  }
  try {
    return { body: new Uint8Array(await fs.readFile(path.join(IMAGES_DIR, file))), type: typeOf(file), debug };
  } catch {
    return null;
  }
}

/** Na nuvem, sobe o print de uma leitura que falhou para dar para ver o que o navegador viu. */
export async function uploadDebugFile(name: string, data: Buffer | string, contentType: string): Promise<string | null> {
  if (!blobEnabled()) return null;
  const file = `debug-${name}`;
  const { url, access } = await putBlob(BLOB_FOLDER + file, data, { contentType, maxAge: 60, overwrite: true });
  return access === "public" ? url : ROUTE_PREFIX + file;
}
