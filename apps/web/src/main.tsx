import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./shared/forms.css";

const root = createRoot(document.getElementById("root")!);
const nonce = document
  .querySelector('meta[name="csp-nonce"]')
  ?.getAttribute("content");
const emotionCache = createCache({
  key: "apply",
  ...(nonce ? { nonce } : {}),
});
root.render(
  <CacheProvider value={emotionCache}>
    <App />
  </CacheProvider>,
);
// No record/token persistence or service worker. A restored history page must
// reauthorize instead of resurrecting protected component state.
window.addEventListener("pagehide", () => root.unmount());
window.addEventListener("pageshow", (event) => {
  if (event.persisted) window.location.reload();
});
