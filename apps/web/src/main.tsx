import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./shared/forms.css";

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
// No record/token persistence or service worker. A restored history page must
// reauthorize instead of resurrecting protected component state.
window.addEventListener("pagehide", () => root.unmount());
window.addEventListener("pageshow", (event) => {
  if (event.persisted) window.location.reload();
});
