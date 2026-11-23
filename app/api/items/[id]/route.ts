import { editItem, refreshItem, removeItem, replaceImage, respond } from "@/lib/service";

type Context = { params: Promise<{ id: string }> };

/** Renomear e/ou mudar a categoria: { title?, categoryId? } */
export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { title?: unknown; categoryId?: unknown } | null;
  return respond(() => editItem(id, { title: body?.title, categoryId: body?.categoryId }));
}

/** Buscar nome e foto de novo. */
export async function POST(_request: Request, { params }: Context) {
  const { id } = await params;
  return respond(() => refreshItem(id));
}

/** Trocar a foto (corpo da requisição = arquivo da imagem). */
export async function PUT(request: Request, { params }: Context) {
  const { id } = await params;
  const data = Buffer.from(await request.arrayBuffer());
  return respond(() => replaceImage(id, data));
}

export async function DELETE(_request: Request, { params }: Context) {
  const { id } = await params;
  return respond(() => removeItem(id));
}
