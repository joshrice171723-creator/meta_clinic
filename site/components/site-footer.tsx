export function SiteFooter() {
  return <footer className="wrap footer-wrap">
    <div className="site-footer">
      <a className="wordmark" href="/" aria-label="APPly home">APPly<span className="brand-dot" /></a>
      <span>Independent practices. A supported start.</span>
      <div className="footer-links"><a href="/contact">Contact</a><a href="/login">Member login</a><span>Sherman &amp; North Texas</span></div>
    </div>
    <div className="footer-bottom"><p>Clinic-launch consulting. Not legal or clinical advice. No guarantee of approval or opening date.</p><span>© {new Date().getFullYear()} APPly</span></div>
  </footer>;
}
