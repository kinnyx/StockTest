import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Stockroom | สินค้าและตะกร้า",
  description: "ระบบสต๊อกสินค้าและตะกร้าสินค้า",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
