"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

interface BulkTagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "remove";
  teamId: string;
  nodeIds: string[];
  /** Union of all tags across selected nodes (used for remove mode). */
  availableTags: string[];
  onDone: () => void;
}

export function BulkTagDialog({
  open,
  onOpenChange,
  mode,
  teamId,
  nodeIds,
  availableTags,
  onDone,
}: BulkTagDialogProps) {
  const [tagsInput, setTagsInput] = useState("");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setTagsInput("");
    setSelectedTags(new Set());
    setError("");
    setBusy(false);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (mode === "add") {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      if (tags.length === 0) {
        setError("Enter at least one tag.");
        return;
      }
      setBusy(true);
      try {
        await api.nodes.bulkTag(teamId, nodeIds, tags);
        reset();
        onDone();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Something went wrong");
      } finally {
        setBusy(false);
      }
    } else {
      if (selectedTags.size === 0) {
        setError("Select at least one tag to remove.");
        return;
      }
      setBusy(true);
      try {
        await api.nodes.bulkTag(teamId, nodeIds, undefined, [...selectedTags]);
        reset();
        onDone();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Something went wrong");
      } finally {
        setBusy(false);
      }
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={close} />

      <div className="relative z-50 mx-4 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-5 sm:p-6 shadow-lg">
        <h2 className="mb-1 text-lg font-semibold">
          {mode === "add" ? "Add tags" : "Remove tags"}
        </h2>
        <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
          {nodeIds.length} node{nodeIds.length !== 1 ? "s" : ""} selected
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
              {error}
            </div>
          )}

          {mode === "add" ? (
            <div className="space-y-2">
              <Label htmlFor="bulk-tags-input">Tags (comma separated)</Label>
              <Input
                id="bulk-tags-input"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="production, nginx, us-east"
                autoFocus
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Select tags to remove</Label>
              {availableTags.length === 0 ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Selected nodes have no tags.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availableTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className="group"
                    >
                      <Badge
                        variant={selectedTags.has(tag) ? "default" : "secondary"}
                        className="cursor-pointer gap-1 transition-colors"
                      >
                        {tag}
                        {selectedTags.has(tag) && <X className="h-3 w-3" />}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner className="mr-2" />}
              {mode === "add" ? "Add tags" : "Remove tags"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
