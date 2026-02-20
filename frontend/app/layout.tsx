import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vtalk",
  description: "Secure peer-to-peer video calls",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Puter.js for free AI Transcription & Summaries */}
        <Script
          src="https://js.puter.com/v2/"
          strategy="afterInteractive"
        />
      </head>
      <body className="font-cabinet antialiased">
        {children}
      </body>
    </html>
  );
}
