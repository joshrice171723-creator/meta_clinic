import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BookingPatientPicker } from "../src/features/clinic/BookingPatientPicker";
import type { Patient } from "../src/api/contracts";

const patient: Patient = {
  id: 801,
  display_name: "Avery Example",
  reference: "TEST-801",
  date_of_birth: "1990-02-03",
};
const props = () => ({
  patient,
  editing: false,
  query: "",
  results: [],
  loading: false,
  disabled: false,
  canReviewPatient: true,
  onEditingChange: vi.fn(),
  onQueryChange: vi.fn(),
  onSelect: vi.fn(),
});

describe("booking patient identity", () => {
  it("does not expose a chart link to identity-only bookers", () => {
    const html = renderToStaticMarkup(
      <BookingPatientPicker {...props()} canReviewPatient={false} />,
    );
    expect(html).not.toContain('href="/clinic/patients/');
    expect(html).toContain("Avery Example");
  });
  it("shows the saved name and separately labeled reference without a duplicate search", () => {
    const html = renderToStaticMarkup(<BookingPatientPicker {...props()} />);
    expect(html).toContain("Avery Example");
    expect(html).toContain("Clinic reference: TEST-801");
    expect(html).toContain("1990-02-03");
    expect(html).toContain("Change patient");
    expect(html).not.toContain("Find patient");
    expect(html).not.toContain('role="combobox"');
  });
  it("shows one search when no patient has been selected", () => {
    const html = renderToStaticMarkup(
      <BookingPatientPicker {...props()} patient={undefined} />,
    );
    expect(html.match(/role="combobox"/g)).toHaveLength(1);
    expect(html).toContain("Find patient");
    expect(html).not.toContain("Change patient");
  });
  it("preserves the current identity while searching for a replacement", () => {
    const html = renderToStaticMarkup(
      <BookingPatientPicker
        {...props()}
        editing
        query="Another"
        error="Try again."
      />,
    );
    expect(html).toContain("Avery Example");
    expect(html).toContain("Keep current patient");
    expect(html).toContain("Patient search failed.");
  });
  it("cancels replacement without clearing the selected patient", () => {
    const input = { ...props(), editing: true };
    const tree = BookingPatientPicker(input);
    const search = tree.props.children[1];
    search.props.children[2].props.onClick();
    expect(input.onEditingChange).toHaveBeenCalledWith(false);
    expect(input.onQueryChange).toHaveBeenCalledWith("");
    expect(input.onSelect).not.toHaveBeenCalled();
  });
  it("selects an exact record and closes search only after selection", () => {
    const input = { ...props(), editing: true };
    const picker =
      BookingPatientPicker(input).props.children[1].props.children[0];
    const replacement = { ...patient, id: 802 };
    picker.props.onChange(null, replacement);
    expect(input.onSelect).toHaveBeenCalledWith(replacement);
    expect(input.onEditingChange).toHaveBeenCalledWith(false);
    expect(picker.props.isOptionEqualToValue(patient, replacement)).toBe(false);
  });
  it("does not invent a full name for a short recorded name", () => {
    const html = renderToStaticMarkup(
      <BookingPatientPicker
        {...props()}
        patient={{ ...patient, display_name: "R" }}
        disabled
      />,
    );
    expect(html).toContain(">R</h6>");
    expect(html).toContain('href="/clinic/patients/801"');
    expect(html).toContain("disabled");
    expect(html).not.toContain("Avery Example");
  });
});
