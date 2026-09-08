import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Button, MenuItem, TextField } from "@mui/material";
import type {
  Decimal,
  InventoryCountData,
  InventoryCountLine,
  InventoryCountRead,
} from "./inventoryContracts";
import { decimalCompare, decimalDisplay } from "./inventoryContracts";
import { InventoryScanInput } from "./InventoryScanInput";

type PendingInventoryMutation = {
  endpoint: string;
  intent: string;
};

type InventoryRun = (
  endpoint: string,
  body: Record<string, unknown>,
  successTitle: string,
  successDetail: string,
  afterSuccess?: (payload: { id?: number | string }) => void,
) => Promise<void>;

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="inventory-card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "blue";
}) {
  return <span className={`inventory-badge ${tone}`}>{children}</span>;
}

function DataPoint({
  label,
  value,
  detail,
  tone = "",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: string;
}) {
  return (
    <div className={`inventory-datapoint ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

function number(value: Decimal | number): string {
  return decimalDisplay(String(value));
}

function dateTime(value: string, timezone: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function isOpen(status: string): boolean {
  return status === "open";
}

function countTone(
  status: string,
): "neutral" | "success" | "warning" | "danger" | "blue" {
  if (status === "completed") return "success";
  if (status === "cancelled") return "neutral";
  return "blue";
}

export function CycleCountsScreen({
  data,
  loading,
  error,
  busy,
  pendingMutation,
  onRead,
  run,
}: {
  data: InventoryCountData;
  loading: boolean;
  error: string;
  busy: boolean;
  pendingMutation: PendingInventoryMutation | null;
  onRead: (read: InventoryCountRead) => Promise<void>;
  run: InventoryRun;
}) {
  const queue = data.count_page;
  const session = data.selected_session;
  const applied: InventoryCountRead = {
    q: queue.query,
    count_status: queue.status,
    page: queue.page,
    session_id: queue.selected_id ?? undefined,
    line_page: data.line_page.page,
    history_page: data.history_page.page,
  };
  const [query, setQuery] = useState(queue.query);
  const [locationId, setLocationId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [blind, setBlind] = useState(true);
  const [createReason, setCreateReason] = useState("");
  const [lineId, setLineId] = useState("");
  const [countedUnits, setCountedUnits] = useState("");
  const [observationReason, setObservationReason] = useState("");
  const [lineActionReason, setLineActionReason] = useState("");
  const [nextAssigneeId, setNextAssigneeId] = useState("");
  const [sessionActionReason, setSessionActionReason] = useState("");
  const scanTarget = useRef<{ sessionId: string; lineId: string } | null>(null);
  const selectedLine =
    data.lines.find((line) => line.id === lineId) ?? data.lines[0];
  const canConfigure = data.capabilities["inventory.configure"] === true;
  const readBlocked = Boolean(pendingMutation);
  const readDisabled = loading || busy || readBlocked;
  const formLocked = loading || busy || Boolean(error) || readBlocked;

  useEffect(() => setQuery(queue.query), [queue.query]);
  useEffect(() => {
    const pendingScan = scanTarget.current;
    const target =
      pendingScan && pendingScan.sessionId === session?.id
        ? pendingScan.lineId
        : "";
    const first =
      data.lines.find((line) => line.id === target) ?? data.lines[0];
    setLineId(first?.id ?? "");
    setCountedUnits("");
    setObservationReason("");
    setLineActionReason("");
    setNextAssigneeId(
      session &&
        data.assignees.some((record) => record.id === session.assignee_id)
        ? session.assignee_id
        : "",
    );
    setSessionActionReason("");
    if (target && first?.id === target) scanTarget.current = null;
    if (scanTarget.current?.sessionId !== session?.id)
      scanTarget.current = null;
  }, [session?.id, data.line_page.page]);
  useEffect(() => {
    if (error) scanTarget.current = null;
  }, [error]);

  const isSamePending = (endpoint: string, body: Record<string, unknown>) =>
    pendingMutation?.endpoint === endpoint &&
    pendingMutation.intent === JSON.stringify({ endpoint, body });
  const mutationDisabled = (
    endpoint: string,
    body: Record<string, unknown>,
    invalid: boolean,
    allowed: boolean,
  ) =>
    loading ||
    busy ||
    Boolean(error) ||
    invalid ||
    !allowed ||
    (readBlocked && !isSamePending(endpoint, body));

  const createEndpoint = "/api/clinic/inventory/count-sessions";
  const createBody = {
    session: {
      location_id: locationId,
      assignee_id: assigneeId,
      due_on: dueOn,
      blind,
      reason: createReason.trim(),
    },
  };
  const createInvalid =
    !locationId || !assigneeId || !dueOn || !createReason.trim();

  const observeEndpoint = selectedLine
    ? `/api/clinic/inventory/count-session-lines/${selectedLine.id}/observe`
    : "/api/clinic/inventory/count-session-lines/missing/observe";
  const observeBody = {
    count: {
      counted_units: countedUnits,
      reason: observationReason.trim(),
    },
  };
  const countValid = /^\d+(?:\.\d+)?$/.test(countedUnits.trim());
  const canObserve = Boolean(
    session &&
    selectedLine &&
    data.capabilities["inventory.count"] === true &&
    isOpen(session.status) &&
    !selectedLine.skipped &&
    session.assignee_id === data.current_user_id,
  );
  const observeInvalid =
    !countValid ||
    decimalCompare(countedUnits || "0", "0") < 0 ||
    !observationReason.trim();

  const lineAction = selectedLine?.skipped ? "resume" : "skip";
  const lineActionEndpoint = selectedLine
    ? `/api/clinic/inventory/count-session-lines/${selectedLine.id}/${lineAction}`
    : `/api/clinic/inventory/count-session-lines/missing/${lineAction}`;
  const lineActionBody = { event: { reason: lineActionReason.trim() } };
  const lineActionInvalid =
    !session ||
    !selectedLine ||
    !isOpen(session.status) ||
    !lineActionReason.trim();

  const approveEndpoint = selectedLine?.latest_count
    ? `/api/clinic/inventory/counts/${selectedLine.latest_count.id}/approve`
    : "/api/clinic/inventory/counts/missing/approve";
  const approveBody = {};
  const approveInvalid =
    !selectedLine?.latest_count ||
    selectedLine.latest_count.approved ||
    selectedLine.latest_count.stale;
  const canApprove = selectedLine?.latest_count?.can_approve === true;

  const reassignEndpoint = session
    ? `/api/clinic/inventory/count-sessions/${session.id}/reassign`
    : "/api/clinic/inventory/count-sessions/missing/reassign";
  const reassignBody = {
    event: {
      assignee_id: nextAssigneeId,
      reason: sessionActionReason.trim(),
    },
  };
  const reassignInvalid =
    !session ||
    !isOpen(session.status) ||
    !nextAssigneeId ||
    nextAssigneeId === session.assignee_id ||
    !sessionActionReason.trim();

  const completeEndpoint = session
    ? `/api/clinic/inventory/count-sessions/${session.id}/complete`
    : "/api/clinic/inventory/count-sessions/missing/complete";
  const completeBody = { event: { reason: sessionActionReason.trim() } };
  const allLinesResolved = Boolean(
    session &&
    session.line_count > 0 &&
    session.skipped_count + session.reconciled_count === session.line_count,
  );
  const completeInvalid =
    !session ||
    !isOpen(session.status) ||
    !allLinesResolved ||
    !sessionActionReason.trim();

  const cancelEndpoint = session
    ? `/api/clinic/inventory/count-sessions/${session.id}/cancel`
    : "/api/clinic/inventory/count-sessions/missing/cancel";
  const cancelBody = { event: { reason: sessionActionReason.trim() } };
  const cancelInvalid =
    !session || !isOpen(session.status) || !sessionActionReason.trim();

  const selectLine = (line: InventoryCountLine) => {
    scanTarget.current = null;
    setLineId(line.id);
    setCountedUnits("");
    setObservationReason("");
    setLineActionReason("");
  };

  return (
    <div className="inventory-stack" aria-busy={loading}>
      <Card title="Cycle-count sessions">
        <form
          className="inventory-toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            if (!readDisabled)
              void onRead({
                ...applied,
                q: query.trim(),
                page: 1,
                session_id: undefined,
                line_page: 1,
                history_page: 1,
              });
          }}
        >
          <TextField
            size="small"
            label="Search sessions"
            placeholder="Location, assignee, or reason"
            value={query}
            disabled={readDisabled}
            onChange={(event) => setQuery(event.target.value)}
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            select
            size="small"
            label="Session status"
            value={queue.status}
            disabled={readDisabled}
            onChange={(event) =>
              void onRead({
                ...applied,
                count_status: event.target.value as typeof queue.status,
                page: 1,
                session_id: undefined,
                line_page: 1,
                history_page: 1,
              })
            }
          >
            <MenuItem value="open">Open</MenuItem>
            <MenuItem value="overdue">Overdue</MenuItem>
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="completed">Completed</MenuItem>
            <MenuItem value="cancelled">Cancelled</MenuItem>
          </TextField>
          <Button type="submit" variant="outlined" disabled={readDisabled}>
            Search
          </Button>
        </form>
        <p className="inventory-results-count" role="status">
          {loading
            ? "Loading count sessions…"
            : `Showing ${queue.filtered_count === 0 ? 0 : (queue.page - 1) * queue.page_size + 1}–${Math.min(queue.page * queue.page_size, queue.filtered_count)} of ${queue.filtered_count} matching sessions (${queue.total_count} total).`}
        </p>
        {error && (
          <Alert severity="error">
            {error} The previous count view remains visible and actions are
            paused.
          </Alert>
        )}
        <div className="inventory-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Location</th>
                <th>Assignee</th>
                <th>Progress</th>
                <th>Due</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.sessions.map((record) => (
                <tr
                  key={record.id}
                  className={record.id === queue.selected_id ? "selected" : ""}
                >
                  <td>
                    <strong>{record.location_path}</strong>
                    <small>
                      {record.blind
                        ? "Blind count"
                        : "Visible expected quantity"}
                    </small>
                  </td>
                  <td>{record.assignee_name}</td>
                  <td>
                    {record.observed_count} observed · {record.skipped_count}{" "}
                    skipped
                    <small>
                      {record.reconciled_count} reconciled of{" "}
                      {record.line_count} lines
                    </small>
                  </td>
                  <td>{record.due_on}</td>
                  <td>
                    <Badge tone={countTone(record.status)}>
                      {record.status.replaceAll("_", " ")}
                    </Badge>
                  </td>
                  <td>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={readDisabled}
                      onClick={() =>
                        void onRead({
                          ...applied,
                          session_id: record.id,
                          line_page: 1,
                          history_page: 1,
                        })
                      }
                    >
                      Open session
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.sessions.length && <p>No count sessions match this view.</p>}
        {queue.page_count > 1 && (
          <nav
            className="inventory-pagination"
            aria-label="Count session pagination"
          >
            <Button
              variant="outlined"
              disabled={readDisabled || queue.page === 1}
              onClick={() => void onRead({ ...applied, page: queue.page - 1 })}
            >
              Previous
            </Button>
            <span>
              Page {queue.page} of {queue.page_count}
            </span>
            <Button
              variant="outlined"
              disabled={readDisabled || queue.page === queue.page_count}
              onClick={() => void onRead({ ...applied, page: queue.page + 1 })}
            >
              Next
            </Button>
          </nav>
        )}
      </Card>

      <Card title="Create count session">
        <p className="inventory-info">
          Creation freezes the current stock positions in one active leaf bin.
          Sessions are opened immediately and are not scheduled automatically.
        </p>
        <form
          className="inventory-form-grid"
          onSubmit={(event) => event.preventDefault()}
        >
          <TextField
            select
            size="small"
            label="Leaf bin"
            value={locationId}
            disabled={formLocked}
            required
            onChange={(event) => setLocationId(event.target.value)}
          >
            {data.locations.map((record) => (
              <MenuItem key={record.id} value={record.id}>
                {record.path}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Assigned counter"
            value={assigneeId}
            disabled={formLocked}
            required
            onChange={(event) => setAssigneeId(event.target.value)}
          >
            {data.assignees.map((record) => (
              <MenuItem key={record.id} value={record.id}>
                {record.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            type="date"
            label="Due date"
            value={dueOn}
            disabled={formLocked}
            required
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={(event) => setDueOn(event.target.value)}
          />
          <TextField
            select
            size="small"
            label="Counting mode"
            value={blind ? "blind" : "visible"}
            disabled={formLocked}
            onChange={(event) => setBlind(event.target.value === "blind")}
          >
            <MenuItem value="blind">Blind count</MenuItem>
            <MenuItem value="visible">Show expected quantity</MenuItem>
          </TextField>
          <TextField
            size="small"
            label="Session reason"
            value={createReason}
            disabled={formLocked}
            required
            multiline
            minRows={2}
            slotProps={{ htmlInput: { maxLength: 200 } }}
            onChange={(event) => setCreateReason(event.target.value)}
          />
          {!canConfigure && (
            <span className="inventory-permission">
              View only · inventory.configure is required for this action.
            </span>
          )}
          <Button
            variant="contained"
            disabled={mutationDisabled(
              createEndpoint,
              createBody,
              createInvalid,
              canConfigure,
            )}
            onClick={() =>
              void run(
                createEndpoint,
                createBody,
                "Count session created",
                "The frozen bin positions are ready for the assigned counter.",
                () => {
                  setLocationId("");
                  setAssigneeId("");
                  setDueOn("");
                  setCreateReason("");
                  setBlind(true);
                },
              )
            }
          >
            {isSamePending(createEndpoint, createBody)
              ? "Retry creation"
              : "Create count session"}
          </Button>
        </form>
      </Card>

      {session && (
        <>
          <Card title={`Count at ${session.location_path}`}>
            <div className="inventory-data-grid four">
              <DataPoint label="Assignee" value={session.assignee_name} />
              <DataPoint label="Due" value={session.due_on} />
              <DataPoint
                label="Mode"
                value={session.blind ? "Blind" : "Expected visible"}
              />
              <DataPoint
                label="Status"
                value={session.status.replaceAll("_", " ")}
              />
              <DataPoint
                label="Observed"
                value={`${session.observed_count} / ${session.line_count}`}
              />
              <DataPoint label="Skipped" value={session.skipped_count} />
              <DataPoint label="Reconciled" value={session.reconciled_count} />
              <DataPoint
                label="Created"
                value={dateTime(session.created_at, data.timezone)}
              />
            </div>
            <p className="inventory-info">{session.reason}</p>
            {isOpen(session.status) &&
              session.assignee_id === data.current_user_id && (
                <InventoryScanInput
                  context="count"
                  sessionId={session.id}
                  disabled={formLocked}
                  label="Scan a product in this count session"
                  manualFallback="Select the exact frozen line manually."
                  onMatch={(match) => {
                    if (!match.line_id || !match.line_page) return;
                    const current = data.lines.find(
                      (line) => line.id === match.line_id,
                    );
                    if (current) {
                      if (current.id !== selectedLine?.id) selectLine(current);
                      return;
                    }
                    scanTarget.current = {
                      sessionId: session.id,
                      lineId: match.line_id,
                    };
                    void onRead({
                      ...applied,
                      line_page: match.line_page,
                    });
                  }}
                />
              )}
            {isOpen(session.status) &&
              session.assignee_id !== data.current_user_id && (
                <Alert severity="info">
                  Scanner selection is available to the assigned counter.
                </Alert>
              )}
          </Card>

          <div className="inventory-two-col wide-left">
            <Card title="Frozen count lines">
              <div className="inventory-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product / lot</th>
                      <th>Expected</th>
                      <th>Latest observation</th>
                      <th>State</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.map((line) => (
                      <tr
                        key={line.id}
                        className={
                          line.id === selectedLine?.id ? "selected" : ""
                        }
                      >
                        <td>
                          <strong>{line.product_name}</strong>
                          <small>
                            Lot {line.lot_number} · expires {line.expires_on}
                          </small>
                        </td>
                        <td>
                          {line.expected_units === null
                            ? "Hidden until observation"
                            : `${number(line.expected_units)} ${line.stock_unit}`}
                        </td>
                        <td>
                          {line.latest_count
                            ? `${number(line.latest_count.counted_units)} ${line.stock_unit}`
                            : "Not counted"}
                          {line.latest_count && (
                            <small>
                              Variance{" "}
                              {decimalCompare(
                                line.latest_count.variance_units,
                                "0",
                              ) > 0
                                ? "+"
                                : ""}
                              {number(line.latest_count.variance_units)} ·{" "}
                              {dateTime(
                                line.latest_count.created_at,
                                data.timezone,
                              )}
                            </small>
                          )}
                        </td>
                        <td>
                          {line.skipped ? (
                            <Badge tone="warning">Skipped</Badge>
                          ) : line.latest_count?.stale ? (
                            <Badge tone="danger">Recount needed</Badge>
                          ) : line.reconciled ? (
                            <Badge tone="success">Reconciled</Badge>
                          ) : (
                            <Badge tone="blue">Pending</Badge>
                          )}
                          {line.skip_reason && (
                            <small>{line.skip_reason}</small>
                          )}
                        </td>
                        <td>
                          <Button
                            size="small"
                            variant="outlined"
                            disabled={formLocked}
                            onClick={() => selectLine(line)}
                          >
                            Review line
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.lines.length && (
                <p>No frozen positions are on this page.</p>
              )}
              {data.line_page.page_count > 1 && (
                <nav
                  className="inventory-pagination"
                  aria-label="Count line pagination"
                >
                  <Button
                    variant="outlined"
                    disabled={readDisabled || data.line_page.page === 1}
                    onClick={() => {
                      scanTarget.current = null;
                      void onRead({
                        ...applied,
                        line_page: data.line_page.page - 1,
                      });
                    }}
                  >
                    Previous
                  </Button>
                  <span>
                    Page {data.line_page.page} of {data.line_page.page_count}
                  </span>
                  <Button
                    variant="outlined"
                    disabled={
                      readDisabled ||
                      data.line_page.page === data.line_page.page_count
                    }
                    onClick={() => {
                      scanTarget.current = null;
                      void onRead({
                        ...applied,
                        line_page: data.line_page.page + 1,
                      });
                    }}
                  >
                    Next
                  </Button>
                </nav>
              )}
            </Card>

            <Card
              title={
                selectedLine
                  ? `Count ${selectedLine.product_name}`
                  : "Record observation"
              }
            >
              {!selectedLine ? (
                <p>No count line is available on this page.</p>
              ) : (
                <div className="inventory-stack compact">
                  <p className="inventory-info">
                    Lot {selectedLine.lot_number} at{" "}
                    {selectedLine.location_path}.
                    {selectedLine.expected_units === null
                      ? " Expected quantity remains hidden until this observation is recorded."
                      : ` Expected ${number(selectedLine.expected_units)} ${selectedLine.stock_unit}.`}
                  </p>
                  <TextField
                    size="small"
                    type="number"
                    label={`Counted quantity (${selectedLine.stock_unit})`}
                    value={countedUnits}
                    disabled={formLocked || !canObserve}
                    slotProps={{ htmlInput: { min: 0, step: "any" } }}
                    onChange={(event) => setCountedUnits(event.target.value)}
                  />
                  <TextField
                    size="small"
                    label="Observation reason / note"
                    value={observationReason}
                    disabled={formLocked || !canObserve}
                    required
                    multiline
                    minRows={2}
                    slotProps={{ htmlInput: { maxLength: 200 } }}
                    onChange={(event) =>
                      setObservationReason(event.target.value)
                    }
                  />
                  {!canObserve &&
                    isOpen(session.status) &&
                    !selectedLine.skipped && (
                      <Alert severity="info">
                        Only the assigned counter can record this observation.
                      </Alert>
                    )}
                  <Button
                    variant="contained"
                    disabled={mutationDisabled(
                      observeEndpoint,
                      observeBody,
                      observeInvalid,
                      canObserve,
                    )}
                    onClick={() =>
                      void run(
                        observeEndpoint,
                        observeBody,
                        "Count recorded",
                        "The immutable observation was added to this line.",
                        () => {
                          setCountedUnits("");
                          setObservationReason("");
                        },
                      )
                    }
                  >
                    {isSamePending(observeEndpoint, observeBody)
                      ? "Retry observation"
                      : selectedLine.latest_count
                        ? "Record recount"
                        : "Record observation"}
                  </Button>

                  {isOpen(session.status) && (
                    <>
                      <TextField
                        size="small"
                        label={
                          selectedLine.skipped ? "Resume reason" : "Skip reason"
                        }
                        value={lineActionReason}
                        disabled={formLocked || !canConfigure}
                        required
                        multiline
                        minRows={2}
                        slotProps={{ htmlInput: { maxLength: 200 } }}
                        onChange={(event) =>
                          setLineActionReason(event.target.value)
                        }
                      />
                      <Button
                        variant="outlined"
                        disabled={mutationDisabled(
                          lineActionEndpoint,
                          lineActionBody,
                          lineActionInvalid,
                          canConfigure,
                        )}
                        onClick={() =>
                          void run(
                            lineActionEndpoint,
                            lineActionBody,
                            selectedLine.skipped
                              ? "Count line resumed"
                              : "Count line skipped",
                            selectedLine.skipped
                              ? "The assigned counter can record a new observation."
                              : "The line remains in the session with its skip evidence.",
                            () => setLineActionReason(""),
                          )
                        }
                      >
                        {isSamePending(lineActionEndpoint, lineActionBody)
                          ? `Retry ${lineAction}`
                          : selectedLine.skipped
                            ? "Resume line"
                            : "Skip line"}
                      </Button>
                    </>
                  )}

                  {selectedLine.latest_count && (
                    <>
                      <div className="inventory-data-grid three">
                        <DataPoint
                          label="Expected at count"
                          value={`${number(selectedLine.latest_count.expected_units)} ${selectedLine.stock_unit}`}
                        />
                        <DataPoint
                          label="Counted"
                          value={`${number(selectedLine.latest_count.counted_units)} ${selectedLine.stock_unit}`}
                        />
                        <DataPoint
                          label="Variance"
                          value={`${decimalCompare(selectedLine.latest_count.variance_units, "0") > 0 ? "+" : ""}${number(selectedLine.latest_count.variance_units)} ${selectedLine.stock_unit}`}
                          tone={
                            decimalCompare(
                              selectedLine.latest_count.variance_units,
                              "0",
                            ) === 0
                              ? "success"
                              : "danger"
                          }
                        />
                      </div>
                      {isOpen(session.status) && (
                        <>
                          <Button
                            variant="outlined"
                            disabled={mutationDisabled(
                              approveEndpoint,
                              approveBody,
                              approveInvalid,
                              canApprove,
                            )}
                            onClick={() =>
                              void run(
                                approveEndpoint,
                                approveBody,
                                "Count approved",
                                "The latest count was reconciled by an eligible independent reviewer.",
                              )
                            }
                          >
                            {isSamePending(approveEndpoint, approveBody)
                              ? "Retry approval"
                              : selectedLine.latest_count.approved
                                ? "Approved"
                                : "Approve latest count"}
                          </Button>
                          {!canApprove && !selectedLine.latest_count.approved && (
                            <p className="inventory-permission">
                              A different eligible reviewer is required. Variances
                              also require inventory.adjust.
                            </p>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </Card>
          </div>

          {isOpen(session.status) && (
            <Card title="Manage count session">
              <div className="inventory-form-grid">
                <TextField
                  select
                  size="small"
                  label="Reassign counter"
                  value={nextAssigneeId}
                  disabled={formLocked || !canConfigure}
                  onChange={(event) => setNextAssigneeId(event.target.value)}
                >
                  {data.assignees.map((record) => (
                    <MenuItem key={record.id} value={record.id}>
                      {record.name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  size="small"
                  label="Management reason"
                  value={sessionActionReason}
                  disabled={formLocked || !canConfigure}
                  required
                  multiline
                  minRows={2}
                  slotProps={{ htmlInput: { maxLength: 200 } }}
                  onChange={(event) =>
                    setSessionActionReason(event.target.value)
                  }
                />
                {!canConfigure && (
                  <p className="inventory-permission">
                    inventory.configure is required for session management.
                  </p>
                )}
                <div className="inventory-form-actions">
                  <Button
                    variant="outlined"
                    disabled={mutationDisabled(
                      reassignEndpoint,
                      reassignBody,
                      reassignInvalid,
                      canConfigure,
                    )}
                    onClick={() =>
                      void run(
                        reassignEndpoint,
                        reassignBody,
                        "Count session reassigned",
                        "The new assignee can continue the open session.",
                        () => setSessionActionReason(""),
                      )
                    }
                  >
                    {isSamePending(reassignEndpoint, reassignBody)
                      ? "Retry reassignment"
                      : "Reassign"}
                  </Button>
                  <Button
                    variant="contained"
                    disabled={mutationDisabled(
                      completeEndpoint,
                      completeBody,
                      completeInvalid,
                      canConfigure,
                    )}
                    onClick={() =>
                      void run(
                        completeEndpoint,
                        completeBody,
                        "Count session completed",
                        "All frozen lines were skipped or reconciled.",
                        () => setSessionActionReason(""),
                      )
                    }
                  >
                    {isSamePending(completeEndpoint, completeBody)
                      ? "Retry completion"
                      : "Complete session"}
                  </Button>
                  <Button
                    color="error"
                    variant="outlined"
                    disabled={mutationDisabled(
                      cancelEndpoint,
                      cancelBody,
                      cancelInvalid,
                      canConfigure,
                    )}
                    onClick={() =>
                      void run(
                        cancelEndpoint,
                        cancelBody,
                        "Count session cancelled",
                        "The cancellation reason was recorded.",
                        () => setSessionActionReason(""),
                      )
                    }
                  >
                    {isSamePending(cancelEndpoint, cancelBody)
                      ? "Retry cancellation"
                      : "Cancel session"}
                  </Button>
                </div>
                {!allLinesResolved && (
                  <Alert severity="info">
                    Completion remains blocked until every frozen line is
                    skipped or reconciled.
                  </Alert>
                )}
              </div>
            </Card>
          )}

          <Card title="Session history">
            <div className="inventory-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Event</th>
                    <th>Actor</th>
                    <th>Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((event) => {
                    const actor =
                      data.users.find((record) => record.id === event.actor_id)
                        ?.name ?? "Clinic user";
                    const assigned =
                      data.assignees.find(
                        (record) => record.id === event.assignee_id,
                      )?.name ??
                      data.users.find(
                        (record) => record.id === event.assignee_id,
                      )?.name;
                    return (
                      <tr key={event.id}>
                        <td>{dateTime(event.created_at, data.timezone)}</td>
                        <td>{event.kind.replaceAll("_", " ")}</td>
                        <td>{actor}</td>
                        <td>
                          {event.reason}
                          {assigned && <small>Assigned to {assigned}</small>}
                          {event.count && (
                            <small>
                              Counted {number(event.count.counted_units)} ·
                              variance {number(event.count.variance_units)}
                            </small>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!data.events.length && (
              <p>No session events have been recorded.</p>
            )}
            {data.history_page.page_count > 1 && (
              <nav
                className="inventory-pagination"
                aria-label="Count history pagination"
              >
                <Button
                  variant="outlined"
                  disabled={readDisabled || data.history_page.page === 1}
                  onClick={() =>
                    void onRead({
                      ...applied,
                      history_page: data.history_page.page - 1,
                    })
                  }
                >
                  Previous
                </Button>
                <span>
                  Page {data.history_page.page} of{" "}
                  {data.history_page.page_count}
                </span>
                <Button
                  variant="outlined"
                  disabled={
                    readDisabled ||
                    data.history_page.page === data.history_page.page_count
                  }
                  onClick={() =>
                    void onRead({
                      ...applied,
                      history_page: data.history_page.page + 1,
                    })
                  }
                >
                  Next
                </Button>
              </nav>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
