import { useEffect, useRef, useState } from "react";
import { Alert, Button, Chip, TextField } from "@mui/material";
import { api } from "../../api/client";
import type {
  InventoryScanContext,
  InventoryScanData,
  InventoryScanMatch,
} from "./inventoryContracts";

export function InventoryScanInput({
  context,
  productId,
  sessionId,
  disabled,
  label = "Scan product barcode",
  manualFallback,
  onMatch,
  onClear,
}: {
  context: InventoryScanContext;
  productId?: string;
  sessionId?: string;
  disabled: boolean;
  label?: string;
  manualFallback: string;
  onMatch: (match: InventoryScanMatch) => void;
  onClear?: () => void;
}) {
  const [scanCode, setScanCode] = useState("");
  const [result, setResult] = useState<InventoryScanData>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const requestVersion = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const scopeKey = `${context}:${productId ?? ""}:${sessionId ?? ""}`;
  const currentScope = useRef(scopeKey);
  const currentlyDisabled = useRef(disabled);
  const currentOnMatch = useRef(onMatch);
  currentScope.current = scopeKey;
  currentlyDisabled.current = disabled;
  currentOnMatch.current = onMatch;

  useEffect(() => {
    requestVersion.current += 1;
    controller.current?.abort();
    controller.current = null;
    setScanCode("");
    setResult(undefined);
    setError("");
    setLoading(false);
  }, [scopeKey, disabled]);

  useEffect(
    () => () => {
      requestVersion.current += 1;
      controller.current?.abort();
    },
    [],
  );

  const lookup = async (page = 1) => {
    const code = scanCode.trim();
    if (!code || disabled || loading) return;
    const requestedScope = scopeKey;
    const version = ++requestVersion.current;
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    setLoading(true);
    setError("");
    if (page === 1) {
      setResult(undefined);
      onClear?.();
    }
    try {
      const payload = await api<{ data: InventoryScanData }>(
        "/api/clinic/inventory/scan",
        {
          method: "POST",
          signal: nextController.signal,
          body: {
            scan_code: code,
            context,
            page,
            ...(productId ? { product_id: productId } : {}),
            ...(sessionId ? { session_id: sessionId } : {}),
          },
        },
      );
      if (
        version !== requestVersion.current ||
        currentlyDisabled.current ||
        currentScope.current !== requestedScope
      )
        return;
      setResult(payload.data);
      if (payload.data.status === "unmatched") onClear?.();
      if (
        payload.data.status === "matched" &&
        payload.data.matches.length === 1
      ) {
        const match = payload.data.matches[0];
        if (!productId || match.product_id === productId) {
          currentOnMatch.current(match);
          setScanCode("");
        } else {
          setResult({
            ...payload.data,
            status: "unmatched",
            matches: [],
            message: "This scan does not match the selected product.",
          });
          onClear?.();
        }
      }
    } catch (reason) {
      if (version !== requestVersion.current) return;
      if (reason instanceof DOMException && reason.name === "AbortError")
        return;
      setError(
        reason instanceof Error
          ? reason.message
          : "The scan could not be checked.",
      );
    } finally {
      if (version === requestVersion.current) {
        setLoading(false);
        controller.current = null;
      }
    }
  };

  const choose = (match: InventoryScanMatch) => {
    if (
      disabled ||
      loading ||
      !result ||
      (context === "count" && (!match.line_id || !match.line_page)) ||
      (productId && match.product_id !== productId)
    )
      return;
    currentOnMatch.current(match);
    setResult({
      ...result,
      status: "matched",
      matches: [match],
      message: `Selected ${match.product_name}.`,
    });
    setScanCode("");
  };

  return (
    <div className="inventory-stack compact">
      <div className="inventory-toolbar">
        <TextField
          size="small"
          label={label}
          value={scanCode}
          disabled={disabled || loading}
          autoComplete="off"
          placeholder="Scan or enter exact SKU, NDC, or device identifier"
          slotProps={{ htmlInput: { maxLength: 200 } }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            event.stopPropagation();
            void lookup(1);
          }}
          onChange={(event) => {
            requestVersion.current += 1;
            controller.current?.abort();
            controller.current = null;
            setLoading(false);
            setScanCode(event.target.value);
            setResult(undefined);
            setError("");
          }}
        />
        <Button
          type="button"
          variant="outlined"
          disabled={disabled || loading || !scanCode.trim()}
          onClick={() => void lookup(1)}
        >
          {loading ? "Checking…" : "Check scan"}
        </Button>
      </div>
      <p className="inventory-info">
        Scanner input checks exact catalog identifiers. It does not enter a
        quantity, lot number, expiration date, or post inventory.
      </p>
      {error && (
        <Alert severity="error">
          {error} {manualFallback}
        </Alert>
      )}
      {result?.status === "matched" && result.matches[0] && (
        <Alert severity="success">
          {result.message ?? `Matched ${result.matches[0].product_name}.`} No
          inventory action was posted.
        </Alert>
      )}
      {(result?.status === "ambiguous" || result?.status === "too_many") && (
        <Alert severity="warning">
          {result.message ?? "This code matches more than one catalog item."}{" "}
          Choose the intended result below when selection is available. No
          inventory action was posted. {manualFallback}
        </Alert>
      )}
      {result?.status === "unmatched" && (
        <Alert severity="info">
          {result.message ?? "No exact catalog identifier matched this scan."}{" "}
          {manualFallback}
        </Alert>
      )}
      {result &&
        (result.status === "ambiguous" || result.status === "too_many") &&
        result.matches.length > 0 && (
          <div className="inventory-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Matched product</th>
                  <th>Identifier</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {result.matches.map((match) => (
                  <tr key={`${match.product_id}:${match.line_id ?? "product"}`}>
                    <td>
                      {match.product_name}
                      {match.lot_number && (
                        <small>
                          Lot {match.lot_number}
                          {match.expires_on
                            ? ` · expires ${match.expires_on}`
                            : ""}
                          {match.location_name
                            ? ` · ${match.location_name}`
                            : ""}
                        </small>
                      )}
                    </td>
                    <td>
                      {match.matched_fields.map((field) => (
                        <Chip
                          key={field}
                          size="small"
                          label={field.replaceAll("_", " ").toUpperCase()}
                        />
                      ))}
                    </td>
                    <td>
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={
                          disabled ||
                          loading ||
                          result.status === "too_many" ||
                          (context === "count" &&
                            (!match.line_id || !match.line_page)) ||
                          Boolean(productId && match.product_id !== productId)
                        }
                        onClick={() => choose(match)}
                      >
                        {result.status === "too_many"
                          ? "Resolve identifiers"
                          : context === "count" &&
                              (!match.line_id || !match.line_page)
                            ? "Select line manually"
                            : productId && match.product_id !== productId
                              ? "Different product"
                              : "Select match"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      {result && (result.page_count ?? 1) > 1 && (
        <nav
          className="inventory-pagination"
          aria-label="Scan match pagination"
        >
          <Button
            variant="outlined"
            disabled={disabled || loading || (result.page ?? 1) === 1}
            onClick={() => void lookup((result.page ?? 1) - 1)}
          >
            Previous matches
          </Button>
          <span>
            Page {result.page ?? 1} of {result.page_count ?? 1}
          </span>
          <Button
            variant="outlined"
            disabled={
              disabled ||
              loading ||
              (result.page ?? 1) === (result.page_count ?? 1)
            }
            onClick={() => void lookup((result.page ?? 1) + 1)}
          >
            Next matches
          </Button>
        </nav>
      )}
    </div>
  );
}
