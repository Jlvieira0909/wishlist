import { deleteCategory, renameCategory, respond } from "@/lib/service";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  return respond(() => renameCategory(id, body?.name));
}

/** Os itens da categoria não são apagados: ficam "sem categoria". */
export async function DELETE(_request: Request, { params }: Context) {
  const { id } = await params;
  return respond(() => deleteCategory(id));
}
