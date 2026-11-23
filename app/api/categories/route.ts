import { createCategory, respond } from "@/lib/service";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  return respond(() => createCategory(body?.name));
}
