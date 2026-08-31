import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { LoginForm } from '@/components/login-form';

export const metadata: Metadata = { title: 'Member login — APPly', description: 'Sign in to your APPly member account.', robots: { index: false, follow: false }, alternates: { canonical: '/login' }, openGraph: { title: 'Member login — APPly', description: 'Access your APPly member account.', url: '/login' }, twitter: { title: 'Member login — APPly', description: 'Access your APPly member account.' } };

export default function LoginPage() {
  return <><SiteHeader /><main id="main" className="wrap inner-page login-layout">
    <div className="inner-page-copy"><p className="eyebrow">YOUR APPly CLIENT PORTAL</p><h1>A familiar place.<br /><em>For what comes next.</em></h1><p>Your paperwork, onboarding, and training—together in one place. Sign in with the account details we provided after payment.</p><p className="page-fine-print">There’s no public signup. Need help signing in? <a href="/contact">Get in touch.</a></p></div>
    <LoginForm />
  </main><SiteFooter /></>;
}
