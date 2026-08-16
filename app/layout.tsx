import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "寂静宇宙 · 费米悖论模拟器",
  description:
    "在真实量级的空间与时间尺度中，模拟生命、技术文明、星际扩张与灭亡。",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
