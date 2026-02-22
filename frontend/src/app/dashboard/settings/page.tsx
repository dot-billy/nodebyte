"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

export default function SettingsPage() {
  const { user, reloadProfile } = useAuth();

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Manage your account details and security.
        </p>
      </div>

      <ProfileForm user={user} onSaved={reloadProfile} />
      <EmailForm user={user} onSaved={reloadProfile} />
      <PasswordForm />
      <DangerZone user={user} />
    </div>
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
          <CardDescription>Update your password. Must be at least 8 characters.</CardDescription>
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
