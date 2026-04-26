"use client";

import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface NodeFilterState {
  kinds: string[];
  hasUrl: boolean | null;
  tags: string[];
  isOrphan: boolean | null;
}

export const emptyFilters: NodeFilterState = { kinds: [], hasUrl: null, tags: [], isOrphan: null };

export function countActiveFilters(f: NodeFilterState): number {
  let n = 0;
  if (f.kinds.length > 0) n++;
  if (f.hasUrl !== null) n++;
  if (f.tags.length > 0) n++;
  if (f.isOrphan !== null) n++;
  return n;
}

interface NodeFiltersProps {
  filters: NodeFilterState;
  onChange: (filters: NodeFilterState) => void;
  open: boolean;
  onToggle: () => void;
  availableTags: string[];
  availableKinds: string[];
}

const kindColors: Record<string, string> = {
  device: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-700",
  site: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-300 dark:border-green-700",
  service: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900 dark:text-purple-300 dark:border-purple-700",
  other: "bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600",
};

const kindColorsActive: Record<string, string> = {
  device: "bg-blue-600 text-white border-blue-600 dark:bg-blue-500 dark:border-blue-500",
  site: "bg-green-600 text-white border-green-600 dark:bg-green-500 dark:border-green-500",
  service: "bg-purple-600 text-white border-purple-600 dark:bg-purple-500 dark:border-purple-500",
  other: "bg-gray-600 text-white border-gray-600 dark:bg-gray-500 dark:border-gray-500",
};

export function NodeFilters({ filters, onChange, open, onToggle, availableTags, availableKinds }: NodeFiltersProps) {
  const activeCount = countActiveFilters(filters);

  function toggleKind(kind: string) {
    const kinds = filters.kinds.includes(kind)
      ? filters.kinds.filter((k) => k !== kind)
      : [...filters.kinds, kind];
    onChange({ ...filters, kinds });
  }

  function setHasUrl(val: boolean | null) {
    onChange({ ...filters, hasUrl: val });
  }

  function toggleTag(tag: string) {
    const tags = filters.tags.includes(tag)
      ? filters.tags.filter((t) => t !== tag)
      : [...filters.tags, tag];
    onChange({ ...filters, tags });
  }

  function setIsOrphan(val: boolean | null) {
    onChange({ ...filters, isOrphan: val });
  }

  function clearAll() {
    onChange(emptyFilters);
  }

  return (
    <div className="space-y-3">
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={onToggle}
      >
        <Filter className="h-3.5 w-3.5" />
        Filters
        {activeCount > 0 && (
          <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[10px] font-bold text-[hsl(var(--primary-foreground))]">
            {activeCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 space-y-4">
          {/* Kind filter */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Kind</span>
            <div className="flex flex-wrap gap-1.5">
              {availableKinds.map((kind) => {
                const active = filters.kinds.includes(kind);
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => toggleKind(kind)}
                    className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${active ? kindColorsActive[kind] ?? kindColorsActive.other : kindColors[kind] ?? kindColors.other}`}
                  >
                    {kind}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Has URL filter */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">URL</span>
            <div className="flex gap-1.5">
              {([
                [null, "Any"],
                [true, "Has URL"],
                [false, "No URL"],
              ] as [boolean | null, string][]).map(([val, label]) => (
                <Button
                  key={label}
                  size="sm"
                  variant={filters.hasUrl === val ? "default" : "outline"}
                  onClick={() => setHasUrl(val)}
                  className="h-7 text-xs"
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Tags filter */}
          {availableTags.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Tags</span>
              <div className="flex flex-wrap gap-1.5">
                {availableTags.map((tag) => {
                  const active = filters.tags.includes(tag);
                  return (
                    <Badge
                      key={tag}
                      variant={active ? "default" : "outline"}
                      className={`cursor-pointer select-none transition-colors ${active ? "" : "hover:bg-[hsl(var(--muted))]"}`}
                      onClick={() => toggleTag(tag)}
                    >
                      {tag}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          {/* Orphan filter */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Hierarchy</span>
            <div className="flex gap-1.5">
              {([
                [null, "Any"],
                [true, "Root only"],
                [false, "Has parent"],
              ] as [boolean | null, string][]).map(([val, label]) => (
                <Button
                  key={label}
                  size="sm"
                  variant={filters.isOrphan === val ? "default" : "outline"}
                  onClick={() => setIsOrphan(val)}
                  className="h-7 text-xs"
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Clear all */}
          {activeCount > 0 && (
            <div className="pt-1 border-t border-[hsl(var(--border))]">
              <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1.5 h-7 text-xs">
                <X className="h-3 w-3" />
                Clear all filters
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
