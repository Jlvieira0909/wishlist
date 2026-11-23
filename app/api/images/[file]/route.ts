import { readStoredFile } from "@/lib/store";

/**
 * Serve as fotos guardadas pelo app: do Vercel Blob privado (na nuvem) ou da pasta data/images (no PC).
 * Fica atrás da senha, como o resto do app. Fotos de um Blob público abrem direto do Blob.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const stored = await readStoredFile(file);
  if (!stored) return new Response("Imagem não encontrada", { status: 404 });
  return new Response(stored.body, {
    headers: {
      "Content-Type": stored.type,
      // O nome da foto muda quando ela é trocada, então dá para guardar em cache para sempre.
      "Cache-Control": stored.debug ? "no-store" : "private, max-age=31536000, immutable",
    },
  });
}
