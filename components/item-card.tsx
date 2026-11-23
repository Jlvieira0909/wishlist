"use client";

import { useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { formatFullDate, formatPrice, needsAttention, PLATFORM_LABEL } from "@/lib/format";
import type { Category, WishItem } from "@/lib/types";

type Props = {
  item: WishItem;
  categories: Category[];
  isNew: boolean;
  highlighted: boolean;
  onRename: (id: string, title: string) => Promise<boolean>;
  onRefresh: (id: string) => Promise<void>;
  onPhoto: (id: string, file: File) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCategory: (id: string, categoryId: string | null) => Promise<void>;
  onCreateCategory: (name: string) => Promise<Category | null>;
};

type Busy = "rename" | "refresh" | "photo" | null;

const NEW_CATEGORY = "__nova__";

const ICONS = {
  rename: "M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4",
  photo:
    "M5 4.5h14A1.5 1.5 0 0 1 20.5 6v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5ZM3.5 16l5-5 4.5 4.5 2.5-2.5 5 5M10.5 9.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z",
  remove: "M4 7h16M9 7V4.5h6V7M6.5 7l1 12.5h9l1-12.5",
};

function Icon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

/** Primeira imagem de um colar (Ctrl+V) ou de um arrastar. */
function imageFrom(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const entry of Array.from(data.items)) {
    if (entry.kind === "file" && entry.type.startsWith("image/")) return entry.getAsFile();
  }
  return Array.from(data.files).find((file) => file.type.startsWith("image/")) ?? null;
}

export default function ItemCard({
  item,
  categories,
  isNew,
  highlighted,
  onRename,
  onRefresh,
  onPhoto,
  onDelete,
  onCategory,
  onCreateCategory,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(item.title);
  const [busy, setBusy] = useState<Busy>(null);
  const [confirming, setConfirming] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [newCategory, setNewCategory] = useState<string | null>(null); // texto da categoria sendo criada
  const fileInput = useRef<HTMLInputElement>(null);
  const skipBlurSave = useRef(false);
  const creatingCategory = useRef(false);

  const src = item.image ?? item.imageSource;
  const assigned = item.categoryId && categories.some((category) => category.id === item.categoryId) ? item.categoryId : "";

  async function work(kind: Exclude<Busy, null>, task: () => Promise<unknown>) {
    setBusy(kind);
    try {
      await task();
    } finally {
      setBusy(null);
    }
  }

  // ---------- nome ----------

  function startEditing() {
    skipBlurSave.current = false;
    setTitleDraft(item.title);
    setEditing(true);
  }

  async function saveTitle() {
    if (skipBlurSave.current) return;
    const next = titleDraft.replace(/\s+/g, " ").trim();
    if (!next || next === item.title) {
      setEditing(false);
      return;
    }
    skipBlurSave.current = true; // Enter e blur não salvam duas vezes
    await work("rename", async () => {
      if (await onRename(item.id, next)) setEditing(false);
      else skipBlurSave.current = false;
    });
  }

  function onTitleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveTitle();
    } else if (event.key === "Escape") {
      event.preventDefault();
      skipBlurSave.current = true;
      setEditing(false);
    }
  }

  // ---------- categoria ----------

  function pickCategory(value: string) {
    if (value === NEW_CATEGORY) setNewCategory("");
    else void onCategory(item.id, value || null);
  }

  async function createCategory() {
    if (creatingCategory.current || newCategory === null) return;
    const name = newCategory.trim();
    if (!name) {
      setNewCategory(null);
      return;
    }
    creatingCategory.current = true;
    const category = await onCreateCategory(name);
    creatingCategory.current = false;
    setNewCategory(null);
    if (category) await onCategory(item.id, category.id);
  }

  // ---------- foto ----------

  function applyPhoto(file: File | null) {
    if (file) void work("photo", () => onPhoto(item.id, file));
  }

  // Com o foco em qualquer parte do card, Ctrl+V com uma imagem troca a foto.
  function onCardPaste(event: ClipboardEvent<HTMLLIElement>) {
    if (editing || newCategory !== null) return;
    const file = imageFrom(event.clipboardData);
    if (!file) return;
    event.preventDefault();
    event.stopPropagation();
    applyPhoto(file);
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    setDropping(true);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDropping(false);
    applyPhoto(imageFrom(event.dataTransfer));
  }

  function askDelete() {
    if (confirming) {
      void onDelete(item.id);
      return;
    }
    setConfirming(true);
    setTimeout(() => setConfirming(false), 4000);
  }

  const cardClass = ["card", isNew && "is-new", highlighted && "is-highlighted"].filter(Boolean).join(" ");
  const photoClass = [
    "photo",
    !src && "is-empty",
    dropping && "is-dropping",
    (busy === "refresh" || busy === "photo") && "is-loading",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li id={`item-${item.id}`} className={cardClass} onPaste={onCardPaste}>
      <div className={photoClass} onDragOver={onDragOver} onDragLeave={() => setDropping(false)} onDrop={onDrop}>
        {src ? (
          // Clicar na foto também abre o produto (o link "Abrir" é o que fica no Tab).
          <a
            className="photo-link"
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={-1}
            aria-hidden="true"
            title={`Salvo em ${formatFullDate(item.createdAt)}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
          </a>
        ) : (
          <button type="button" className="photo-pick" onClick={() => fileInput.current?.click()}>
            <strong>Sem foto</strong>
            <span>Clique para escolher, cole (Ctrl+V) ou arraste uma imagem</span>
          </button>
        )}
        <span className="sticker" data-platform={item.platform}>
          {PLATFORM_LABEL[item.platform]}
        </span>
      </div>

      {editing ? (
        <input
          className="title-input"
          aria-label="Novo nome do item"
          value={titleDraft}
          maxLength={300}
          autoFocus
          disabled={busy === "rename"}
          onChange={(event) => setTitleDraft(event.target.value)}
          onKeyDown={onTitleKey}
          onBlur={() => void saveTitle()}
        />
      ) : (
        <p className="title" title={item.title}>
          {item.title}
        </p>
      )}

      <div className="meta">
        {needsAttention(item) ? (
          <button
            type="button"
            className="retry"
            onClick={() => void work("refresh", () => onRefresh(item.id))}
            disabled={busy === "refresh"}
          >
            {busy === "refresh" ? "Buscando…" : "Buscar de novo"}
          </button>
        ) : (
          <span className="price">{item.price !== null ? formatPrice(item.price) : ""}</span>
        )}

        {newCategory !== null ? (
          <input
            className="category-input"
            aria-label="Nome da nova categoria"
            placeholder="Nova categoria"
            maxLength={40}
            autoFocus
            value={newCategory}
            onChange={(event) => setNewCategory(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void createCategory();
              } else if (event.key === "Escape") {
                setNewCategory(null);
              }
            }}
            onBlur={() => void createCategory()}
          />
        ) : (
          <label className="category-pick">
            <span className="sr-only">Categoria</span>
            <select
              value={assigned}
              data-empty={assigned === "" ? "" : undefined}
              onChange={(event) => pickCategory(event.target.value)}
            >
              <option value="">Sem categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
              <option value={NEW_CATEGORY}>+ Nova categoria…</option>
            </select>
          </label>
        )}
      </div>

      <div className="actions">
        <a href={item.url} target="_blank" rel="noopener noreferrer" aria-label="Abrir no CSSBUY" title="Abrir no CSSBUY">
          Abrir
        </a>
        <div className="tools">
          <button type="button" className="tool" aria-label="Renomear" title="Renomear" onClick={startEditing} disabled={editing}>
            <Icon path={ICONS.rename} />
          </button>
          <button
            type="button"
            className="tool"
            aria-label={src ? "Trocar foto" : "Escolher foto"}
            title={src ? "Trocar foto (ou cole/arraste uma imagem no card)" : "Escolher foto"}
            onClick={() => fileInput.current?.click()}
            disabled={busy === "photo"}
          >
            <Icon path={ICONS.photo} />
          </button>
          <button
            type="button"
            className={confirming ? "tool danger" : "tool"}
            aria-label={confirming ? "Confirmar exclusão" : "Excluir"}
            title={confirming ? "Clique de novo para excluir" : "Excluir"}
            onClick={askDelete}
          >
            {confirming ? "Excluir?" : <Icon path={ICONS.remove} />}
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            applyPhoto(event.target.files?.[0] ?? null);
            event.target.value = "";
          }}
        />
      </div>
    </li>
  );
}
