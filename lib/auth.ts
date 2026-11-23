import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { appPassword } from "./env";

export const SESSION_COOKIE = "garimpo_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365; // 1 ano

const sign = (password: string, expires: string) =>
  createHmac("sha256", password).update(`garimpo-session:${expires}`).digest("base64url");

/** Comparação em tempo constante (não vaza quantos caracteres batem). */
function sameText(a: string, b: string): boolean {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

export function passwordMatches(input: string): boolean {
  const password = appPassword();
  return password !== "" && sameText(input, password);
}

/** Sessão = validade + assinatura com a senha. Trocar a senha desloga todo mundo. */
export function createSessionToken(): string {
  const expires = String(Date.now() + SESSION_MAX_AGE * 1000);
  return `${expires}.${sign(appPassword(), expires)}`;
}

export function isValidSession(token: string | undefined): boolean {
  const password = appPassword();
  if (!password || !token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || !/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  return sameText(signature, sign(password, expires));
}
