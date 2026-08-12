import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { connection } from "next/server";

import { AuthProvider } from "@/lib/auth";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Nodebyte",
  description: "Modern inventory for devices and sites.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Nonce-based CSP requires request-time rendering so Next can apply the
  // per-request nonce to every framework and inline script.
  await connection();
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
