import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { AsqInstrument } from "../src/api/contracts";
import {
  AsqAdultAssessmentFields,
  asqItems,
} from "../src/features/clinic/AsqAdultAssessmentFields";

const instrument: AsqInstrument = {
  name: "Synthetic adult ASQ",
  version: "synthetic",
  category: "psychiatry_assessment",
  source: "https://example.invalid/screening",
  protocol_version: "synthetic",
  protocol_source: "https://example.invalid/protocol",
  questions: ["q1", "q2", "q3", "q4", "q5"].map((id) => ({
    id,
    label: id,
    options: ["yes", "no"],
  })),
  dispositions: [],
};

function control(node: ReactNode, id: string): Record<string, any> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<Record<string, any>>(child)) continue;
    if (child.props.id === id) return child.props;
    const found = control(child.props.children, id);
    if (found) return found;
  }
}

it("retains current thoughts and urgent guidance when earlier answers are corrected", () => {
  let form: Record<string, string> = {
    _asq_items: JSON.stringify(
      ["q1", "q2", "q3", "q4", "q5"].map((item_id) => ({
        item_id,
        state: "answered",
        value: ["q1", "q5"].includes(item_id) ? "yes" : "no",
      })),
    ),
  };
  const render = () =>
    AsqAdultAssessmentFields({
      instrument,
      form,
      tasks: [],
      disabled: false,
      onChange: (next) => {
        form = next;
      },
    });
  control(render(), "asq-q1")!.onChange({ target: { value: "no" } });
  expect(asqItems(form).find((item) => item.item_id === "q5")).toEqual({
    item_id: "q5",
    state: "answered",
    value: "yes",
  });
  // Reconstruct the serialized draft rather than retaining old rendered props.
  form = JSON.parse(JSON.stringify(form));
  expect(control(render(), "asq-q5")?.value).toBe("yes");
  expect(renderToStaticMarkup(render())).toContain(
    "Current suicidal thoughts:",
  );
  control(render(), "asq-q5")!.onChange({ target: { value: "no" } });
  expect(asqItems(form).find((item) => item.item_id === "q5")?.value).toBe(
    "no",
  );
  expect(renderToStaticMarkup(render())).not.toContain(
    "Current suicidal thoughts:",
  );
});
