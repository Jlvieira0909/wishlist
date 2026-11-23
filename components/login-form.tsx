"use client";

import { useState, type FormEvent } from "react";

export default function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        window.location.assign(new URL("/", window.location.origin)); // recarrega já com a sessão
        return;
      }
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Não consegui entrar.");
    } catch {
      setError("Sem resposta do servidor. Confira sua conexão.");
    }
    setBusy(false);
  }

  return (
    <main className="page login">
      <h1 className="wordmark">Garimpo</h1>
      <form className="paste" onSubmit={onSubmit}>
        <label htmlFor="password" className="sr-only">
          Senha
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          placeholder="Senha"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="submit" disabled={busy || !password}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
      <p className="notice error" role="status">
        {error}
      </p>
    </main>
  );
}
