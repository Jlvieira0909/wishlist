import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { del, put } from "@vercel/blob";
import { blobEnabled, onVercel } from "../env";
import { IMAGES_DIR } from "../paths";
import { DESKTOP_UA, messageOf } from "../scraper/extract";

// Fotos: no Vercel Blob quando BLOB_READ_WRITE_TOKEN existe; senão em data/images (modo local).
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const LOCAL_PREFIX = "/api/images/";
const LOCAL_FILE = /^[a-f0-9-]{36}-[a-f0-9]{6}\.(?:jpg|png|webp|gif|avif)$/;
const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

function detectImageType(data: Buffer): string | null {
  if (data.length < 12) return null;
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpg";
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (data.toString("ascii", 0, 3) === "GIF") return "gif";
  if (data.toString("ascii", 4, 8) === "ftyp" && /^avi[fs]/.test(data.toString("ascii", 8, 12))) return "avif";
  return null;
}

/** Guarda a foto e devolve o endereço para mostrar na tela. */
export async function saveImage(itemId: string, data: Buffer): Promise<string> {
  if (data.length > MAX_IMAGE_BYTES) throw new Error("a imagem passa de 15 MB");
  const extension = detectImageType(data);
  if (!extension) throw new Error("o arquivo não é uma imagem JPG, PNG, WebP, GIF ou AVIF");
  const name = `${itemId}-${randomBytes(3).toString("hex")}.${extension}`;

  if (blobEnabled()) {
    const blob = await put(`garimpo/${name}`, data, {
      access: "public",
      contentType: MIME[extension],
      addRandomSuffix: false,
      cacheControlMaxAge: 31_536_000, // o nome muda quando a foto é trocada
    });
    return blob.url;
  }
  if (onVercel()) throw new Error("conecte um Vercel Blob ao projeto para salvar fotos");

  await fs.mkdir(IMAGES_DIR, { recursive: true });
  await fs.writeFile(path.join(IMAGES_DIR, name), data);
  return `${LOCAL_PREFIX}${name}`;
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
      if (blobEnabled()) await del(url);
      return;
    }
    const file = url.startsWith(LOCAL_PREFIX) ? url.slice(LOCAL_PREFIX.length) : url;
    if (LOCAL_FILE.test(file)) await fs.rm(path.join(IMAGES_DIR, file), { force: true });
  } catch (error) {
    console.warn(`[garimpo] não consegui apagar a foto antiga (${messageOf(error)})`);
  }
}

export async function readLocalImage(file: string): Promise<{ data: Buffer; type: string } | null> {
  if (!LOCAL_FILE.test(file)) return null;
  try {
    const data = await fs.readFile(path.join(IMAGES_DIR, file));
    return { data, type: MIME[file.split(".").pop() ?? ""] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

/** Na nuvem, sobe o print de uma leitura que falhou para dar para ver o que o navegador viu. */
export async function uploadDebugFile(name: string, data: Buffer | string, contentType: string): Promise<string | null> {
  if (!blobEnabled()) return null;
  const blob = await put(`garimpo/debug/${name}`, data, {
    access: "public",
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
  });
  return blob.url;
}
