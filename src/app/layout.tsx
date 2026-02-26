import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Inter hỗ trợ đầy đủ tiếng Việt (Vietnamese subset)
const inter = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Roadmap Tool",
  description: "Internal Roadmap Planning Tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
