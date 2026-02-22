import Link from "next/link";
import { promises as fs } from "fs";
import path from "path";
import { Download, Chrome, Package, Calendar, ArrowLeft, Puzzle, BookmarkCheck, Globe } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ExtensionMeta {
  name: string;
  version: string;
  description: string;
  filename: string;
  build_date: string;
}

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? "http://backend:8000";

async function getExtensionMeta(): Promise<ExtensionMeta | null> {
  try {
    const filePath = path.join(process.cwd(), "public", "downloads", "extension-meta.json");
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as ExtensionMeta;
  } catch {
    return null;
  }
}

async function isRegistrationEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/public-settings`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return true;
    const data = await res.json();
    return data.registration_enabled;
  } catch {
    return true;
  }
}

export default async function DownloadPage() {
  const [meta, registrationEnabled] = await Promise.all([
    getExtensionMeta(),
    isRegistrationEnabled(),
  ]);

  const buildDate = meta?.build_date
    ? new Date(meta.build_date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-4 py-10 sm:gap-12 sm:px-6 sm:py-16">
      <header className="flex items-center justify-between gap-2">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Nodebyte
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          {registrationEnabled && (
            <Button asChild size="sm">
              <Link href="/register">Create account</Link>
            </Button>
          )}
        </nav>
      </header>

      <section className="flex flex-col items-center gap-4 text-center">
        <Button asChild variant="ghost" size="sm" className="mb-2 self-start">
          <Link href="/">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>

        <Chrome className="h-12 w-12 text-[hsl(var(--muted-foreground))]" />
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Browser Extension</h1>
        <p className="max-w-xl text-pretty text-lg text-[hsl(var(--muted-foreground))]">
          Add any website to your Nodebyte inventory with one click, right from your browser.
        </p>
      </section>

      {meta ? (
        <section className="mx-auto flex w-full max-w-lg flex-col gap-6">
          <Card>
            <CardHeader className="items-center text-center">
              <CardTitle className="flex items-center gap-3">
                {meta.name}
                <Badge variant="secondary">v{meta.version}</Badge>
              </CardTitle>
              <CardDescription>{meta.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              {buildDate && (
                <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                  <Calendar className="h-3.5 w-3.5" />
                  Built {buildDate}
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                <Package className="h-3.5 w-3.5" />
                Chrome &middot; Manifest V3
              </div>
              <Button asChild size="lg" className="mt-2 w-full">
                <a href={`/downloads/${meta.filename}`} download>
                  <Download className="mr-2 h-4 w-4" />
                  Download v{meta.version}
                </a>
              </Button>
            </CardContent>
          </Card>
        </section>
      ) : (
        <section className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 rounded-xl border border-[hsl(var(--border))] p-8 text-center">
          <Package className="h-8 w-8 text-[hsl(var(--muted-foreground))]" />
          <p className="text-[hsl(var(--muted-foreground))]">
            No extension build available yet. Check back soon.
          </p>
        </section>
      )}

      <section className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <h2 className="text-center text-xl font-semibold">Features</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: Puzzle, title: "One-click add", body: "Add the current page to your inventory instantly." },
            { icon: BookmarkCheck, title: "Bookmark sync", body: "Nodes with URLs sync to your bookmarks automatically." },
            { icon: Globe, title: "Team aware", body: "Switch between teams and manage nodes from the popup." },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-[hsl(var(--border))] p-5 transition-colors hover:bg-[hsl(var(--muted))]"
            >
              <f.icon className="mb-2 h-5 w-5 text-[hsl(var(--muted-foreground))]" />
              <div className="text-sm font-semibold">{f.title}</div>
              <div className="mt-1 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">{f.body}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <h2 className="text-center text-xl font-semibold">Installation</h2>
        <ol className="list-inside list-decimal space-y-3 text-[hsl(var(--muted-foreground))]">
          <li>
            <span className="font-medium text-[hsl(var(--foreground))]">Download</span> the extension archive
            using the button above and extract the <code className="rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-xs font-mono">extension</code> folder.
          </li>
          <li>
            Open <code className="rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-xs font-mono">chrome://extensions</code> in
            your browser and enable <span className="font-medium text-[hsl(var(--foreground))]">Developer mode</span>.
          </li>
          <li>
            Click <span className="font-medium text-[hsl(var(--foreground))]">Load unpacked</span> and select the
            extracted <code className="rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-xs font-mono">extension</code> folder.
          </li>
          <li>
            Click the Nodebyte icon in your toolbar, open <span className="font-medium text-[hsl(var(--foreground))]">Settings</span>,
            and set your API URL.
          </li>
        </ol>
      </section>

      <footer className="border-t border-[hsl(var(--border))] pt-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
        Nodebyte &mdash; Built by DeltaOps Technology, LLC
      </footer>
    </main>
  );
}
