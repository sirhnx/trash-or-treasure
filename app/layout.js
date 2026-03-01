import "./globals.css";

export const metadata = {
    title: "Trash or Treasure",
    description: "AI-powered collectible value scanner. Find the gold hiding in plain sight.",
    manifest: "/manifest.json",
    themeColor: "#0a0a0a",
    viewport: {
          width: "device-width",
          initialScale: 1,
          maximumScale: 1,
          userScalable: false,
    },
};

export default function RootLayout({ children }) {
    return (
          <html lang="en">
            <body>{children}</body>
      </html>
    );
}
