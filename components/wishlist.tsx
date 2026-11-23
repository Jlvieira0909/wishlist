"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, type ClipboardEvent, type FormEvent } from "react";
import CategoryBar from "./category-bar";
import FilterBar from "./filter-bar";
import ItemCard from "./item-card";
import { callApi, isOk, jsonBody } from "@/lib/client-api";
import { applyFilters, DEFAULT_FILTERS, hasActiveFilters, type Filters } from "@/lib/filters";
import { byName, PLATFORM_LABEL } from "@/lib/format";
import { extractUrls, parseProductUrl } from "@/lib/links";
import type { Category, Platform, WishItem } from "@/lib/types";

type Pending = { key: string; platform: Platform | null };
type Notice = { tone: "error" | "info"; text: string; link?: string | null } | null;

// Chave dos blocos "buscando..." (contador fora do componente: render continua puro).
let pendingCount = 0;
const nextPendingKey = () => `pending-${++pendingCount}`;

type Props = {
  initialItems: WishItem[];
  initialCategories: Category[];
  loading?: boolean;
  canLogout?: boolean;
  storageNote?: string;
};

export default function Wishlist({ initialItems, initialCategories, loading = false, canLogout = false, storageNote }: Props) {
  const [items, setItems] = useState(initialItems);
  const [categories, setCategories] = useState(initialCategories);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [pending, setPending] = useState<Pending[]>([]);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const categoryIds = useMemo(() => new Set(categories.map((category) => category.id)), [categories]);
  const visible = useMemo(() => applyFilters(items, filters, categoryIds), [items, filters, categoryIds]);
  const inCategory = useMemo(
    () => applyFilters(items, { ...DEFAULT_FILTERS, category: filters.category }, categoryIds).length,
    [items, filters.category, categoryIds],
  );
  const counts = useMemo(() => {
    const perCategory = new Map<string, number>();
    let uncategorized = 0;
    for (const item of items) {
      if (item.categoryId && categoryIds.has(item.categoryId)) {
        perCategory.set(item.categoryId, (perCategory.get(item.categoryId) ?? 0) + 1);
      } else uncategorized += 1;
    }
    return { perCategory, uncategorized };
  }, [items, categoryIds]);
  const activeCategory = categories.find((category) => category.id === filters.category) ?? null;

  const updateFilters = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch }));
  const replaceItem = (item: WishItem) =>
    setItems((list) => list.map((entry) => (entry.id === item.id ? item : entry)));
  const showError = (text: string, link?: string | null) => setNotice({ tone: "error", text, link });

  // ---------- adicionar ----------

  function submit(text: string) {
    const links = extractUrls(text);
    if (links.length === 0) {
      showError("Isso não parece um link. Copie o endereço da página do produto no CSSBUY e cole aqui.");
      return;
    }
    setDraft("");
    setNotice(null);
    // Continua na categoria aberta (o item novo entra nela) e limpa o resto, para ele aparecer.
    setFilters((current) => ({ ...DEFAULT_FILTERS, category: current.category }));
    const categoryId = activeCategory?.id ?? null;
    for (const link of links) void addLink(link, categoryId);
  }

  async function addLink(link: string, categoryId: string | null) {
    const key = nextPendingKey();
    setPending((list) => [{ key, platform: parseProductUrl(link)?.platform ?? null }, ...list]);
    const { status, data } = await callApi("/api/items", { method: "POST", ...jsonBody({ text: link, categoryId }) });
    setPending((list) => list.filter((entry) => entry.key !== key));

    const item = data.item;
    if (!isOk(status) || !item) {
      showError(data.error ?? "Não consegui salvar esse link.");
      return;
    }
    if (data.duplicate) {
      setItems((list) => (list.some((entry) => entry.id === item.id) ? list : [item, ...list]));
      reveal(item.id);
      setNotice({ tone: "info", text: "Esse achado já estava na lista." });
      return;
    }
    setItems((list) => [item, ...list.filter((entry) => entry.id !== item.id)]);
    setFresh((ids) => new Set(ids).add(item.id));
    if (data.warning) showError(data.warning, data.debugUrl);
  }

  /** Rola até um item e destaca por alguns segundos (usado quando o link já estava salvo). */
  function reveal(id: string) {
    setFilters(DEFAULT_FILTERS);
    setHighlighted(id);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlighted(null), 2400);
    setTimeout(() => {
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById(`item-${id}`)?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "center" });
    }, 60);
  }

  // ---------- editar itens ----------

  async function rename(id: string, title: string): Promise<boolean> {
    const { status, data } = await callApi(`/api/items/${id}`, { method: "PATCH", ...jsonBody({ title }) });
    if (!isOk(status) || !data.item) {
      showError(data.error ?? "Não consegui renomear.");
      return false;
    }
    replaceItem(data.item);
    return true;
  }

  async function setItemCategory(id: string, categoryId: string | null) {
    const before = items.find((entry) => entry.id === id);
    if (!before || before.categoryId === categoryId) return;
    replaceItem({ ...before, categoryId }); // muda na hora e desfaz se o servidor recusar
    const { status, data } = await callApi(`/api/items/${id}`, { method: "PATCH", ...jsonBody({ categoryId }) });
    if (!isOk(status) || !data.item) {
      replaceItem(before);
      showError(data.error ?? "Não consegui mudar a categoria.");
      return;
    }
    replaceItem(data.item);
  }

  async function refresh(id: string) {
    const { status, data } = await callApi(`/api/items/${id}`, { method: "POST" });
    if (!isOk(status) || !data.item) {
      showError(data.error ?? "Não consegui buscar de novo.");
      return;
    }
    replaceItem(data.item);
    if (data.warning) showError(data.warning, data.debugUrl);
    else setNotice({ tone: "info", text: "Item atualizado." });
  }

  async function changePhoto(id: string, file: File) {
    const { status, data } = await callApi(`/api/items/${id}`, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!isOk(status) || !data.item) {
      showError(data.error ?? "Não consegui trocar a foto.");
      return;
    }
    replaceItem(data.item);
  }

  async function remove(id: string) {
    const index = items.findIndex((entry) => entry.id === id);
    const removed = items[index];
    setItems((list) => list.filter((entry) => entry.id !== id));
    const { status, data } = await callApi(`/api/items/${id}`, { method: "DELETE" });
    if (isOk(status) || status === 404 || !removed) return;
    setItems((list) => [...list.slice(0, index), removed, ...list.slice(index)]);
    showError(data.error ?? "Não consegui excluir.");
  }

  // ---------- categorias ----------

  async function createCategory(name: string): Promise<Category | null> {
    const { status, data } = await callApi("/api/categories", { method: "POST", ...jsonBody({ name }) });
    const category = data.category;
    if (!isOk(status) || !category) {
      showError(data.error ?? "Não consegui criar a categoria.");
      return null;
    }
    setCategories((list) => (list.some((entry) => entry.id === category.id) ? list : [...list, category].sort(byName)));
    return category;
  }

  async function renameCategory(id: string, name: string): Promise<boolean> {
    const { status, data } = await callApi(`/api/categories/${id}`, { method: "PATCH", ...jsonBody({ name }) });
    const category = data.category;
    if (!isOk(status) || !category) {
      showError(data.error ?? "Não consegui renomear a categoria.");
      return false;
    }
    setCategories((list) => list.map((entry) => (entry.id === id ? category : entry)).sort(byName));
    return true;
  }

  async function deleteCategory(id: string): Promise<boolean> {
    const { status, data } = await callApi(`/api/categories/${id}`, { method: "DELETE" });
    if (!isOk(status) && status !== 404) {
      showError(data.error ?? "Não consegui excluir a categoria.");
      return false;
    }
    setCategories((list) => list.filter((entry) => entry.id !== id));
    setItems((list) => list.map((item) => (item.categoryId === id ? { ...item, categoryId: null } : item)));
    setFilters((current) => (current.category === id ? { ...current, category: "all" } : current));
    return true;
  }

  async function logout() {
    await callApi("/api/logout", { method: "POST" });
    window.location.assign(new URL("/entrar", window.location.origin));
  }

  // ---------- colar ----------

  // Ctrl+V em qualquer lugar da página (fora de campos de texto) também salva o link.
  const onDocumentPaste = useEffectEvent((event: globalThis.ClipboardEvent) => {
    if (loading || event.defaultPrevented) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("input, textarea, select, [contenteditable], dialog")) return;
    const text = event.clipboardData?.getData("text") ?? "";
    if (extractUrls(text).length === 0) return;
    event.preventDefault();
    submit(text);
  });

  useEffect(() => {
    const listener = (event: globalThis.ClipboardEvent) => onDocumentPaste(event);
    document.addEventListener("paste", listener);
    return () => document.removeEventListener("paste", listener);
  }, []);

  function onInputPaste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text");
    if (extractUrls(text).length === 0) return;
    event.preventDefault();
    submit(text);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.trim()) submit(draft);
  }

  const showGrid = items.length > 0 || pending.length > 0;
  const emptyMessage =
    activeCategory && !hasActiveFilters(filters)
      ? `Nada em “${activeCategory.name}” ainda. Com esta categoria aberta, os links que você colar entram nela.`
      : "Nenhum item com esses filtros.";

  return (
    <main className="page">
      {canLogout && (
        <div className="topbar">
          <button type="button" className="text-button quiet" onClick={() => void logout()}>
            Sair
          </button>
        </div>
      )}

      <header className="masthead">
        <h1 className="wordmark">Garimpo</h1>
        <div className="intake">
          <form className="paste" onSubmit={onSubmit}>
            <label htmlFor="product-link" className="sr-only">
              Link do produto
            </label>
            <input
              id="product-link"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="Cole aqui o link do produto no CSSBUY"
              value={draft}
              disabled={loading}
              onChange={(event) => setDraft(event.target.value)}
              onPaste={onInputPaste}
            />
            <button type="submit" disabled={loading || !draft.trim()}>
              Salvar
            </button>
          </form>
          <p className="hint">
            {activeCategory && (
              <>
                Itens novos entram em <strong>{activeCategory.name}</strong>.{" "}
              </>
            )}
            Aceita links do CSSBUY e links diretos do Taobao, Weidian, 1688 e Xianyu. Dá para colar vários de uma vez,
            ou apertar Ctrl+V em qualquer lugar da página.
          </p>
          <p className={notice?.tone === "error" ? "notice error" : "notice"} role="status">
            {notice?.text}
            {notice?.link && (
              <>
                {" "}
                <a href={notice.link} target="_blank" rel="noopener noreferrer">
                  Ver o que o navegador viu
                </a>
              </>
            )}
          </p>
        </div>
      </header>

      <section className="shelf" aria-label="Itens salvos">
        {loading ? (
          <p className="empty">Carregando sua lista…</p>
        ) : (
          <>
            <CategoryBar
              categories={categories}
              counts={counts.perCategory}
              uncategorized={counts.uncategorized}
              total={items.length}
              selected={filters.category}
              onSelect={(category) => updateFilters({ category })}
              onCreate={createCategory}
              onRename={renameCategory}
              onDelete={deleteCategory}
            />
            {items.length > 0 && (
              <FilterBar
                filters={filters}
                onChange={updateFilters}
                onClear={() => setFilters((current) => ({ ...DEFAULT_FILTERS, category: current.category }))}
                shown={visible.length}
                total={inCategory}
              />
            )}

            {showGrid ? (
              <ul className="grid">
                {pending.map((entry) => (
                  <PendingTile key={entry.key} platform={entry.platform} />
                ))}
                {visible.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    categories={categories}
                    isNew={fresh.has(item.id)}
                    highlighted={highlighted === item.id}
                    onRename={rename}
                    onRefresh={refresh}
                    onPhoto={changePhoto}
                    onDelete={remove}
                    onCategory={setItemCategory}
                    onCreateCategory={createCategory}
                  />
                ))}
              </ul>
            ) : (
              <div className="empty">
                <p>
                  <strong>Nada salvo ainda.</strong>
                </p>
                <p>
                  Cole o link de um produto no campo acima. O Garimpo guarda o nome e a foto, então o item continua aqui
                  mesmo se o anúncio sair do ar. Se quiser, crie categorias antes: com uma categoria aberta, o que você
                  colar já entra nela.
                </p>
              </div>
            )}

            {showGrid && visible.length === 0 && pending.length === 0 && (
              <div className="empty">
                <p>{emptyMessage}</p>
                <button type="button" className="text-button" onClick={() => setFilters(DEFAULT_FILTERS)}>
                  Mostrar todos os itens
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {storageNote && !loading && <footer className="footnote">{storageNote}</footer>}
    </main>
  );
}

function PendingTile({ platform }: { platform: Platform | null }) {
  return (
    <li className="card" aria-busy="true">
      <div className="photo is-loading">
        {platform && (
          <span className="sticker" data-platform={platform}>
            {PLATFORM_LABEL[platform]}
          </span>
        )}
      </div>
      <p className="title">Buscando nome e foto…</p>
    </li>
  );
}
