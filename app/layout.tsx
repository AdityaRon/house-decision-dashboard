export const metadata = {
  title: "House Decision Dashboard",
  description: "Run the numbers and logistics for a home purchase",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head />
      <body className="min-h-screen">
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="/_next/static/css/app/globals.css" />
        {children}
      </body>
    </html>
  );
}
