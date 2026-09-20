import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Paper,
  Portal,
  Stack,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";

export function spotlightDirection(
  rect: { top: number; left: number; width: number; height: number },
  viewportWidth: number,
  viewportHeight: number,
): "above" | "below" | "to the left" | "to the right" | null {
  if (rect.top + rect.height <= 0) return "above";
  if (rect.top >= viewportHeight) return "below";
  if (rect.left + rect.width <= 0) return "to the left";
  if (rect.left >= viewportWidth) return "to the right";
  return null;
}

const actions: Record<string, RegExp> = {
  clinic_setup: /save clinic profile|finalize clinic setup/i,
  membership_publish:
    /publish|create.*(membership|offering)|new.*(membership|offering)/i,
  patient_register: /register|add patient|new patient/i,
  patient_enroll: /choose|select|enroll|continue/i,
  membership_payment: /simulate|accept.*payment/i,
  appointment_schedule: /book|schedule|new appointment/i,
  appointment_reschedule: /reschedule|save appointment/i,
  appointment_cancel: /cancel appointment/i,
  patient_check_in: /check.in|arrived/i,
  visit_save:
    /confirm and open chart|open.*visit|save.*(note|draft|encounter)/i,
  visit_complete: /confirm and open chart|complete.*(visit|encounter)|sign/i,
  inventory_product_create: /add product|create product|new product/i,
  inventory_supplier_create: /add supplier|create supplier|new supplier/i,
  inventory_location_create: /add location|create location|new location/i,
  inventory_purchase_order_create:
    /create purchase order|new purchase order|create draft/i,
  inventory_shipment_record: /record shipment|add shipment/i,
  inventory_receive: /receive|post receipt|confirm receipt/i,
  inventory_count:
    /start.*count|new.*count|record count|post count|submit count|create count/i,
  inventory_adjust: /adjust|post adjustment/i,
  inventory_transfer: /transfer|post transfer/i,
  inventory_recall: /recall|create hold|place hold/i,
};

const reviewPrompts: Record<string, string[]> = {
  patient_flow_review: [
    "Find the work inbox for tasks before scheduling.",
    "Review the prepared patient's pending work and responsible team.",
    "Notice how completing contact work differs from booking an appointment.",
  ],
  tracking_board_review: [
    "Read the board's visit stages and clinic date.",
    "Locate the prepared visit and review its recorded room and status.",
    "Review the visit actions without changing the encounter.",
  ],
  refill_review: [
    "Find the refill queue and its status filters.",
    "Review the sample request's patient and medication context.",
    "Locate the review actions. This walkthrough does not send a prescription.",
  ],
  recall_review: [
    "Find the recall and care-gap worklist.",
    "Review the sample patient's follow-up context and due work.",
    "Locate the next-action controls without sending outreach.",
  ],
  telehealth_review: [
    "Find the telehealth workspace and visit readiness information.",
    "Review the prepared patient's visit context.",
    "Locate the access and preparation controls. This walkthrough does not start a live call.",
  ],
  scribe_review: [
    "Review the prepared Scribe encounter and its recording consent status.",
    "Select Start recording to open the persistent recording dock.",
    "Select Open treatment workspace in the dock. The recording remains available while you move between clinic pages.",
  ],
  waitlist_review: [
    "Find capacity and waitlist controls.",
    "Review the prepared clinic's availability and patient context.",
    "Locate the offer workflow. This walkthrough does not send outreach.",
  ],
  operations_review: [
    "Find the clinic's operations overview.",
    "Review the recorded workload and readiness information.",
    "Identify which workspace owns the next action for an item.",
  ],
  reminders_review: [
    "Find the reminders workspace and its filters.",
    "Review the sample appointment and local reminder information.",
    "Locate the review controls. No email or text is sent in this walkthrough.",
  ],
  messages_review: [
    "Find the clinic's staff-messaging workspace.",
    "Review the available conversation and participant context.",
    "Identify the conversation controls and how staff context stays attached.",
  ],
  workforce_review: [
    "Find the workforce workspace and its sections.",
    "Review the prepared clinic team's available workforce context.",
    "Locate the staffing and timekeeping controls available to this role.",
  ],
  billing_review: [
    "Find the cash-based billing workspace.",
    "Review the prepared patient's recorded payment and balance context.",
    "Locate the transaction history. No real charge is made in this walkthrough.",
  ],
  growth_review: [
    "Find the membership growth workspace.",
    "Review the prepared membership and patient entry information.",
    "Distinguish an inquiry or enrollment from a confirmed simulated payment.",
  ],
  settings_review: [
    "Find the clinic and account settings sections.",
    "Review the current settings and their scope.",
    "Identify which settings belong to the clinic versus the signed-in user.",
  ],
  inventory_overview_review: [
    "Find the inventory overview and filters.",
    "Review the prepared stock quantities and product context.",
    "Locate the stock, purchasing and receiving workspaces.",
  ],
  inventory_ledger_review: [
    "Find the movement ledger and its filters.",
    "Review the prepared receipt movement and its resulting stock.",
    "Inspect the movement's source and reason to trace how stock changed.",
  ],
};

export function tutorialActionMatches(step: string, label: string) {
  return actions[step.split("__").at(-1) ?? step]?.test(label) ?? false;
}

function visible(element: HTMLElement) {
  return (
    element.getClientRects().length > 0 &&
    !element.closest('[aria-hidden="true"], [inert]')
  );
}

function buttonWithLabel(root: Document, expression: RegExp) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(
    (element) => visible(element) && expression.test(element.textContent ?? ""),
  );
}

function scribeReviewTarget(
  root: Document,
  content: Element,
  reviewStage: number,
) {
  if (reviewStage === 0)
    return Array.from(content.querySelectorAll<HTMLElement>("h1, h2")).find(
      (element) => visible(element) && !element.closest("nav"),
    );

  const recordingControl = buttonWithLabel(root, /^(start recording|recording)$/i);
  if (reviewStage === 1) return recordingControl;

  return (
    buttonWithLabel(root, /^open treatment workspace$/i) ?? recordingControl
  );
}

export function findTutorialTarget(
  root: Document,
  step: string,
  reviewStage?: number,
): HTMLElement | null {
  // Let dialogs, selects and confirmation prompts own their interaction layer.
  if (
    Array.from(
      root.querySelectorAll<HTMLElement>('[role="dialog"], [role="listbox"]'),
    ).some(visible)
  )
    return null;
  const content =
    root.querySelector<HTMLElement>(".clinic-main, main, #main") ?? root.body;
  if (reviewStage !== undefined) {
    if (step.split("__").at(-1) === "scribe_review")
      return scribeReviewTarget(root, content, reviewStage) ?? content;

    const selector =
      reviewStage === 0
        ? "h1, h2"
        : reviewStage === 1
          ? 'table, [role="grid"], [role="list"], article, section'
          : 'form, [role="toolbar"], [role="tablist"], table';
    const region = Array.from(
      content.querySelectorAll<HTMLElement>(selector),
    ).find((element) => visible(element) && !element.closest("nav"));
    return region ?? (content as HTMLElement);
  }
  step = step.split("__").at(-1) ?? step;
  const editorSelector =
    step === "membership_publish"
      ? ".subscription-editor__workspace > fieldset"
      : step === "inventory_supplier_create"
        ? ".supplier-create-form"
        : null;
  const editor = editorSelector
    ? content.querySelector<HTMLElement>(editorSelector)
    : null;
  if (editor && visible(editor)) return editor;
  const stockAction =
    step === "inventory_adjust"
      ? "adjust"
      : step === "inventory_transfer"
        ? "transfer"
        : null;
  if (stockAction) {
    const tab = content.querySelector<HTMLElement>(`#stock-tab-${stockAction}`);
    if (tab && visible(tab))
      return tab.getAttribute("aria-selected") === "true"
        ? content.querySelector<HTMLElement>("#stock-action-panel")
        : tab;
  }
  const regionTitles: Record<string, string> = {
    inventory_product_create: "Product definition",
    inventory_location_create: "Add storage location",
    inventory_purchase_order_create: "Create purchase order",
    inventory_recall: "Create recall case",
    inventory_count: "Create count session",
  };
  const regionTitle = regionTitles[step];
  if (regionTitle) {
    const heading = Array.from(
      content.querySelectorAll<HTMLElement>("h2, h3"),
    ).find(
      (element) =>
        visible(element) && element.textContent?.trim() === regionTitle,
    );
    const region = heading?.closest<HTMLElement>(".inventory-card");
    if (region) return region;
  }
  const marked = Array.from(
    content.querySelectorAll<HTMLElement>("[data-demo-next]:not(:disabled)"),
  ).find(visible);
  if (marked) return marked;
  const forms = Array.from(
    content.querySelectorAll<HTMLFormElement>("form"),
  ).filter(visible);
  const activeForm = forms.find((form) => form.contains(root.activeElement));
  if (activeForm) return activeForm;
  const control = Array.from(
    content.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], [role="tab"]',
    ),
  ).find(
    (element) =>
      visible(element) &&
      tutorialActionMatches(
        step,
        element.getAttribute("aria-label") || element.textContent || "",
      ),
  );
  return (
    control?.closest("form") ??
    control ??
    (step === "visit_save"
      ? Array.from(
          content.querySelectorAll<HTMLTextAreaElement>(
            ".soap-sections textarea:not(:disabled)",
          ),
        ).find(visible)
      : null) ??
    forms.find((form) =>
      form.querySelector('input:not([type="hidden"]), textarea, select'),
    ) ??
    null
  );
}

type Highlight = {
  target: HTMLElement;
  top: number;
  left: number;
  width: number;
  height: number;
  label: string;
};

export function DemoSpotlight({
  step,
  description,
  review = false,
}: {
  step: string;
  description: string;
  review?: boolean;
}) {
  const [enabled, setEnabled] = useState(true);
  const [reviewStage, setReviewStage] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const prompts = reviewPrompts[step] ?? [description];
  const finishReview = async () => {
    setFinishing(true);
    setFinishError(null);
    try {
      await api("/api/demo/lesson/complete", { method: "POST", body: {} });
    } catch (error) {
      setFinishError(
        error instanceof Error
          ? error.message
          : "The walkthrough could not be completed. Try again.",
      );
    } finally {
      setFinishing(false);
    }
  };

  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  useEffect(() => {
    let scheduled = 0;
    const measure = () => {
      scheduled = 0;
      setDialogOpen(
        Array.from(
          document.querySelectorAll<HTMLElement>(
            '[role="dialog"], [role="alertdialog"], [role="listbox"]',
          ),
        ).some(visible),
      );
      const target = findTutorialTarget(
        document,
        step,
        review ? reviewStage : undefined,
      );
      if (!target) {
        setHighlight(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      const label =
        target.tagName === "TEXTAREA"
          ? "Edit the visit note, then save your changes"
          : target.tagName === "FORM" ||
              target.classList.contains("inventory-card") ||
              target.tagName === "FIELDSET"
            ? "Complete the highlighted form"
            : (
                target.getAttribute("aria-label") ||
                target.textContent ||
                "Continue"
              ).trim();
      const next = {
        target,
        top: rect.top - 6,
        left: rect.left - 6,
        width: rect.width + 12,
        height: rect.height + 12,
        label,
      };
      setHighlight((previous) =>
        previous &&
        Object.keys(next).every(
          (key) =>
            previous[key as keyof Highlight] === next[key as keyof Highlight],
        )
          ? previous
          : next,
      );
    };
    const update = () => {
      if (!scheduled) scheduled = requestAnimationFrame(measure);
    };
    const observer = new MutationObserver((records) => {
      if (
        records.some(
          (record) =>
            !(
              record.target instanceof Element &&
              record.target.closest("[data-demo-coach]")
            ),
        )
      )
        update();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "aria-hidden", "aria-selected", "class"],
    });
    window.addEventListener("resize", update);
    document.addEventListener("scroll", update, true);
    document.addEventListener("focusin", update);
    document.addEventListener("input", update);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEnabled(false);
    };
    document.addEventListener("keydown", escape);
    update();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(scheduled);
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", update, true);
      document.removeEventListener("focusin", update);
      document.removeEventListener("input", update);
      document.removeEventListener("keydown", escape);
    };
  }, [step, review, reviewStage]);
  const coachAtTop = Boolean(
    highlight && highlight.top > window.innerHeight / 2,
  );
  const direction = highlight
    ? spotlightDirection(highlight, window.innerWidth, window.innerHeight)
    : null;
  const onScreen = highlight && direction === null;
  if (dialogOpen) return null;
  return (
    <Portal>
      <Box
        data-demo-coach
        sx={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: (theme) => theme.zIndex.drawer + 3,
        }}
      >
        {enabled && highlight && !onScreen && (
          <Box
            aria-hidden
            data-demo-backdrop
            sx={{
              position: "absolute",
              inset: 0,
              bgcolor: "rgba(9, 18, 35, 0.60)",
            }}
          />
        )}
        {enabled && highlight && onScreen && (
          <Box
            aria-hidden
            sx={{
              position: "absolute",
              top: highlight.top,
              left: highlight.left,
              width: highlight.width,
              height: highlight.height,
              border: "2px solid",
              borderColor: "primary.main",
              borderRadius: 1,
              boxShadow: "0 0 0 9999px rgba(9, 18, 35, 0.60)",
            }}
          />
        )}
        <Paper
          elevation={6}
          sx={{
            position: "absolute",
            top: coachAtTop ? 16 : undefined,
            bottom: coachAtTop ? undefined : 16,
            right: 16,
            width: "min(350px, calc(100% - 32px))",
            p: 2,
            pointerEvents: "auto",
            border: 1,
            borderColor: "divider",
          }}
        >
          <Stack spacing={1}>
            <Typography variant="overline">
              {review
                ? `Walkthrough ${reviewStage + 1} of ${prompts.length}`
                : "Your next action"}
            </Typography>
            {enabled && (
              <>
                <Typography variant="subtitle2" role="status">
                  {review
                    ? prompts[reviewStage]
                    : highlight?.label || "Follow the lesson instructions"}
                </Typography>
                {direction && (
                  <Typography variant="body2" role="status">
                    The next action is {direction}. Select Show me to bring it
                    into view.
                  </Typography>
                )}
                <Typography variant="body2" color="text.secondary">
                  {review
                    ? "Review the highlighted area, then continue. This does not record a clinical or administrative decision."
                    : description}
                </Typography>
              </>
            )}
            {finishError && <Alert severity="error">{finishError}</Alert>}
            {enabled && review && (
              <Stack direction="row" spacing={1}>
                <Button
                  disabled={reviewStage === 0 || finishing}
                  onClick={() => setReviewStage((value) => value - 1)}
                >
                  Back
                </Button>
                {reviewStage < prompts.length - 1 ? (
                  <Button
                    variant="contained"
                    onClick={() => setReviewStage((value) => value + 1)}
                  >
                    Next
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    disabled={finishing}
                    onClick={() => void finishReview()}
                  >
                    {finishing ? "Finishing…" : "Finish walkthrough"}
                  </Button>
                )}
              </Stack>
            )}
            <Stack direction="row" spacing={1}>
              {enabled && highlight && (
                <Button
                  size="small"
                  onClick={() => {
                    highlight.target.scrollIntoView({
                      block: "center",
                      inline: "center",
                      behavior: "instant",
                    });
                    highlight.target.focus({ preventScroll: true });
                  }}
                >
                  Show me
                </Button>
              )}
              <Button
                size="small"
                onClick={() => setEnabled((value) => !value)}
              >
                {enabled ? "Hide spotlight" : "Show tutorial"}
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Box>
    </Portal>
  );
}
