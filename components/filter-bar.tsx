"use client";

import { hasActiveFilters, type Filters, type SortOrder } from "@/lib/filters";
import { PLATFORM_LABEL, PLATFORMS } from "@/lib/format";
import type { Platform } from "@/lib/types";

type Props = {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  onClear: () => void;
  shown: number;
  total: number;
};

const SORT_LABEL: Record<SortOrder, string> = {
  recent: "Mais recentes",
  oldest: "Mais antigos",
  "price-asc": "Menor preço",
  "price-desc": "Maior preço",
};

export default function FilterBar({ filters, onChange, onClear, shown, total }: Props) {
  return (
    <div className="filter-bar">
      <label className="field search">
        <span className="sr-only">Buscar pelo nome</span>
        <input
          type="search"
          placeholder="Buscar pelo nome"
          value={filters.query}
          onChange={(event) => onChange({ query: event.target.value })}
        />
      </label>

      <label className="field">
        <span className="sr-only">Loja</span>
        <select value={filters.platform} onChange={(event) => onChange({ platform: event.target.value as Platform | "all" })}>
          <option value="all">Todas as lojas</option>
          {PLATFORMS.map((platform) => (
            <option key={platform} value={platform}>
              {PLATFORM_LABEL[platform]}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="field price-range">
        <legend className="sr-only">Faixa de preço em yuan</legend>
        <span aria-hidden="true">¥</span>
        <input
          inputMode="decimal"
          placeholder="mín"
          aria-label="Preço mínimo em yuan"
          value={filters.minPrice}
          onChange={(event) => onChange({ minPrice: event.target.value })}
        />
        <span aria-hidden="true">até</span>
        <input
          inputMode="decimal"
          placeholder="máx"
          aria-label="Preço máximo em yuan"
          value={filters.maxPrice}
          onChange={(event) => onChange({ maxPrice: event.target.value })}
        />
      </fieldset>

      <label className="field">
        <span className="sr-only">Ordenar</span>
        <select value={filters.sort} onChange={(event) => onChange({ sort: event.target.value as SortOrder })}>
          {(Object.keys(SORT_LABEL) as SortOrder[]).map((sort) => (
            <option key={sort} value={sort}>
              {SORT_LABEL[sort]}
            </option>
          ))}
        </select>
      </label>

      {hasActiveFilters(filters) && (
        <p className="result-count">
          {shown} de {total}
          <button type="button" className="text-button" onClick={onClear}>
            Limpar filtros
          </button>
        </p>
      )}
    </div>
  );
}
