"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ShieldAlert } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && !user.is_superuser) {
      router.replace("/dashboard");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!user?.is_superuser) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <ShieldAlert className="h-12 w-12 text-[hsl(var(--muted-foreground))]" />
        <div>
          <h2 className="text-lg font-semibold">Access denied</h2>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            You need superuser privileges to access this area.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push("/dashboard")}>
          Back to dashboard
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
