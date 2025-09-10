export const metadata = {
  title: "House Decision Dashboard",
  description: "Run the numbers and logistics for a home purchase",
};

import "./globals.css";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
        {children}
      </body>
    </html>
  );
}
