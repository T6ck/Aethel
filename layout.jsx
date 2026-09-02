import './globals.css';

export const metadata = {
  title: 'Groundplane. Know what you are standing on.',
  description: 'A living view of the technology that runs your business. Infrastructure, security, operations and planning, measured against a known reference.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <meta name="theme-color" content="#050505" />
      </head>
      <body className="bg-obsidian text-soft antialiased">{children}</body>
    </html>
  );
}
