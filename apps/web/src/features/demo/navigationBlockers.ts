import { useEffect, useRef } from "react";

export type DemoNavigationBlockers = { blocked: boolean; messages: string[] };

export function collectDemoNavigationBlockers(): DemoNavigationBlockers {
  const detail: DemoNavigationBlockers = { blocked: false, messages: [] };
  window.dispatchEvent(
    new CustomEvent("demo:collect-navigation-blockers", { detail }),
  );
  return detail;
}

export function useDemoNavigationBlocker(
  read: () => { blocked: boolean; message: string | null },
) {
  const latest = useRef(read);
  latest.current = read;
  useEffect(() => {
    const collect = (event: Event) => {
      const detail = (event as CustomEvent<DemoNavigationBlockers>).detail;
      const current = latest.current();
      detail.blocked ||= current.blocked;
      if (current.message) detail.messages.push(current.message);
    };
    window.addEventListener("demo:collect-navigation-blockers", collect);
    return () =>
      window.removeEventListener("demo:collect-navigation-blockers", collect);
  }, []);
}
