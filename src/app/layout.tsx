import type { Metadata } from "next";
import "@fontsource-variable/epilogue";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { DataProvider } from "@/components/data-provider";

export const metadata: Metadata = {
  title: "VolunteerShift AI",
  description: "Match nonprofit volunteers and staff to shifts with clear, fair scheduling.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <DataProvider>
          <AppShell>{children}</AppShell>
        </DataProvider>
      </body>
    </html>
  );
}
