import type { Metadata } from "next";
import { cookies } from "next/headers";
import { IBM_Plex_Sans_Thai, Inter, Noto_Sans_SC, Noto_Sans_Thai } from "next/font/google";
import { LocaleProvider } from "@/i18n/client";
import { THEME_COOKIE } from "@/i18n";
import { getLocale } from "@/i18n/server";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const plexThai = IBM_Plex_Sans_Thai({ subsets: ["thai"], weight: ["400", "500", "600"], variable: "--font-plex-thai", display: "swap" });
const notoThai = Noto_Sans_Thai({ subsets: ["thai"], variable: "--font-noto-thai", display: "swap" });
// CJK font is large: not preloaded, loaded on demand by unicode-range.
const notoSC = Noto_Sans_SC({ weight: ["400", "500", "600"], variable: "--font-noto-sc", display: "swap", preload: false });

export const metadata: Metadata = {
  title: "Product Plus — China Marketplace Scout",
  description: "Douyin · 1688 · Temu · Xiaohongshu product scout",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const raw = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = raw === "light" || raw === "dark" ? raw : null;
  return (
    <html
      lang={locale === "zh" ? "zh-CN" : locale}
      className={[inter.variable, plexThai.variable, notoThai.variable, notoSC.variable, theme ?? ""].join(" ").trim()}
      data-theme={theme ?? undefined}
    >
      <body>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
