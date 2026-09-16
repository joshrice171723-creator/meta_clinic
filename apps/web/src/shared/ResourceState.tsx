import type { ReactNode } from "react";
import {
  Alert,
  AlertTitle,
  Button,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";

export type ResourceStateName =
  "loading" | "empty" | "stale" | "error" | "success" | "blocked";

export type ResourceStateProps =
  | {
      state: Exclude<ResourceStateName, "stale">;
      title?: string;
      message?: string;
      onRetry?: () => void;
      retryLabel?: string;
      children?: ReactNode;
    }
  | {
      state: "stale";
      title?: string;
      message?: string;
      onRetry?: () => void;
      retryLabel?: string;
      children: ReactNode;
    };

const defaults: Record<
  Exclude<ResourceStateName, "loading">,
  { title: string; message: string }
> = {
  empty: {
    title: "No results",
    message: "No records match this view.",
  },
  stale: {
    title: "Update unavailable",
    message:
      "Showing the last loaded information. Refresh to check for updates.",
  },
  error: {
    title: "Could not load",
    message: "This information could not be loaded.",
  },
  success: {
    title: "Complete",
    message: "The action completed successfully.",
  },
  blocked: {
    title: "Action unavailable",
    message: "This action is not available.",
  },
};

export function ResourceState(props: ResourceStateProps) {
  const { state, children, onRetry, retryLabel = "Retry" } = props;
  if (state === "loading") {
    return (
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: "center" }}
        role="status"
        aria-live="polite"
        aria-busy="true"
        data-resource-state="loading"
      >
        <CircularProgress size={20} aria-hidden="true" />
        <Typography color="text.secondary">
          {props.message ?? "Loading…"}
        </Typography>
      </Stack>
    );
  }

  const fallback = defaults[state];
  const alert = (
    <Alert
      severity={
        state === "error"
          ? "error"
          : state === "success"
            ? "success"
            : state === "stale" || state === "blocked"
              ? "warning"
              : "info"
      }
      role={state === "error" ? "alert" : "status"}
      aria-live={state === "error" ? "assertive" : "polite"}
      data-resource-state={state}
      action={
        onRetry ? (
          <Button color="inherit" size="small" onClick={onRetry}>
            {retryLabel}
          </Button>
        ) : undefined
      }
    >
      <AlertTitle>{props.title ?? fallback.title}</AlertTitle>
      {props.message ?? fallback.message}
    </Alert>
  );

  return children ? (
    <Stack spacing={2}>
      {alert}
      {children}
    </Stack>
  ) : (
    alert
  );
}
