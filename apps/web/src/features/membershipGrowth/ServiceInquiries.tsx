import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";

type ServiceInquiry = {
  id: number;
  service_name: string;
  status: "new" | "contacted" | "closed";
  lock_version: number;
  display_name: string;
  email_address: string | null;
  phone_number: string | null;
  created_at: string;
  follow_up_on: string | null;
  follow_up_note: string | null;
};

export function ServiceInquiries() {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ServiceInquiry | null>(null);
  const [note, setNote] = useState("");
  const [due, setDue] = useState("");
  const [saveError, setSaveError] = useState("");
  const resource = useResource<{
    inquiries: ServiceInquiry[];
    pagination: {
      page: number;
      per_page: number;
      total: number;
      total_pages: number;
    };
    clinic_date: string;
  }>(
    `/api/clinic/service_inquiries?follow_up=${filter}&status=${status}&page=${page}`,
  );

  const closeEditor = () => {
    if (busyId !== null) return;
    if (
      editing &&
      (note !== (editing.follow_up_note || "") ||
        due !== (editing.follow_up_on || "")) &&
      !window.confirm("Discard unsaved follow-up changes?")
    )
      return;
    setEditing(null);
  };

  const saveFollowUp = async () => {
    if (!editing || busyId !== null) return;
    setBusyId(editing.id);
    setSaveError("");
    try {
      await api(`/api/clinic/service_inquiries/${editing.id}`, {
        method: "PATCH",
        body: {
          inquiry: {
            lock_version: editing.lock_version,
            follow_up_on: due || null,
            follow_up_note: note,
          },
        },
      });
      setEditing(null);
      resource.refresh();
    } catch (reason) {
      setSaveError(
        `${reason instanceof Error ? reason.message : "Save was not confirmed."} Your draft is retained. If this inquiry changed, copy your note, cancel, refresh and reopen it before saving.`,
      );
    } finally {
      setBusyId(null);
    }
  };

  const advance = async (inquiry: ServiceInquiry) => {
    setBusyId(inquiry.id);
    setError("");
    try {
      await api(`/api/clinic/service_inquiries/${inquiry.id}`, {
        method: "PATCH",
        body: {
          inquiry: {
            status: inquiry.status === "new" ? "contacted" : "closed",
            lock_version: inquiry.lock_version,
          },
        },
      });
      resource.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to update inquiry.",
      );
      resource.refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Paper component="section" variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
      <Stack spacing={2}>
        <Box>
          <Typography component="h2" variant="h5">
            Service inquiries
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            People who asked about a published clinic service. Contact them
            using their chosen details; an inquiry is not an appointment or
            patient record.
          </Typography>
        </Box>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          select
          label="Show inquiries"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
            setPage(1);
          }}
          size="small"
        >
          <MenuItem value="all">Latest inquiries</MenuItem>
          <MenuItem value="due">Follow-up due today or earlier</MenuItem>
        </TextField>
        <TextField
          select
          label="Inquiry status"
          size="small"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          slotProps={{
            select: { displayEmpty: true },
            inputLabel: { shrink: true },
          }}
        >
          <MenuItem value="">All statuses</MenuItem>
          <MenuItem value="new">New</MenuItem>
          <MenuItem value="contacted">Contacted</MenuItem>
          <MenuItem value="closed">Closed</MenuItem>
        </TextField>
        {!resource.data && (
          <LoadState error={resource.error} onRetry={resource.refresh} />
        )}
        {resource.data && (
          <>
            {resource.data.inquiries.length === 0 && (
              <Typography>No matching service inquiries.</Typography>
            )}
            {resource.data.inquiries.map((inquiry) => (
              <Box
                key={inquiry.id}
                sx={{ borderTop: 1, borderColor: "divider", pt: 1.5 }}
              >
                <Typography sx={{ fontWeight: 600 }}>
                  {inquiry.display_name} · {inquiry.service_name}
                </Typography>
                {inquiry.follow_up_on && (
                  <Typography
                    color={
                      inquiry.follow_up_on <= (resource.data?.clinic_date || "")
                        ? "warning.main"
                        : "text.secondary"
                    }
                  >
                    Follow up: {inquiry.follow_up_on}
                  </Typography>
                )}
                {inquiry.follow_up_note && (
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                    {inquiry.follow_up_note}
                  </Typography>
                )}
                {inquiry.status !== "closed" && (
                  <Button
                    size="small"
                    disabled={busyId !== null}
                    onClick={() => {
                      setEditing(inquiry);
                      setNote(inquiry.follow_up_note || "");
                      setDue(inquiry.follow_up_on || "");
                      setSaveError("");
                    }}
                  >
                    Plan follow-up
                  </Button>
                )}
                <Typography variant="body2" color="text.secondary">
                  {[inquiry.email_address, inquiry.phone_number]
                    .filter(Boolean)
                    .join(" · ")}{" "}
                  · {inquiry.status} ·{" "}
                  {new Date(inquiry.created_at).toLocaleString()}
                </Typography>
                {inquiry.status !== "closed" && (
                  <Button
                    size="small"
                    disabled={busyId === inquiry.id}
                    onClick={() => void advance(inquiry)}
                  >
                    {inquiry.status === "new"
                      ? "Mark contacted"
                      : "Close inquiry"}
                  </Button>
                )}
              </Box>
            ))}
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "center" }}
              component="nav"
              aria-label="Inquiry pages"
            >
              <Button
                disabled={resource.data.pagination.page <= 1}
                onClick={() =>
                  setPage((resource.data?.pagination.page || 1) - 1)
                }
              >
                Previous
              </Button>
              <Typography variant="body2">
                {resource.data.pagination.total} inquiries · Page{" "}
                {resource.data.pagination.page} of{" "}
                {Math.max(1, resource.data.pagination.total_pages)}
              </Typography>
              <Button
                disabled={
                  resource.data.pagination.page >=
                  resource.data.pagination.total_pages
                }
                onClick={() =>
                  setPage((resource.data?.pagination.page || 1) + 1)
                }
              >
                Next
              </Button>
            </Stack>
            <Button
              size="small"
              onClick={resource.refresh}
              sx={{ alignSelf: "flex-start" }}
            >
              Refresh inquiries
            </Button>
          </>
        )}
      </Stack>
      <Dialog
        open={Boolean(editing)}
        onClose={closeEditor}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Plan follow-up · {editing?.display_name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Next contact date (clinic date)"
              type="date"
              value={due}
              onChange={(event) => setDue(event.target.value)}
              disabled={busyId !== null}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Follow-up notes"
              multiline
              minRows={4}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              disabled={busyId !== null}
              slotProps={{ htmlInput: { maxLength: 2000 } }}
              helperText="Internal notes. Saving does not contact the person. Closing the inquiry clears its next-contact date."
            />
            {saveError && <Alert severity="error">{saveError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEditor} disabled={busyId !== null}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void saveFollowUp()}
            disabled={busyId !== null}
          >
            Save follow-up
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
