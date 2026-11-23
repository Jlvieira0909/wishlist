import { NextResponse } from "next/server";
import { createSessionToken, passwordMatches, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { appPassword } from "@/lib/env";

export async function POST(request: Request) {
  if (!appPassword()) {
    return NextResponse.json({ error: "Este app não tem senha configurada (GARIMPO_PASSWORD)." }, { status: 400 });
  }
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  if (!passwordMatches(password)) {
    await new Promise((resolve) => setTimeout(resolve, 600)); // atrasa quem tenta adivinhar
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}
