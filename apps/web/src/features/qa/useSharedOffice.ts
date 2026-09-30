import { useCallback, useEffect, useRef, useState } from "react";
import { sharedOffice, type SharedOffice } from "./sharedOffice";
import type { OfficeRequest } from "./officeTransport";

/** Read-only snapshot polling shared by the website and the fullscreen Office. */
export function useSharedOffice(request: OfficeRequest, poll: boolean) {
  const [office, setOffice] = useState<SharedOffice>();
  const [officeError, setOfficeError] = useState("");
  const generation = useRef(0);
  const active = useRef(true);
  const refreshOffice = useCallback(async () => {
    const current = ++generation.current;
    try {
      const snapshot = sharedOffice(await request<unknown>("/api/qa/office"));
      if (!active.current || current !== generation.current) return;
      setOffice(snapshot);
      setOfficeError("");
    } catch (reason) {
      if (!active.current || current !== generation.current) return;
      setOffice(undefined);
      setOfficeError(
        reason instanceof Error ? reason.message : "Shared Office unavailable.",
      );
    }
  }, [request]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      generation.current++;
    };
  }, []);
  useEffect(() => {
    if (!poll) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) void refreshOffice();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [poll, refreshOffice]);
  return { office, officeError, refreshOffice };
}
