import { addFromText, respond } from "@/lib/service";

/** Salva um produto a partir do link colado (opcionalmente já numa categoria). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { text?: unknown; categoryId?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text : "";
  return respond(() => addFromText(text, body?.categoryId));
}
