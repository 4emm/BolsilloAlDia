import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BolsilloAlDía · API",
  description: "API REST de BolsilloAlDía: finanzas personales y metas de ahorro",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
