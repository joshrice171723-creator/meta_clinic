import { describe, expect, it } from "vitest";
import {
  workforceBooleanSelectValue,
  workforceEnumSelectValue,
} from "../src/features/workforce/WorkforceSettingsPage";

describe("workforce setting select values", () => {
  it("uses values accepted by each scope's setting contract", () => {
    expect(workforceBooleanSelectValue(null, false)).toBe("");
    expect(workforceBooleanSelectValue(null, true)).toBe("inherit");
    expect(workforceBooleanSelectValue(false, false)).toBe("false");
    expect(workforceBooleanSelectValue(true, true)).toBe("true");
    expect(workforceEnumSelectValue(null, false)).toBe("unconfigured");
    expect(workforceEnumSelectValue(null, true)).toBe("inherit");
  });
});
