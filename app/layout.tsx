import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

const appUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
const themeBootstrapScript = `
  (() => {
    try {
      const savedTheme = window.localStorage.getItem("avericode-theme");
      const theme = savedTheme === "light" || savedTheme === "dark"
        ? savedTheme
        : "light";
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    } catch {}
  })();
`;

export const metadata: Metadata = {
  applicationName: "AveriCode",
  metadataBase: new URL(appUrl),
  icons: {
    icon: [{ url: "/logo.svg", type: "image/svg+xml" }],
    shortcut: ["/logo.svg"]
  },
  title: {
    default: "AveriCode",
    template: "%s | AveriCode"
  },
  description: "Uma visão do portfólio GitHub, das mudanças recentes e das pessoas que contribuem em seus projetos.",
  openGraph: {
    title: "AveriCode",
    description: "Contexto de projetos e contribuidores para quem lidera equipes.",
    siteName: "AveriCode",
    type: "website",
    url: "/"
  },
  twitter: {
    card: "summary",
    title: "AveriCode",
    description: "Contexto de projetos e contribuidores para quem lidera equipes."
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className={`${GeistSans.variable} ${GeistMono.variable}`}>{children}</body>
    </html>
  );
}
