import type { Metadata } from 'next';
import { MapPin, MessageSquare } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { ContactForm } from '@/components/contact-form';

export const metadata: Metadata = { title: 'Contact — APPly', description: 'Talk with APPly about opening your cash-pay clinic in Sherman and North Texas.', alternates: { canonical: '/contact' }, openGraph: { title: 'Contact — APPly', description: 'Your clinic starts with a conversation.', url: '/contact' }, twitter: { title: 'Contact — APPly', description: 'Your clinic starts with a conversation.' } };

export default function ContactPage() {
  return <><SiteHeader /><main id="main" className="wrap inner-page contact-layout">
    <div className="inner-page-copy">
      <p className="eyebrow">LET’S TALK ABOUT YOUR NEXT CHAPTER</p>
      <h1>Your clinic.<br /><em>Our first conversation.</em></h1>
      <p>Whether you’re just starting to explore or already working toward opening, tell us what you have in mind.</p>
      <div className="contact-detail"><MapPin aria-hidden="true" size={21} /><div><strong>Rooted in North Texas</strong><span>Serving NPs and PAs in Sherman and the surrounding region.</span></div></div>
      <div className="contact-detail"><MessageSquare aria-hidden="true" size={21} /><div><strong>A conversation, not a commitment</strong><span>Ask about clinic-launch support, working together, or member access.</span></div></div>
      <p className="page-fine-print">This is a business inquiry channel, not a patient portal. Do not send patient information, medical questions, or confidential documents.</p>
    </div>
    <ContactForm />
  </main><SiteFooter /></>;
}
