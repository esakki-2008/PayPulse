import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/ui/app-shell";

import "./globals.css";

export const metadata: Metadata = {
  title: "PayPulse — Payment Intelligence",
  description: "An explainable AI operating system for merchant payments.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
