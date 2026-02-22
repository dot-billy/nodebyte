import Link from "next/link";
import { Server } from "lucide-react";

import { Button } from "@/components/ui/button";

export function LandingOss({ registrationEnabled = true }: { registrationEnabled?: boolean }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-10 sm:px-6 sm:py-16">
      <header className="flex items-center justify-between">
        <div className="text-lg font-bold tracking-tight">Nodebyte</div>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/login">Sign in</Link>
          </Button>
        </nav>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <Server className="h-12 w-12 text-[hsl(var(--muted-foreground))]" />
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Nodebyte</h1>
        <p className="max-w-lg text-pretty text-lg text-[hsl(var(--muted-foreground))]">
          Open-source inventory manager for IT teams. Track devices, sites, and services. Search, tag, and automate via REST API.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild size="lg">
            <Link href="/login">Sign in</Link>
          </Button>
          {registrationEnabled && (
            <Button asChild size="lg" variant="outline">
              <Link href="/register">Create account</Link>
            </Button>
          )}
          <Button asChild size="lg" variant="outline">
            <a href="https://github.com/user/nodebyte" target="_blank" rel="noreferrer">
              View on GitHub
            </a>
          </Button>
        </div>
      </section>

      <footer className="border-t border-[hsl(var(--border))] pt-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
        Nodebyte &mdash; open source under the MIT license
      </footer>
    </main>
  );
}
