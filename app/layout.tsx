import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Masters Purse Tracker",
  description: "Live Masters 2026 purse leaderboard for our pool.",
  openGraph: {
    title: "Masters Purse Tracker",
    description: "Live Masters 2026 purse leaderboard for our pool.",
    images: [
      {
        url: "/wall.jpg",
        width: 1200,
        height: 630,
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Masters Purse Tracker",
    description: "Live Masters 2026 purse leaderboard for our pool.",
    images: ["/wall.jpg"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}