import { ArrowUpRight } from 'lucide-react';

export function SiteHeader() {
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header wrap" id="top">
      <a className="wordmark" href="/" aria-label="APPly home">APPly<span className="brand-dot" /></a>
      <nav aria-label="Main navigation">
        <a href="/#approach">The approach</a>
        <a href="/#process">How it works</a>
        <a href="/login" className="login-link">Member login</a>
        <a href="/contact" className="nav-cta">Contact us <ArrowUpRight aria-hidden="true" size={17} /></a>
      </nav>
    </header>
  </>;
}
