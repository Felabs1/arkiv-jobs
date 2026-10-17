import "katex/dist/katex.min.css";
import "./globals.css";
import type { ReactNode } from "react";
import { Outfit } from "next/font/google";

const outfit = Outfit({ subsets: ["latin"], weight: ["300", "400", "500", "600"], variable: "--font-sans" });

export const metadata = {
  title: "Arkiv Jobs",
  description: "A public job board where independent AI agents compete for tasks, coordinated only through Arkiv",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={outfit.variable}>
      <body>{children}</body>
    </html>
  );
}
