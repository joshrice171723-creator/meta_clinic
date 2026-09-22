// First-party, public-page analytics only. Never track clinic or account pages.
(() => {
  const path = window.location.pathname.replace(/\/$/, "");
  if (!["/joshua", "/demo"].includes(path)) return;
  if (navigator.doNotTrack === "1" || navigator.globalPrivacyControl) return;
  if (window.top !== window.self) return;

  async function recordVisit() {
    try {
      const referrerHost = document.referrer
        ? new URL(document.referrer).hostname
        : "";
      // Intentionally use the main API, not the isolated demo-workspace API.
      const csrf = await fetch("/api/csrf", {
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
      });
      if (!csrf.ok) return;
      const { csrf_token: token } = await csrf.json();
      if (typeof token !== "string" || !token) return;
      await fetch("/api/public/page_visits", {
        method: "POST",
        credentials: "same-origin",
        redirect: "error",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
        body: JSON.stringify({
          path,
          event_id: crypto.randomUUID(),
          referrer_host: referrerHost,
        }),
      });
    } catch {
      // Analytics must never interrupt the portfolio or demo.
    }
  }

  if (document.visibilityState === "prerender") return;
  void recordVisit();
})();
