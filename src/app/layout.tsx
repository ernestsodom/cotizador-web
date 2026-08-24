import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cotizador",
  description: "Plataforma de cotizaciones a partir de documentos",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
