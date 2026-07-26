"use client";
import * as React from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SearchableSelectOption = {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
  disabled?: boolean;
};

type SearchableSelectProps = {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  emptyText?: string;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  disabled?: boolean;
  allowClear?: boolean;
};

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Seleccionar...",
  emptyText = "Sin resultados",
  className,
  triggerClassName,
  contentClassName,
  disabled,
  allowClear = true,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIdx, setActiveIdx] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      if (o.label.toLowerCase().includes(q)) return true;
      if (o.sublabel && o.sublabel.toLowerCase().includes(q)) return true;
      if (o.badge && o.badge.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [options, query]);

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      // enfocar input al abrir
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  React.useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // cerrar al hacer click fuera
  React.useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const commit = (v: string | null) => {
    onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[activeIdx];
      if (opt && !opt.disabled) commit(opt.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  // scroll al item activo
  React.useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLDivElement>(
      `[data-idx="${activeIdx}"]`,
    );
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [activeIdx, open]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-1 rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          triggerClassName,
        )}
      >
        <span className="truncate flex-1 text-left">
          {selected ? (
            <span>
              {selected.label}
              {selected.sublabel ? (
                <span className="text-muted-foreground"> · {selected.sublabel}</span>
              ) : null}
              {selected.badge ? (
                <span className="ml-1 text-muted-foreground">({selected.badge})</span>
              ) : null}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </span>
        <div className="flex items-center gap-1">
          {allowClear && selected && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                commit(null);
              }}
              className="text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronsUpDown className="h-3 w-3 opacity-50" />
        </div>
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-50 mt-1 w-[min(420px,90vw)] rounded-md border bg-popover text-popover-foreground shadow-md",
            contentClassName,
          )}
        >
          <div className="flex items-center gap-1 border-b px-2 py-1.5">
            <Search className="h-3 w-3 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Buscar por nombre, apellido, nick, cargo..."
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <div ref={listRef} className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-2 py-2 text-xs text-muted-foreground">{emptyText}</div>
            ) : (
              filtered.map((o, i) => {
                const isSel = o.value === value;
                return (
                  <div
                    key={o.value}
                    data-idx={i}
                    onMouseEnter={() => setActiveIdx(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (!o.disabled) commit(o.value);
                    }}
                    className={cn(
                      "flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs",
                      i === activeIdx && "bg-accent text-accent-foreground",
                      o.disabled && "opacity-50 cursor-not-allowed",
                    )}
                  >
                    <Check
                      className={cn(
                        "h-3 w-3 shrink-0",
                        isSel ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="flex-1 truncate">
                      {o.label}
                      {o.sublabel ? (
                        <span className="text-muted-foreground"> · {o.sublabel}</span>
                      ) : null}
                    </span>
                    {o.badge && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {o.badge}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <div className="border-t px-2 py-1 text-[10px] text-muted-foreground flex items-center justify-between">
            <span>{filtered.length} resultados</span>
            <span>↑↓ navegar · Enter seleccionar · Esc cerrar</span>
          </div>
        </div>
      )}
    </div>
  );
}
