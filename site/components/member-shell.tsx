import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { LogoutButton } from '@/components/logout-button';
export function MemberShell({ children, active }: { children: React.ReactNode; active?: 'overview' | 'paperwork' | 'training' }) {
  return <><SiteHeader /><main id="main" className="wrap inner-page portal-page"><div className="portal-navigation"><nav aria-label="Client workspace"><a href="/portal" aria-current={active === 'overview' ? 'page' : undefined}>Overview</a><a href="/paperwork" aria-current={active === 'paperwork' ? 'page' : undefined}>Paperwork</a><a href="/training" aria-current={active === 'training' ? 'page' : undefined}>Onboarding & Training</a></nav><LogoutButton /></div>{children}</main><SiteFooter /></>;
}
export function ConnectionNotice() {
  return <div className="connection-notice"><p className="eyebrow">MEMBER SERVICES</p><h1>We’re getting things connected.</h1><p>The member service is currently unavailable. Please check back soon.</p><a className="text-link" href="/">Back to APPly →</a></div>;
}
