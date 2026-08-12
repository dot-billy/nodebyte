"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api, ApiError, type ApiTokenCreated, type ApiTokenPublic } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

export default function SettingsPage() {
  const { user, reloadProfile } = useAuth();

  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Manage your account details and security.
        </p>
      </div>

      <ProfileForm user={user} onSaved={reloadProfile} />
      <EmailForm user={user} onSaved={reloadProfile} />
      <PasswordForm />
      <ApiTokensCard />
      <DangerZone user={user} />
    </div>
  );
}

function ApiTokensCard() {
  const [tokens, setTokens] = useState<ApiTokenPublic[]>([]);
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("90");
  const [created, setCreated] = useState<ApiTokenCreated | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadTokens = useCallback(async () => {
    try {
      setTokens(await api.auth.listApiTokens());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load API tokens");
    }
  }, []);

  useEffect(() => {
    void loadTokens();
  }, [loadTokens]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setCreated(null);
    try {
      const token = await api.auth.createApiToken({
        name,
        expires_in_days: expiresInDays ? Number(expiresInDays) : null,
      });
      setCreated(token);
      setName("");
      await loadTokens();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create API token");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(tokenId: string) {
    setError("");
    try {
      await api.auth.revokeApiToken(tokenId);
      await loadTokens();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to revoke API token");
    }
  }

  async function copyCreatedToken() {
    if (!created) return;
    await navigator.clipboard.writeText(created.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <KeyRound className="h-5 w-5" />
          Personal API tokens
        </CardTitle>
        <CardDescription>
          Use revocable tokens for scripts, integrations, and the Nodebyte MCP server without storing your password.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && <StatusBanner type="error" message={error} />}
        {created && (
          <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
            <p className="text-sm font-medium">Copy this token now. It will not be shown again.</p>
            <div className="flex gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded bg-white px-3 py-2 text-xs dark:bg-black/30">
                {created.token}
              </code>
              <Button type="button" size="sm" variant="outline" onClick={copyCreatedToken} className="gap-1.5">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        )}

        <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-[1fr_150px_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="token-name">Token name</Label>
            <Input
              id="token-name"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Automation or MCP"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="token-expiry">Expires in days</Label>
            <Input
              id="token-expiry"
              type="number"
              min={1}
              max={3650}
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              placeholder="Never"
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy && <Spinner className="mr-2" />}
            Create token
          </Button>
        </form>

        <div className="space-y-2">
          {tokens.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">No API tokens yet.</p>
          ) : (
            tokens.map((token) => (
              <div key={token.id} className="flex items-center justify-between gap-4 rounded-md border p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{token.name}</span>
                    <code className="text-xs text-[hsl(var(--muted-foreground))]">{token.token_prefix}…</code>
                    {!token.is_active && <span className="text-xs font-medium text-red-600">Inactive</span>}
                  </div>
                  <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                    Created {new Date(token.created_at).toLocaleDateString()}
                    {token.expires_at ? ` · Expires ${new Date(token.expires_at).toLocaleDateString()}` : " · Never expires"}
                    {token.last_used_at ? ` · Last used ${new Date(token.last_used_at).toLocaleString()}` : " · Never used"}
                  </p>
                </div>
                {token.is_active && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleRevoke(token.id)}
                    className="shrink-0 gap-1.5 text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                    Revoke
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ProfileForm({ user, onSaved }: { user: { full_name: string | null }; onSaved: () => Promise<void> }) {
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess(false);
    try {
      await api.auth.updateProfile({ full_name: fullName || "" });
      await onSaved();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update profile");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle className="text-lg">Profile</CardTitle>
          <CardDescription>Your public display name.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <StatusBanner type="error" message={error} />}
          {success && <StatusBanner type="success" message="Profile updated." />}
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
              autoComplete="name"
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={busy} size="sm">
            {busy && <Spinner className="mr-2" />}
            Save
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function EmailForm({ user, onSaved }: { user: { email: string }; onSaved: () => Promise<void> }) {
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const changed = email !== user.email;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!changed) return;
    setBusy(true);
    setError("");
    setSuccess(false);
    try {
      await api.auth.updateProfile({ email, current_password: currentPassword });
      await onSaved();
      setCurrentPassword("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle className="text-lg">Email address</CardTitle>
          <CardDescription>Change the email associated with your account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <StatusBanner type="error" message={error} />}
          {success && <StatusBanner type="success" message="Email updated." />}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          {changed && (
            <div className="space-y-2">
              <Label htmlFor="email-pw">Current password</Label>
              <Input
                id="email-pw"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Required to change email"
              />
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={busy || !changed} size="sm">
            {busy && <Spinner className="mr-2" />}
            Update email
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess(false);
    try {
      await api.auth.updateProfile({ current_password: currentPassword, new_password: newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to change password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle className="text-lg">Password</CardTitle>
          <CardDescription>
            Update your password. Must be at least 8 characters. This also revokes all personal API tokens.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <StatusBanner type="error" message={error} />}
          {success && <StatusBanner type="success" message="Password changed." />}
          <div className="space-y-2">
            <Label htmlFor="cur-pw">Current password</Label>
            <Input
              id="cur-pw"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-pw">New password</Label>
            <Input
              id="new-pw"
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Min. 8 characters"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-pw">Confirm new password</Label>
            <Input
              id="confirm-pw"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={busy} size="sm">
            {busy && <Spinner className="mr-2" />}
            Change password
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function DangerZone({ user }: { user: { email: string; created_at: string } }) {
  return (
    <Card className="border-red-200 dark:border-red-900">
      <CardHeader>
        <CardTitle className="text-lg text-red-600 dark:text-red-400">Account info</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-[hsl(var(--muted-foreground))]">Account ID</dt>
            <dd className="font-mono text-xs">{user.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[hsl(var(--muted-foreground))]">Member since</dt>
            <dd>{new Date(user.created_at).toLocaleDateString()}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function StatusBanner({ type, message }: { type: "error" | "success"; message: string }) {
  const styles =
    type === "error"
      ? "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400"
      : "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400";
  return <div className={`rounded-md p-3 text-sm ${styles}`}>{message}</div>;
}
