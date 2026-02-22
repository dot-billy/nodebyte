import Link from "next/link";
import {
  Search,
  Users,
  Code,
  Server,
  Tags,
  Globe,
  Puzzle,
  BookmarkCheck,
  KeyRound,
  Terminal,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

import { Button } from "@/components/ui/button";

export function LandingCloud({ registrationEnabled = true }: { registrationEnabled?: boolean }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-16 px-4 py-10 sm:gap-24 sm:px-6 sm:py-16">
      {/* Header */}
      <header className="flex items-center justify-between gap-2">
        <div className="text-lg font-bold tracking-tight">Nodebyte</div>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/download">Extension</Link>
          </Button>
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

      {/* Hero */}
      <section className="flex flex-col items-center gap-6 text-center">
        <h1 className="max-w-3xl text-balance text-3xl font-bold tracking-tight sm:text-5xl">
          Know what you have. Find it in seconds.
        </h1>
        <p className="max-w-2xl text-pretty text-lg text-[hsl(var(--muted-foreground))]">
          Nodebyte is a digital inventory manager for IT teams. Catalog every server, site, and service
          your organization runs &mdash; then search, tag, and automate across all of it.
        </p>
        <div className="flex flex-wrap gap-3">
          {registrationEnabled && (
            <Button asChild size="lg">
              <Link href="/register">Get started free</Link>
            </Button>
          )}
          {!registrationEnabled && (
            <Button asChild size="lg">
              <Link href="/login">Sign in</Link>
            </Button>
          )}
          <Button asChild size="lg" variant="outline">
            <Link href="/download">
              Get the extension
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Primary features */}
      <section className="flex flex-col gap-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Everything in one place</h2>
          <p className="mt-3 text-[hsl(var(--muted-foreground))]">
            Stop searching through spreadsheets, wikis, and sticky notes. Nodebyte gives your team a single source of truth.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: Server,
              title: "Track any node",
              body: "Devices, websites, internal tools, cloud services &mdash; add anything with a name, hostname, IP, or URL.",
            },
            {
              icon: Search,
              title: "Instant search",
              body: "Find what you need by name, hostname, IP address, URL, or tags. Results appear as you type.",
            },
            {
              icon: Tags,
              title: "Organize with tags",
              body: 'Label nodes with tags like "production", "us-east", or "nginx". Filter and bulk-manage by tag.',
            },
            {
              icon: Users,
              title: "Teams & permissions",
              body: "Create teams for different groups. Assign roles &mdash; owner, admin, member, or viewer &mdash; so everyone has the right access.",
            },
            {
              icon: Globe,
              title: "Works everywhere",
              body: "Access your inventory from any browser. No agents to install, no VPN required. Just sign in and go.",
            },
            {
              icon: Code,
              title: "REST API",
              body: "Integrate with your existing tools. Register nodes from deploy scripts, pull inventory into dashboards, or build custom workflows.",
            },
          ].map((c) => (
            <div key={c.title} className="rounded-xl border border-[hsl(var(--border))] p-6 transition-colors hover:bg-[hsl(var(--muted))]">
              <c.icon className="mb-3 h-5 w-5 text-[hsl(var(--muted-foreground))]" />
              <div className="font-semibold">{c.title}</div>
              <div className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]" dangerouslySetInnerHTML={{ __html: c.body }} />
            </div>
          ))}
        </div>
      </section>

      {/* Use cases */}
      <section className="flex flex-col gap-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Built for how IT teams actually work</h2>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          <div className="rounded-xl border border-[hsl(var(--border))] p-5 sm:p-8">
            <Terminal className="mb-4 h-6 w-6 text-[hsl(var(--muted-foreground))]" />
            <h3 className="text-lg font-semibold">Automate server registration</h3>
            <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
              Generate a registration token, add it to your provisioning script, and every new
              server registers itself on first boot. No manual data entry.
            </p>
            <div className="mt-4 rounded-lg bg-[hsl(var(--muted))] p-4 font-mono text-xs leading-relaxed">
              <span className="text-[hsl(var(--muted-foreground))]">$</span> NODEBYTE_TOKEN=&quot;tok_...&quot; bash register.sh<br />
              <span className="text-[hsl(var(--muted-foreground))]">Registering web-prod-01 (10.0.1.42)...</span><br />
              <span className="text-[hsl(var(--muted-foreground))]">Done! Node registered successfully.</span>
            </div>
          </div>

          <div className="rounded-xl border border-[hsl(var(--border))] p-5 sm:p-8">
            <Puzzle className="mb-4 h-6 w-6 text-[hsl(var(--muted-foreground))]" />
            <h3 className="text-lg font-semibold">Save sites from your browser</h3>
            <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
              Browsing an internal dashboard? Click the Nodebyte extension to add it to your
              inventory with one click. Name it, tag it, done.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-[hsl(var(--muted-foreground))]">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                Add the current page with one click
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                Auto-syncs URLs to your bookmarks
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                Switch teams and browse nodes from the popup
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* More capabilities */}
      <section className="flex flex-col gap-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">And there&rsquo;s more</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {[
            {
              icon: KeyRound,
              title: "Registration tokens",
              body: "Create tokens with usage limits and expiration dates. Share them with deploy scripts or hand them to a team &mdash; no passwords needed.",
            },
            {
              icon: BookmarkCheck,
              title: "Bookmark sync",
              body: "Every node with a URL is automatically synced to your browser bookmarks, organized by node type. Your inventory doubles as your bookmark manager.",
            },
            {
              icon: Tags,
              title: "Bulk operations",
              body: "Select multiple nodes and add tags, remove tags, or delete them in one action. No more editing nodes one at a time.",
            },
            {
              icon: Users,
              title: "Invite your team",
              body: "Send email invites with a specific role. New members join the right team with the right permissions &mdash; no admin intervention after setup.",
            },
          ].map((c) => (
            <div
              key={c.title}
              className="flex gap-4 rounded-xl border border-[hsl(var(--border))] p-6 transition-colors hover:bg-[hsl(var(--muted))]"
            >
              <c.icon className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--muted-foreground))]" />
              <div>
                <div className="font-semibold">{c.title}</div>
                <div className="mt-1 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">{c.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="flex flex-col items-center gap-6 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-6 py-12 text-center sm:px-8 sm:py-16">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {registrationEnabled ? "Ready to get organized?" : "Ready to sign in?"}
        </h2>
        <p className="max-w-lg text-[hsl(var(--muted-foreground))]">
          {registrationEnabled
            ? "Create a free account, set up your first team, and start adding nodes in under a minute."
            : "Sign in to your account and start managing your infrastructure."}
        </p>
        <Button asChild size="lg">
          <Link href={registrationEnabled ? "/register" : "/login"}>
            {registrationEnabled ? "Create your account" : "Sign in"}
          </Link>
        </Button>
      </section>

      {/* Footer */}
      <footer className="border-t border-[hsl(var(--border))] pt-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
        Nodebyte &mdash; Built by DeltaOps Technology, LLC
      </footer>
    </main>
  );
}
