import { useEffect, useState, type RefObject } from "react";

// Match the invoice dialog's same-origin iframe containment without changing
// shared dialog or billing ownership. Cross-origin embeds keep MUI's fallback.
export function visibleRegistrationDialogInsets(view: Window) {
  let frame: HTMLElement | null;
  try {
    frame = view.frameElement as HTMLElement | null;
  } catch {
    return null;
  }
  const host = frame?.ownerDocument.defaultView;
  if (!frame || !host) return null;
  const bounds = frame.getBoundingClientRect();
  const scale = bounds.height / frame.offsetHeight;
  if (!Number.isFinite(scale) || scale <= 0 || view.innerHeight <= 0)
    return null;
  const contentTop = bounds.top + frame.clientTop * scale;
  const visibleTop = Math.max(0, contentTop);
  const visibleBottom = Math.min(
    host.innerHeight,
    contentTop + view.innerHeight * scale,
  );
  if (visibleBottom <= visibleTop) return null;
  return {
    top: (visibleTop - contentTop) / scale,
    bottom: view.innerHeight - (visibleBottom - contentTop) / scale,
  };
}

export function useRegistrationDialogViewport(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
) {
  const [insets, setInsets] = useState<{
    top: number;
    bottom: number;
  } | null>(null);
  useEffect(() => {
    setInsets(null);
    const view = anchor.current?.ownerDocument.defaultView;
    if (!open || !view) return;
    let host: Window | null;
    try {
      host = view.frameElement?.ownerDocument.defaultView ?? null;
    } catch {
      return;
    }
    if (!host) return;
    const update = () => {
      const next = visibleRegistrationDialogInsets(view);
      setInsets((current) =>
        current?.top === next?.top && current?.bottom === next?.bottom
          ? current
          : next,
      );
    };
    update();
    host.addEventListener("scroll", update, true);
    host.addEventListener("resize", update);
    view.addEventListener("resize", update);
    return () => {
      host.removeEventListener("scroll", update, true);
      host.removeEventListener("resize", update);
      view.removeEventListener("resize", update);
    };
  }, [open, anchor]);
  return insets;
}
