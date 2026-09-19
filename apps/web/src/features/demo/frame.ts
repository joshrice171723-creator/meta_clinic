export function isDemoFrame(): boolean {
  return (
    typeof window !== "undefined" &&
    window.parent !== window &&
    window.name === "clinic-demo-workspace"
  );
}

export function notifyDemo(type: "demo:changed" | "demo:loaded"): void {
  if (isDemoFrame())
    window.parent.postMessage({ type }, window.location.origin);
}
