import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpiceZ-Cam",
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
        <script src="https://js.puter.com/v2/"></script>
      </head>
      <body className="font-cabinet antialiased">
        {children}
      </body>
    </html>
  );
}
