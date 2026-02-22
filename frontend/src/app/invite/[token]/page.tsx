"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

import { useAuth } from "@/lib/auth";
import { api, ApiError, type InviteInfo } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";

const ROLE_LABELS: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member", viewer: "Viewer" };

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading, reloadTeams } = useAuth();
  const router = useRouter();

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.invites
      .getInfo(token)
      .then(setInfo)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Invalid or expired invite link"))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleAccept() {
    if (!token) return;
    setAccepting(true);
    setError("");
    try {
      await api.invites.accept(token);
      setAccepted(true);
      await reloadTeams();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to accept invite");
    } finally {
      setAccepting(false);
    }
  }

  if (loading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--muted))] p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Team Invitation</CardTitle>
          {info && !error && (
            <CardDescription>
              You&apos;ve been invited to join a team on Nodebyte
            </CardDescription>
          )}
        </CardHeader>

        <CardContent>
          {error && (
            <div className="rounded-md bg-red-50 p-4 text-center text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
              {error}
            </div>
          )}

          {accepted && (
            <div className="space-y-4 text-center">
              <div className="rounded-md bg-green-50 p-4 text-sm text-green-700 dark:bg-green-950 dark:text-green-400">
                You&apos;ve joined <strong>{info?.team_name}</strong> as <strong>{ROLE_LABELS[info?.role ?? "member"]}</strong>!
              </div>
              <Button className="w-full" onClick={() => router.push("/dashboard")}>
                Go to Dashboard
              </Button>
            </div>
          )}

          {info && !error && !accepted && (
            <div className="space-y-4">
              <div className="rounded-lg border border-[hsl(var(--border))] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[hsl(var(--muted-foreground))]">Team</span>
                  <span className="font-semibold">{info.team_name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[hsl(var(--muted-foreground))]">Role</span>
                  <Badge variant="secondary">{ROLE_LABELS[info.role] ?? info.role}</Badge>
                </div>
                {info.invited_by_email && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[hsl(var(--muted-foreground))]">Invited by</span>
                    <span className="text-sm">{info.invited_by_email}</span>
                  </div>
                )}
              </div>

              {info.expired && (
                <div className="rounded-md bg-amber-50 p-3 text-center text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                  This invite has expired. Ask the team admin to send a new one.
                </div>
              )}

              {info.already_accepted && (
                <div className="rounded-md bg-blue-50 p-3 text-center text-sm text-blue-700 dark:bg-blue-950 dark:text-blue-400">
                  This invite has already been accepted.
                </div>
              )}

              {!info.expired && !info.already_accepted && !user && (
                <div className="space-y-3 text-center">
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    Sign in or create an account to accept this invite.
                  </p>
                  <div className="flex gap-2">
                    <Button asChild className="flex-1">
                      <Link href={`/login?next=/invite/${token}`}>Sign in</Link>
                    </Button>
                    <Button asChild variant="outline" className="flex-1">
                      <Link href={`/register?invite=${token}`}>Create account</Link>
                    </Button>
                  </div>
                </div>
              )}

              {!info.expired && !info.already_accepted && user && (
                <Button className="w-full" onClick={handleAccept} disabled={accepting}>
                  {accepting && <Spinner className="mr-2" />}
                  Accept invitation
                </Button>
              )}
            </div>
          )}
        </CardContent>

        {!accepted && (
          <CardFooter className="justify-center">
            <Link href="/" className="text-sm text-[hsl(var(--muted-foreground))] hover:underline">
              Back to Nodebyte
            </Link>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
