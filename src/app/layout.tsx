import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Strava GPT Export",
  description: "Lokales MVP fuer Strava-Exporte in ChatGPT-ready Formaten.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
