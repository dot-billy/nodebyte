import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <Link href="/" className="mb-8 text-2xl font-bold tracking-tight">
        Nodebyte
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
