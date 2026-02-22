"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

interface CreateTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

function toSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 120);
}

export function CreateTeamDialog({ open, onOpenChange, onCreated }: CreateTeamDialogProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(toSlug(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim() || !slug.trim()) return;

    setBusy(true);
    try {
      await api.teams.create({ name: name.trim(), slug: slug.trim() });
      setName("");
      setSlug("");
      setSlugTouched(false);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
      <div className="relative z-50 mx-4 w-full max-w-md rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-6 shadow-lg">
        <h2 className="mb-1 text-lg font-semibold">Create a new team</h2>
        <p className="mb-5 text-sm text-[hsl(var(--muted-foreground))]">
          Teams let you organize nodes into separate workspaces.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="ct-name">Team name</Label>
            <Input
              id="ct-name"
              required
              autoFocus
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Production Infra"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ct-slug">Slug</Label>
            <Input
              id="ct-slug"
              required
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
              placeholder="production-infra"
            />
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              URL-safe identifier. Auto-generated from the name.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim() || !slug.trim()}>
              {busy && <Spinner className="mr-2" />}
              Create team
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
