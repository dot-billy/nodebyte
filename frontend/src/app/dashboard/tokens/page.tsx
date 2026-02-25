"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Check, Plus, KeyRound, Ban, Terminal, X } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { api, ApiError, type RegistrationTokenPublic } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

import { copyToClipboard } from "@/lib/utils";

const NODE_KINDS = ["device", "site", "service", "other"];

function canManage(role: string | null | undefined) {
  return role === "owner" || role === "admin";
}

export default function RegistrationTokensPage() {
  const { activeTeam } = useAuth();
  const myRole = activeTeam?.my_role;
  const isManager = canManage(myRole);

  const [tokens, setTokens] = useState<RegistrationTokenPublic[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [allowedKinds, setAllowedKinds] = useState<string[]>([]);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const [newTokenValue, setNewTokenValue] = useState("");

  const load = useCallback(async () => {
    if (!activeTeam || !isManager) return;
    setLoading(true);
    try {
      const t = await api.registrationTokens.list(activeTeam.id);
      setTokens(t);
    } catch {
      setTokens([]);
    } finally {
      setLoading(false);
    }
  }, [activeTeam, isManager]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!activeTeam) return;
    setCreateBusy(true);
    setCreateError("");
    setNewTokenValue("");
    try {
      const rt = await api.registrationTokens.create(activeTeam.id, {
        label,
        max_uses: maxUses ? parseInt(maxUses, 10) : null,
        allowed_kinds: allowedKinds.length > 0 ? allowedKinds : null,
        expires_in_days: expiresInDays ? parseInt(expiresInDays, 10) : null,
      });
      setNewTokenValue(rt.token);
      setLabel("");
      setMaxUses("");
      setExpiresInDays("");
      setAllowedKinds([]);
      load();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Failed to create token");
    } finally {
      setCreateBusy(false);
    }
  }

  async function handleRevoke(rt: RegistrationTokenPublic) {
    if (!activeTeam) return;
    if (!confirm(`Revoke "${rt.label}"? Nodes already registered won't be affected.`)) return;
    try {
      await api.registrationTokens.revoke(activeTeam.id, rt.id);
      load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to revoke");
    }
  }

  function toggleKind(kind: string) {
    setAllowedKinds((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]
    );
  }

  if (!isManager) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Registration Tokens</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          You need admin or owner permissions to manage registration tokens.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Registration Tokens</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Create tokens that let servers and agents register themselves as nodes without user credentials.
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="h-4 w-4" />
          Create token
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleCreate} className="space-y-4">
              {createError && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
                  {createError}
                </div>
              )}
              {newTokenValue && <NewTokenBanner token={newTokenValue} onDismiss={() => setNewTokenValue("")} />}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="rt-label">Label</Label>
                  <Input
                    id="rt-label"
                    required
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder='e.g. "production-servers"'
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rt-max">Max uses <span className="text-[hsl(var(--muted-foreground))] font-normal">(blank = unlimited)</span></Label>
                  <Input
                    id="rt-max"
                    type="number"
                    min={1}
                    value={maxUses}
                    onChange={(e) => setMaxUses(e.target.value)}
                    placeholder="Unlimited"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rt-exp">Expires in days <span className="text-[hsl(var(--muted-foreground))] font-normal">(blank = never)</span></Label>
                  <Input
                    id="rt-exp"
                    type="number"
                    min={1}
                    max={365}
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(e.target.value)}
                    placeholder="Never"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Allowed node kinds <span className="text-[hsl(var(--muted-foreground))] font-normal">(none = any)</span></Label>
                  <div className="flex flex-wrap gap-2">
                    {NODE_KINDS.map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => toggleKind(kind)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          allowedKinds.includes(kind)
                            ? "border-[hsl(var(--foreground))] bg-[hsl(var(--foreground))] text-[hsl(var(--background))]"
                            : "border-[hsl(var(--border))] hover:border-[hsl(var(--foreground))]"
                        }`}
                      >
                        {kind}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={createBusy} className="gap-1.5">
                  {createBusy ? <Spinner className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
                  Generate token
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div>
      ) : tokens.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[hsl(var(--border))] py-16 text-center">
          <KeyRound className="mb-3 h-10 w-10 text-[hsl(var(--muted-foreground))]" />
          <p className="text-sm font-medium">No registration tokens yet</p>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            Create one to let servers register themselves as nodes.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[hsl(var(--border))]">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
                <th className="px-4 py-3 text-left font-medium">Label</th>
                <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">Usage</th>
                <th className="hidden px-4 py-3 text-left font-medium md:table-cell">Kinds</th>
                <th className="hidden px-4 py-3 text-left font-medium md:table-cell">Expires</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((rt) => (
                <tr key={rt.id} className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--muted))]/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium">{rt.label}</div>
                    <div className="mt-0.5 font-mono text-xs text-[hsl(var(--muted-foreground))]">
                      {rt.token.slice(0, 12)}...
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <span className="font-mono text-sm">
                      {rt.use_count}{rt.max_uses != null ? ` / ${rt.max_uses}` : ""}
                    </span>
                    {rt.max_uses == null && (
                      <span className="ml-1 text-xs text-[hsl(var(--muted-foreground))]">unlimited</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    {rt.allowed_kinds && rt.allowed_kinds.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {rt.allowed_kinds.map((k) => (
                          <Badge key={k} variant="outline" className="text-[10px]">{k}</Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">any</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-[hsl(var(--muted-foreground))] md:table-cell">
                    {rt.expires_at ? new Date(rt.expires_at).toLocaleDateString() : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    {rt.is_usable ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">Active</Badge>
                    ) : !rt.is_active ? (
                      <Badge variant="secondary">Revoked</Badge>
                    ) : (
                      <Badge variant="secondary">
                        {rt.expires_at && new Date(rt.expires_at) <= new Date() ? "Expired" : "Exhausted"}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <CopyTokenButton token={rt.token} />
                      {rt.is_active && (
                        <Button variant="ghost" size="sm" onClick={() => handleRevoke(rt)} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <OnboardingScripts />
    </div>
  );
}

const PLATFORMS = ["linux", "macos", "windows"] as const;
type Platform = (typeof PLATFORMS)[number];

const PLATFORM_LABELS: Record<Platform, string> = {
  linux: "Linux",
  macos: "macOS",
  windows: "Windows",
};

const PLATFORM_ICONS: Record<Platform, React.ReactNode> = {
  linux: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M12.5 2c-1.7 0-2.7 1.2-3.2 2.5C8.8 5.8 8.5 7.4 8.5 9v1.5c0 .9-.2 1.7-.6 2.4-.4.7-.9 1.2-1.4 1.7-.8.8-1.5 1.5-1.5 3 0 .6.1 1 .3 1.4.2.4.5.7.8.9.6.5 1.4.7 2.2.9 1.6.4 3.5.7 5.2.7s3.6-.3 5.2-.7c.8-.2 1.6-.4 2.2-.9.3-.2.6-.5.8-.9.2-.4.3-.8.3-1.4 0-1.5-.7-2.2-1.5-3-.5-.5-1-.9-1.4-1.7-.4-.7-.6-1.5-.6-2.4V9c0-1.6-.3-3.2-.8-4.5C17.2 3.2 16.2 2 14.5 2h-2zm0 1h2c1 0 1.7.7 2.2 1.9.4 1.2.8 2.7.8 4.1v1.5c0 1.1.3 2.1.8 3 .5.9 1.1 1.5 1.6 2 .7.7 1.1 1.2 1.1 2.1 0 .4-.1.6-.2.8-.1.2-.3.4-.5.5-.4.3-1.1.5-1.9.7-1.5.4-3.4.7-4.9.7s-3.4-.3-4.9-.7c-.8-.2-1.5-.4-1.9-.7-.2-.1-.4-.3-.5-.5-.1-.2-.2-.5-.2-.8 0-.9.4-1.4 1.1-2.1.5-.5 1.1-1.1 1.6-2 .5-.9.8-1.9.8-3V9c0-1.4.4-2.9.8-4.1C10.8 3.7 11.5 3 12.5 3z"/></svg>
  ),
  macos: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
  ),
  windows: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M3 12V6.5l8-1.1V12H3zm0 .5h8v6.6l-8-1.1V12.5zM11.5 5.3l9.5-1.3v8h-9.5V5.3zm0 7.2H21v8l-9.5-1.3v-6.7z"/></svg>
  ),
};

function getScript(platform: Platform, apiBase: string): string {
  if (platform === "linux") {
    return `#!/usr/bin/env bash
# Nodebyte node registration — Linux
# Usage: NODEBYTE_TOKEN="your-token" bash register.sh

set -euo pipefail

API="${apiBase}/api/register-node"
TOKEN="\${NODEBYTE_TOKEN:?Set NODEBYTE_TOKEN before running this script}"

NAME="$(hostname)"
HOSTNAME_VAL="$(hostname -f 2>/dev/null || hostname)"
IP="$(hostname -I 2>/dev/null | awk '{print $1}' || echo "")"
OS="$(source /etc/os-release 2>/dev/null && echo "$PRETTY_NAME" || uname -s)"
KERNEL="$(uname -r)"
ARCH="$(uname -m)"

echo "Registering $NAME ($IP) with Nodebyte..."

curl -fsSL -X POST "$API" \\
  -H "Content-Type: application/json" \\
  -d "$(cat <<EOF
{
  "token": "$TOKEN",
  "name": "$NAME",
  "kind": "device",
  "hostname": "$HOSTNAME_VAL",
  "ip": "$IP",
  "meta": {
    "os": "$OS",
    "kernel": "$KERNEL",
    "arch": "$ARCH"
  }
}
EOF
)"

echo ""
echo "Done! Node registered successfully."`;
  }

  if (platform === "macos") {
    return `#!/usr/bin/env bash
# Nodebyte node registration — macOS
# Usage: NODEBYTE_TOKEN="your-token" bash register.sh

set -euo pipefail

API="${apiBase}/api/register-node"
TOKEN="\${NODEBYTE_TOKEN:?Set NODEBYTE_TOKEN before running this script}"

NAME="$(scutil --get ComputerName 2>/dev/null || hostname)"
HOSTNAME_VAL="$(hostname -f 2>/dev/null || hostname)"
IP="$(ipconfig getifaddr en0 2>/dev/null || echo "")"
OS="macOS $(sw_vers -productVersion 2>/dev/null || echo "unknown")"
ARCH="$(uname -m)"

echo "Registering $NAME ($IP) with Nodebyte..."

curl -fsSL -X POST "$API" \\
  -H "Content-Type: application/json" \\
  -d "$(cat <<EOF
{
  "token": "$TOKEN",
  "name": "$NAME",
  "kind": "device",
  "hostname": "$HOSTNAME_VAL",
  "ip": "$IP",
  "meta": {
    "os": "$OS",
    "arch": "$ARCH"
  }
}
EOF
)"

echo ""
echo "Done! Node registered successfully."`;
  }

  // windows
  return `# Nodebyte node registration — Windows (PowerShell)
# Usage: $env:NODEBYTE_TOKEN = "your-token"; .\\register.ps1

$ErrorActionPreference = "Stop"

$api = "${apiBase}/api/register-node"
$token = $env:NODEBYTE_TOKEN
if (-not $token) {
    Write-Error "Set NODEBYTE_TOKEN before running this script."
    exit 1
}

$name     = $env:COMPUTERNAME
$hostname = [System.Net.Dns]::GetHostEntry("").HostName
$ip       = (Get-NetIPAddress -AddressFamily IPv4 |
             Where-Object { $_.InterfaceAlias -notmatch "Loopback" } |
             Select-Object -First 1).IPAddress
$os       = (Get-CimInstance Win32_OperatingSystem).Caption
$arch     = $env:PROCESSOR_ARCHITECTURE

Write-Host "Registering $name ($ip) with Nodebyte..."

$body = @{
    token    = $token
    name     = $name
    kind     = "device"
    hostname = $hostname
    ip       = $ip
    meta     = @{
        os   = $os
        arch = $arch
    }
} | ConvertTo-Json -Depth 3

$response = Invoke-RestMethod -Uri $api -Method Post \`
    -ContentType "application/json" -Body $body

Write-Host "Done! Node registered: $($response.id)"`;
}

function OnboardingScripts() {
  const [platform, setPlatform] = useState<Platform>("linux");
  const [copied, setCopied] = useState(false);
  const apiBase = typeof window !== "undefined" ? window.location.origin : "https://your-domain.com";
  const script = getScript(platform, apiBase);

  function handleCopy() {
    copyToClipboard(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <Terminal className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--muted-foreground))]" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">Quick start</h3>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              Save the script below, set <code className="rounded bg-[hsl(var(--muted))] px-1 py-0.5 font-mono text-xs">NODEBYTE_TOKEN</code>, and run it on any machine to register a node.
            </p>

            <div className="mt-4">
              {/* Platform tabs */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex overflow-x-auto rounded-lg border border-[hsl(var(--border))] p-0.5">
                  {PLATFORMS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPlatform(p)}
                      className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        platform === p
                          ? "bg-[hsl(var(--foreground))] text-[hsl(var(--background))]"
                          : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                      }`}
                    >
                      {PLATFORM_ICONS[p]}
                      {PLATFORM_LABELS[p]}
                    </button>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="gap-1.5 shrink-0 self-end" onClick={handleCopy}>
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied!" : "Copy script"}
                </Button>
              </div>

              {/* Script block */}
              <pre className="mt-3 max-h-[400px] overflow-auto rounded-lg bg-[hsl(var(--muted))] p-4 font-mono text-xs leading-relaxed">
                {script}
              </pre>

              {/* Inline usage hint */}
              <div className="mt-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3">
                <p className="text-xs font-medium">Run it:</p>
                {platform === "windows" ? (
                  <code className="mt-1 block font-mono text-xs text-[hsl(var(--muted-foreground))]">
                    $env:NODEBYTE_TOKEN = &quot;YOUR_TOKEN&quot;; .\register.ps1
                  </code>
                ) : (
                  <code className="mt-1 block font-mono text-xs text-[hsl(var(--muted-foreground))]">
                    NODEBYTE_TOKEN=&quot;YOUR_TOKEN&quot; bash register.sh
                  </code>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CopyTokenButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    copyToClipboard(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} className="gap-1">
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

function NewTokenBanner({ token, onDismiss }: { token: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    copyToClipboard(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--foreground))]">
            <KeyRound className="h-4 w-4 text-[hsl(var(--primary))]" />
            Token created — copy it now!
          </div>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            This is the only time the full token will be shown.
          </p>
          <div className="mt-2 break-all rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2 font-mono text-xs text-[hsl(var(--foreground))]">
            {token}
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3">
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={handleCopy}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied!" : "Copy token"}
        </Button>
      </div>
    </div>
  );
}
