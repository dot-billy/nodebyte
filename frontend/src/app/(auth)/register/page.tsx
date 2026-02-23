"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldX } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { api, ApiError, type InviteInfo } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Turnstile } from "@/components/turnstile";

const ROLE_LABELS: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member", viewer: "Viewer" };

export default function RegisterPage() {
  return (
    <Suspense fallback={<Card><CardContent className="flex justify-center py-16"><Spinner className="h-6 w-6" /></CardContent></Card>}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const { register } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const inviteToken = searchParams.get("invite");

  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [inviteLoading, setInviteLoading] = useState(!!inviteToken);
  const [inviteError, setInviteError] = useState("");
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [website, setWebsite] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isInviteMode = !!inviteToken;

  useEffect(() => {
    api.auth.publicSettings()
      .then((s) => setRegistrationEnabled(s.registration_enabled))
      .catch(() => {})
      .finally(() => setSettingsLoading(false));
  }, []);

  useEffect(() => {
    if (!inviteToken) return;
    api.invites
      .getInfo(inviteToken)
      .then((info) => {
        setInviteInfo(info);
        setEmail(info.invited_email);
      })
      .catch(() => setInviteError("This invite link is invalid or has expired."))
      .finally(() => setInviteLoading(false));
  }, [inviteToken]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (isInviteMode) {
        await register({
          password,
          fullName,
          inviteToken: inviteToken!,
          website: website || undefined,
          cf_turnstile_token: turnstileToken || undefined,
        });
      } else {
        await register({
          email,
          password,
          fullName,
          teamName,
          website: website || undefined,
          cf_turnstile_token: turnstileToken || undefined,
        });
      }
      router.push(next && next.startsWith("/") ? next : "/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (inviteLoading || settingsLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </CardContent>
      </Card>
    );
  }

  if (!registrationEnabled && !isInviteMode) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <ShieldX className="h-10 w-10 text-[hsl(var(--muted-foreground))]" />
          <div>
            <h2 className="text-lg font-semibold">Registration is disabled</h2>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              Public registration is currently closed. Contact your administrator for an invite.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/login">Sign in instead</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (inviteError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invalid invite</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md bg-red-50 p-4 text-center text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
            {inviteError}
          </div>
        </CardContent>
        <CardFooter className="justify-center">
          <Link href="/register" className="text-sm text-[hsl(var(--muted-foreground))] hover:underline">
            Sign up without an invite
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isInviteMode ? "Join your team" : "Create account"}</CardTitle>
        <CardDescription>
          {isInviteMode
            ? "Set up your account to get started."
            : "Sign up and start tracking your infrastructure."}
        </CardDescription>
      </CardHeader>

      {isInviteMode && inviteInfo && (
        <div className="mx-6 mb-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[hsl(var(--muted-foreground))]">Joining</span>
            <span className="font-semibold">{inviteInfo.team_name}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-sm">
            <span className="text-[hsl(var(--muted-foreground))]">Role</span>
            <Badge variant="secondary">{ROLE_LABELS[inviteInfo.role] ?? inviteInfo.role}</Badge>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" type="text" autoComplete="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            {isInviteMode ? (
              <Input id="email" type="email" value={email} disabled className="bg-[hsl(var(--muted))] opacity-70" />
            ) : (
              <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" />
          </div>

          {!isInviteMode && (
            <div className="space-y-2">
              <Label htmlFor="teamName">Team name</Label>
              <Input id="teamName" type="text" required value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="My Team" />
            </div>
          )}

          {/* Honeypot */}
          <div className="absolute -left-[9999px] -top-[9999px]" aria-hidden="true">
            <label htmlFor="website">Website</label>
            <input id="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>

          <Turnstile onVerify={setTurnstileToken} onExpire={() => setTurnstileToken("")} />
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Spinner className="mr-2" />}
            {isInviteMode ? "Create account & join team" : "Create account"}
          </Button>
          <p className="text-center text-sm text-[hsl(var(--muted-foreground))]">
            Already have an account?{" "}
            <Link
              href={isInviteMode ? `/login?next=/invite/${inviteToken}` : (next ? `/login?next=${encodeURIComponent(next)}` : "/login")}
              className="font-medium underline underline-offset-4 hover:text-[hsl(var(--foreground))]"
            >
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
