import type { Metadata } from "next";
import "./globals.css";

const appFlavor = process.env.NEXT_PUBLIC_APP_ENV === "prod" ? "prod" : "dev";

export const metadata: Metadata = {
  title: appFlavor === "prod" ? "Strava GPT Export" : "Strava GPT Export (DEV)",
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
