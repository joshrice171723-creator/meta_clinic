import type { Metadata } from 'next';
import { DM_Sans, Instrument_Serif } from 'next/font/google';
import './globals.css';

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
});

const instrumentSerif = Instrument_Serif({
  variable: '--font-instrument-serif',
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
});

export function generateMetadata(): Metadata {
  // APP_SITE_ORIGIN is an operator-controlled runtime value, never a Host header.
  const origin = new URL(process.env.APP_SITE_ORIGIN || 'http://localhost:3000');
  const title = 'APPly — Your clinic. A supported start.';
  const description = 'Done-for-you cash-pay clinic launch support for nurse practitioners and physician assistants in Sherman and North Texas.';
  const image = new URL('/og.png', origin).href;
  return {
    metadataBase: origin,
    title,
    description,
    alternates: { canonical: origin.href },
    icons: { icon: '/favicon.svg' },
    openGraph: { title, description, url: origin.href, siteName: 'APPly', type: 'website', locale: 'en_US', images: [{ url: image, width: 1732, height: 908, alt: 'APPly. Your clinic. A supported start. Clinic launch support for NPs & PAs.' }] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${dmSans.variable} ${instrumentSerif.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
