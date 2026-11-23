"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import type { Category } from "@/lib/types";

type Props = {
  categories: Category[];
  counts: Map<string, number>;
  uncategorized: number;
  total: number;
  /** "all", "none" ou o id da categoria aberta */
  selected: string;
  onSelect: (category: string) => void;
  onCreate: (name: string) => Promise<Category | null>;
  onRename: (id: string, name: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
};

export default function CategoryBar({
  categories,
  counts,
  uncategorized,
  total,
  selected,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const creating = useRef(false);
  const manager = useRef<HTMLDialogElement>(null);

  async function create() {
    if (creating.current) return;
    const value = name.trim();
    if (!value) {
      setAdding(false);
      return;
    }
    creating.current = true;
    const category = await onCreate(value);
    creating.current = false;
    if (!category) return;
    setName("");
    setAdding(false);
    onSelect(category.id);
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void create();
    } else if (event.key === "Escape") {
      setName("");
      setAdding(false);
    }
  }

  return (
    <div className="category-bar">
      <div className="chips" role="group" aria-label="Categorias">
        <button type="button" className="chip" aria-pressed={selected === "all"} onClick={() => onSelect("all")}>
          Todas <span className="count">{total}</span>
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className="chip"
            aria-pressed={selected === category.id}
            onClick={() => onSelect(selected === category.id ? "all" : category.id)}
          >
            {category.name} <span className="count">{counts.get(category.id) ?? 0}</span>
          </button>
        ))}
        {categories.length > 0 && uncategorized > 0 && (
          <button
            type="button"
            className="chip"
            aria-pressed={selected === "none"}
            onClick={() => onSelect(selected === "none" ? "all" : "none")}
          >
            Sem categoria <span className="count">{uncategorized}</span>
          </button>
        )}
        {adding ? (
          <input
            className="chip-input"
            aria-label="Nome da nova categoria"
            placeholder="Nome da categoria"
            maxLength={40}
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={onKey}
            onBlur={() => void create()}
          />
        ) : (
          <button type="button" className="chip chip-add" onClick={() => setAdding(true)}>
            + Nova categoria
          </button>
        )}
      </div>

      {categories.length > 0 && (
        <button type="button" className="text-button quiet" onClick={() => manager.current?.showModal()}>
          Editar categorias
        </button>
      )}

      <dialog ref={manager} className="manager" aria-labelledby="manager-title">
        <h2 id="manager-title">Categorias</h2>
        <ul>
          {categories.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              count={counts.get(category.id) ?? 0}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </ul>
        <p className="hint">Excluir uma categoria não apaga os itens dela: eles ficam em “Sem categoria”.</p>
        <form method="dialog">
          <button type="submit" className="manager-close">
            Fechar
          </button>
        </form>
      </dialog>
    </div>
  );
}

function CategoryRow({
  category,
  count,
  onRename,
  onDelete,
}: {
  category: Category;
  count: number;
  onRename: (id: string, name: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(category.name);
  const [confirming, setConfirming] = useState(false);

  async function save() {
    const value = name.trim();
    if (!value || value === category.name) {
      setName(category.name);
      return;
    }
    if (!(await onRename(category.id, value))) setName(category.name);
  }

  function askDelete() {
    if (confirming) {
      void onDelete(category.id);
      return;
    }
    setConfirming(true);
    setTimeout(() => setConfirming(false), 4000);
  }

  return (
    <li>
      <input
        aria-label={`Nome da categoria ${category.name}`}
        value={name}
        maxLength={40}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
      <span className="count">
        {count} {count === 1 ? "item" : "itens"}
      </span>
      <button type="button" className={confirming ? "tool danger" : "tool"} onClick={askDelete}>
        {confirming ? "Excluir?" : "Excluir"}
      </button>
    </li>
  );
}
