/** Onde o app está rodando e quais serviços foram configurados. */
export const onVercel = (): boolean => Boolean(process.env.VERCEL);
export const redisUrl = (): string => process.env.REDIS_URL?.trim() || process.env.KV_URL?.trim() || "";
export const blobEnabled = (): boolean => Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
export const appPassword = (): string => process.env.GARIMPO_PASSWORD?.trim() ?? "";
