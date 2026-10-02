import { useEffect } from "react";
import { isDemoFrame } from "../demo/frame";
import { collectDemoNavigationBlockers } from "../demo/navigationBlockers";
import type { NavigationConfirmation } from "../demo/accountSwitch";
import { confirmUnregisteredDemoNavigation } from "../demo/DemoFrameBoundary";

export function registerPatientDemoNavigation() {
  if (!isDemoFrame()) return () => {};
  const confirm = (event: Event) => {
    const detail = (event as CustomEvent<NavigationConfirmation>).detail;
    detail.handled = true;
    // Preserve the conservative discard prompt for dialogs without their own
    // registered draft guard. Pending/unknown outcomes cannot be discarded.
    detail.allowed = confirmUnregisteredDemoNavigation(
      collectDemoNavigationBlockers(),
    );
  };
  window.addEventListener("demo:confirm-local-navigation", confirm);
  return () =>
    window.removeEventListener("demo:confirm-local-navigation", confirm);
}

export function usePatientDemoNavigation() {
  useEffect(registerPatientDemoNavigation, []);
}
