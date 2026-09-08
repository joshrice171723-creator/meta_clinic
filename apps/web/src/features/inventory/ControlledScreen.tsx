import { useEffect, useState, type ReactNode } from "react";
import { Alert, Button, MenuItem, TextField } from "@mui/material";
import type {
  InventoryControlledData,
  InventoryControlledRead,
} from "./inventoryContracts";
import { decimalCompare, decimalDisplay } from "./inventoryContracts";

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

function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="inventory-card">
      {title && <h2>{title}</h2>}
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
  tone = "",
}: {
  label: string;
  value: ReactNode;
  tone?: string;
}) {
  return (
    <div className={`inventory-datapoint ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function number(value: string): string {
  return decimalDisplay(value);
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

export function ControlledScreen({
  data,
  loading,
  error,
  busy,
  pendingMutation,
  onRead,
  run,
}: {
  data: InventoryControlledData;
  loading: boolean;
  error: string;
  busy: boolean;
  pendingMutation: PendingInventoryMutation | null;
  onRead: (read: InventoryControlledRead) => Promise<void>;
  run: InventoryRun;
}) {
  const queue = data.controlled_page;
  const applied: InventoryControlledRead = {
    q: queue.query,
    control_status: queue.status,
    page: queue.page,
  };
  const [query, setQuery] = useState(queue.query);
  const [reconciliationId, setReconciliationId] = useState(
    data.controlled_reconciliations[0]?.id ?? "",
  );
  const [note, setNote] = useState("");
  const reconciliation =
    data.controlled_reconciliations.find(
      (record) => record.id === reconciliationId,
    ) ?? data.controlled_reconciliations[0];
  const item =
    reconciliation &&
    data.products.find((record) => record.id === reconciliation.product_id);
  const selectedLot =
    reconciliation &&
    data.lots.find((record) => record.id === reconciliation.lot_id);
  const selectedLocation =
    reconciliation &&
    data.locations.find((record) => record.id === reconciliation.location_id);
  const readBlocked = Boolean(pendingMutation);
  const readDisabled = loading || busy || readBlocked;
  const formLocked = loading || busy || Boolean(error) || readBlocked;

  useEffect(() => setQuery(queue.query), [queue.query]);
  useEffect(() => {
    if (
      !data.controlled_reconciliations.some(
        (record) => record.id === reconciliationId,
      )
    )
      setReconciliationId(data.controlled_reconciliations[0]?.id ?? "");
    setNote("");
  }, [queue.page, queue.query, queue.status]);

  const unresolved = Boolean(
    reconciliation &&
    reconciliation.status !== "resolved" &&
    reconciliation.status !== "certified",
  );
  const action = unresolved ? "investigate" : "certify";
  const endpoint = reconciliation
    ? `/api/clinic/inventory/controlled/${reconciliation.count_id}/${action}`
    : `/api/clinic/inventory/controlled/missing/${action}`;
  const body = { review: { reason: note.trim() } };
  const allowed = Boolean(
    reconciliation &&
    !reconciliation.stale &&
    (unresolved
      ? reconciliation.can_investigate
      : reconciliation.can_certify && reconciliation.status !== "certified"),
  );
  const isSamePending =
    pendingMutation?.endpoint === endpoint &&
    pendingMutation.intent === JSON.stringify({ endpoint, body });
  const mutationDisabled =
    loading ||
    busy ||
    Boolean(error) ||
    !note.trim() ||
    !allowed ||
    (readBlocked && !isSamePending);

  return (
    <div className="inventory-stack" aria-busy={loading}>
      <Card title="Controlled reconciliation queue">
        <form
          className="inventory-toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            if (!readDisabled)
              void onRead({ ...applied, q: query.trim(), page: 1 });
          }}
        >
          <TextField
            size="small"
            label="Search reconciliations"
            placeholder="Product, NDC, lot, or location"
            value={query}
            disabled={readDisabled}
            onChange={(event) => setQuery(event.target.value)}
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            select
            size="small"
            label="Reconciliation status"
            value={queue.status}
            disabled={readDisabled}
            onChange={(event) =>
              void onRead({
                ...applied,
                control_status: event.target.value as typeof queue.status,
                page: 1,
              })
            }
          >
            <MenuItem value="pending">Pending review</MenuItem>
            <MenuItem value="certified">Certified</MenuItem>
            <MenuItem value="all">All</MenuItem>
          </TextField>
          <Button type="submit" variant="outlined" disabled={readDisabled}>
            Search
          </Button>
        </form>
        <p className="inventory-results-count" role="status">
          {loading
            ? "Loading controlled reconciliations…"
            : `Showing ${queue.filtered_count === 0 ? 0 : (queue.page - 1) * queue.page_size + 1}–${Math.min(queue.page * queue.page_size, queue.filtered_count)} of ${queue.filtered_count} matching reconciliations (${queue.total_count} total).`}
        </p>
        {error && (
          <Alert severity="error">
            {error} The previous reconciliation view remains visible and actions
            are paused.
          </Alert>
        )}
        <div className="inventory-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product / lot</th>
                <th>Location</th>
                <th>Variance</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.controlled_reconciliations.map((record) => {
                const recordProduct = data.products.find(
                  (candidate) => candidate.id === record.product_id,
                );
                const recordLot = data.lots.find(
                  (candidate) => candidate.id === record.lot_id,
                );
                const recordLocation = data.locations.find(
                  (candidate) => candidate.id === record.location_id,
                );
                return (
                  <tr
                    key={record.id}
                    className={
                      record.id === reconciliation?.id ? "selected" : ""
                    }
                  >
                    <td>
                      <strong>
                        {recordProduct?.name ?? "Unknown product"}
                      </strong>
                      <small>
                        Lot {recordLot?.lot_number ?? record.lot_id}
                      </small>
                    </td>
                    <td>{recordLocation?.name ?? record.location_id}</td>
                    <td>
                      {decimalCompare(record.variance_units, "0") > 0
                        ? "+"
                        : ""}
                      {number(record.variance_units)}{" "}
                      {recordProduct?.base_unit ?? "units"}
                    </td>
                    <td>
                      <Badge
                        tone={
                          record.stale
                            ? "danger"
                            : record.status === "certified"
                              ? "success"
                              : "blue"
                        }
                      >
                        {record.stale
                          ? "stale"
                          : record.status.replaceAll("_", " ")}
                      </Badge>
                    </td>
                    <td>
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={readDisabled}
                        onClick={() => {
                          setReconciliationId(record.id);
                          setNote("");
                        }}
                      >
                        Review
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!data.controlled_reconciliations.length && (
          <p>No controlled reconciliations match this view.</p>
        )}
        {queue.page_count > 1 && (
          <nav
            className="inventory-pagination"
            aria-label="Controlled reconciliation pagination"
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

      {reconciliation && item && selectedLot && selectedLocation && (
        <div className="inventory-two-col wide-left">
          <div className="inventory-stack">
            <Card>
              <div className="inventory-panel-heading">
                <div>
                  <div className="inventory-title-row">
                    {item.schedule && (
                      <Badge tone="danger">{item.schedule}</Badge>
                    )}
                    <Badge
                      tone={
                        reconciliation.stale
                          ? "danger"
                          : reconciliation.status === "certified"
                            ? "success"
                            : "blue"
                      }
                    >
                      {reconciliation.stale
                        ? "stale"
                        : reconciliation.status.replaceAll("_", " ")}
                    </Badge>
                    {reconciliation.approved && (
                      <Badge tone="success">approved</Badge>
                    )}
                  </div>
                  <h2>{item.name}</h2>
                  <p className="inventory-lead">
                    NDC {item.ndc} · lot {selectedLot.lot_number} ·{" "}
                    {selectedLocation.name}
                  </p>
                </div>
                <div className="inventory-date">
                  <small>Counted</small>
                  <strong>
                    {dateTime(reconciliation.counted_at, data.timezone)}
                  </strong>
                </div>
              </div>
              <div className="inventory-data-grid three">
                <DataPoint
                  label="Expected at count"
                  value={`${number(reconciliation.expected_units)} ${item.base_unit}`}
                />
                <DataPoint
                  label="Counted"
                  value={`${number(reconciliation.counted_units)} ${item.base_unit}`}
                />
                <DataPoint
                  label="Recorded variance"
                  value={`${decimalCompare(reconciliation.variance_units, "0") > 0 ? "+" : ""}${number(reconciliation.variance_units)} ${item.base_unit}`}
                  tone={
                    decimalCompare(reconciliation.variance_units, "0") === 0
                      ? "success"
                      : "danger"
                  }
                />
              </div>
              <DataPoint
                label="Counter"
                value={
                  data.users.find(
                    (user) => user.id === reconciliation.counter_id,
                  )?.name ?? "Recorded operator"
                }
              />
              {reconciliation.stale && (
                <Alert severity="error">
                  This count is stale because the underlying stock changed.
                  Record a current count before review.
                </Alert>
              )}
            </Card>

            <Card title="Separation-of-duties trail">
              <ol className="inventory-trail">
                <li className="done">
                  <strong>Count recorded</strong>
                  <span>
                    {number(reconciliation.counted_units)} {item.base_unit}{" "}
                    counted.
                  </span>
                </li>
                <li className={reconciliation.investigation_note ? "done" : ""}>
                  <strong>Variance investigated and adjusted</strong>
                  <span>
                    {reconciliation.investigation_note ??
                      "Pending authorized investigation and adjustment."}
                  </span>
                </li>
                <li
                  className={
                    reconciliation.status === "certified" ? "done" : ""
                  }
                >
                  <strong>Certification</strong>
                  <span>
                    {reconciliation.certified_at
                      ? `Certified ${dateTime(reconciliation.certified_at, data.timezone)}.`
                      : "Blocked until variance resolution and a separate reviewer."}
                  </span>
                </li>
              </ol>
            </Card>
          </div>

          <Card title={unresolved ? "Resolve variance" : "Certify count"}>
            <div className="inventory-stack compact">
              <TextField
                size="small"
                label={
                  unresolved ? "Investigation findings" : "Certification note"
                }
                value={note}
                disabled={formLocked || !allowed}
                required
                multiline
                minRows={3}
                placeholder={
                  unresolved
                    ? "Required count and research findings"
                    : "Required independent review note"
                }
                slotProps={{ htmlInput: { maxLength: 200 } }}
                onChange={(event) => setNote(event.target.value)}
              />
              {!allowed && (
                <span className="inventory-permission">
                  {reconciliation.stale
                    ? "A current count is required before review."
                    : "You are not an eligible independent reviewer for this step."}
                </span>
              )}
              {unresolved && (
                <p className="inventory-info">
                  Resolution posts the recorded{" "}
                  {number(reconciliation.variance_units)} {item.base_unit}{" "}
                  adjustment. The expected and variance evidence above remains
                  unchanged.
                </p>
              )}
              <Button
                variant="contained"
                disabled={mutationDisabled}
                onClick={() =>
                  void run(
                    endpoint,
                    body,
                    unresolved
                      ? "Variance resolved"
                      : "Reconciliation certified",
                    unresolved
                      ? "Variance resolved. A separate reviewer may now certify."
                      : "The reconciliation was certified with the review note.",
                    () => setNote(""),
                  )
                }
              >
                {isSamePending
                  ? `Retry ${action}`
                  : unresolved
                    ? "Post variance resolution"
                    : reconciliation.status === "certified"
                      ? "Certified"
                      : "Certify reconciliation"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {reconciliation && (!item || !selectedLot || !selectedLocation) && (
        <Alert severity="error">
          This reconciliation references unavailable product, lot, or location
          data and cannot be reviewed from this response.
        </Alert>
      )}
    </div>
  );
}
