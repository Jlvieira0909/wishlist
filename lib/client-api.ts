import type { Category, WishItem } from "./types";

export type ApiReply = {
  item?: WishItem;
  category?: Category;
  duplicate?: boolean;
  warning?: string | null;
  debugUrl?: string | null;
  error?: string;
};

/** fetch para as rotas do app, com mensagens de erro em português e redirecionamento se a sessão cair. */
export async function callApi(url: string, init: RequestInit = {}): Promise<{ status: number; data: ApiReply }> {
  try {
    const response = await fetch(url, init);
    if (response.status === 401 && url !== "/api/login") window.location.assign(new URL("/entrar", window.location.origin));
    const data = (await response.json().catch(() => ({}))) as ApiReply;
    return { status: response.status, data };
  } catch {
    return { status: 0, data: { error: "Sem resposta do servidor. Confira sua conexão (ou se o npm run dev ainda está rodando)." } };
  }
}

export const isOk = (status: number) => status >= 200 && status < 300;

export const jsonBody = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
