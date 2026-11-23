/** Onde o app está rodando e quais serviços foram configurados. */
export const onVercel = (): boolean => Boolean(process.env.VERCEL);
export const redisUrl = (): string => process.env.REDIS_URL?.trim() || process.env.KV_URL?.trim() || "";
export const appPassword = (): string => process.env.GARIMPO_PASSWORD?.trim() ?? "";

/** Primeira variável de ambiente cujo nome e valor passam no teste (para nomes com prefixo personalizado). */
function findEnv(test: (name: string, value: string) => boolean): string {
  for (const [name, raw] of Object.entries(process.env)) {
    const value = raw?.trim();
    if (value && test(name, value)) return value;
  }
  return "";
}

export type BlobCredentials = { token: string } | { storeId: string };

/**
 * Credenciais do Vercel Blob.
 * - Stores novos se conectam pela autenticação OIDC da Vercel e criam só o BLOB_STORE_ID.
 * - Stores antigos criam o BLOB_READ_WRITE_TOKEN.
 * Também aceita os dois com outro prefixo (ex.: FOTOS_STORE_ID), se um prefixo diferente
 * tiver sido escolhido ao conectar o store ao projeto.
 */
export function blobCredentials(): BlobCredentials | null {
  const token =
    process.env.BLOB_READ_WRITE_TOKEN?.trim() ||
    findEnv((name, value) => name.endsWith("_READ_WRITE_TOKEN") && value.startsWith("vercel_blob_rw_"));
  if (token) return { token };
  const storeId =
    process.env.BLOB_STORE_ID?.trim() ||
    findEnv((name, value) => name.endsWith("_STORE_ID") && /^(?:store_)?[A-Za-z0-9]{8,}$/.test(value));
  return storeId ? { storeId } : null;
}

export const blobEnabled = (): boolean => blobCredentials() !== null;
