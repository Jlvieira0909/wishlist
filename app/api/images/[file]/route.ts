import { readLocalImage } from "@/lib/store";

/** Serve as fotos do modo local (pasta data/images). Na nuvem as fotos vêm direto do Vercel Blob. */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const image = await readLocalImage(file);
  if (!image) return new Response("Imagem não encontrada", { status: 404 });
  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.type,
      // O nome do arquivo muda quando a foto é trocada, então dá para guardar em cache para sempre.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
