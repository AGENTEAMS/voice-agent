import type { Metadata } from "next";
import { Heebo, IBM_Plex_Mono, Frank_Ruhl_Libre } from "next/font/google";
import "./globals.css";
import StyleSwitcher from "@/components/StyleSwitcher";

const heebo = Heebo({ subsets: ["hebrew", "latin"], variable: "--font-heebo" });
const mono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-mono",
});
const serif = Frank_Ruhl_Libre({
  weight: ["400", "500", "700"],
  subsets: ["hebrew", "latin"],
  variable: "--font-serif",
});

export const metadata: Metadata = { title: "מיקה — במה · קיסו" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} ${mono.variable} ${serif.variable}`}>
      <body>
        {children}
        <StyleSwitcher />
      </body>
    </html>
  );
}
