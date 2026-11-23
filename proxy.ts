import { NextResponse, type NextRequest } from "next/server";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";
import { appPassword, onVercel } from "@/lib/env";

/**
 * Protege o app inteiro com a senha de GARIMPO_PASSWORD.
 * Sem senha definida, o app só abre fora da Vercel (no seu PC).
 */
export function proxy(request: NextRequest) {
  const isApi = request.nextUrl.pathname.startsWith("/api/");

  if (!appPassword()) {
    if (!onVercel()) return NextResponse.next();
    const message =
      "Falta definir a senha do Garimpo: crie a variável GARIMPO_PASSWORD no projeto da Vercel (Settings > Environment Variables) e faça um novo deploy.";
    return isApi
      ? NextResponse.json({ error: message }, { status: 503 })
      : new NextResponse(message, { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  if (isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (isApi) {
    return NextResponse.json({ error: "Sua sessão expirou. Recarregue a página e entre de novo." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/entrar", request.url));
}

export const config = {
  matcher: ["/((?!entrar|api/login|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
