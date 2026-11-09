import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import { I18nProvider } from "@/i18n/context";
import { dirFor, getDictionary, isLocale, locales } from "@/i18n/dictionaries";
import { PwaRegister } from "@/components/PwaRegister";
import "../globals.css";

// Persian UI: YekanBakh (variable), English UI: Inter. globals.css picks one by <html lang>.
const yekan = localFont({
  src: "../../fonts/YekanBakh-VF.woff2",
  weight: "100 900",
  variable: "--font-yekan",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = getDictionary(isLocale(locale) ? locale : "fa");
  return {
    title: { default: t.appName, template: `%s · ${t.appName}` },
    description: t.tagline,
    applicationName: t.appName,
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: t.appName },
    icons: {
      icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#142b5c",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html
      lang={locale}
      dir={dirFor(locale)}
      className={`${yekan.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <I18nProvider locale={locale}>{children}</I18nProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
