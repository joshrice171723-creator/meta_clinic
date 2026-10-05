export type WorkflowOption =
  | { selection_id: string; label: string }
  | { value: string | number | boolean; label: string };

export type WorkflowArrayItems = {
  type:
    "text" | "number" | "decimal" | "boolean" | "date" | "datetime" | "select";
  options?: Array<{ value: string | number | boolean; label: string }>;
};

export type WorkflowField = {
  key: string;
  label: string;
  type:
    | "text"
    | "number"
    | "decimal"
    | "boolean"
    | "date"
    | "datetime"
    | "select"
    | "record"
    | "array"
    | string;
  required: boolean;
  options?: WorkflowOption[];
  items?: WorkflowArrayItems;
  max_items?: number;
};

export type WorkflowOperation = {
  key: string;
  title: string;
  domain: string;
  description: string;
  kind: "read" | "change" | "gated";
  fields: WorkflowField[];
  availability: "available" | "gated" | "unavailable";
  reason?: string;
  source_path?: string;
  patient_required?: boolean;
  encounter_required?: boolean;
};

export type WorkflowContext = {
  context_id: string;
  expires_at: string;
  practice: { name: string };
  site: { name: string } | null;
  patient?: { name: string } | null;
  encounter?: { selected?: boolean; label?: string } | null;
};

export type WorkflowResult = {
  status: "result" | "receipt";
  title: string;
  sections: Array<{
    title?: string;
    fields?: Array<{ label: string; value: unknown }>;
    columns?: Array<{ key: string; label: string }>;
    rows?: Array<Record<string, unknown>>;
  }>;
  source_path?: string;
  receipt_id?: string | number | null;
  proposal_id?: string;
  confirmed_at?: string;
};

export type WorkflowProposal = {
  proposal_id: string;
  status: string;
  expires_at: string;
  title: string;
  preview: Array<{ label: string; value: unknown; before?: unknown }>;
  confirmation_required: true;
};

export type WorkflowMessageResult = {
  status?: "clarify" | "suggestion" | string;
  message?: string;
  clarification?: string;
  source_path?: string;
  operation?: {
    key: string;
    title?: string;
    kind?: "read" | "change";
    domain?: string;
  };
  missing_fields?: Array<{
    key: string;
    label: string;
    type: string;
    required: boolean;
  }>;
  missing_context?: Array<"patient" | "encounter">;
  inputs?: Record<
    string,
    string | number | boolean | string[] | number[] | boolean[] | null
  >;
};

export type WorkflowMode = "booking" | "workflows";

export type WorkflowInput =
  string | number | boolean | string[] | number[] | boolean[] | null;
export type WorkflowInputs = Record<string, WorkflowInput>;
