import { describe, expect, it } from "vitest";
import { visibleRegistrationDialogInsets } from "../src/features/clinic/registrationDialogViewport";

function embedded(top: number, height = 900, hostHeight = 757, scale = 1) {
  return {
    innerHeight: height,
    frameElement: {
      offsetHeight: height,
      clientTop: 0,
      getBoundingClientRect: () => ({ top, height: height * scale }),
      ownerDocument: { defaultView: { innerHeight: hostHeight } },
    },
  } as unknown as Window;
}

describe("registration dialog visible embedding", () => {
  it("keeps a 900px frame's footer inside the watched 757px host", () => {
    expect(visibleRegistrationDialogInsets(embedded(100))).toEqual({
      top: 0,
      bottom: 243,
    });
  });
  it("accounts for a host scrolled past the top of the frame", () => {
    expect(visibleRegistrationDialogInsets(embedded(-100))).toEqual({
      top: 100,
      bottom: 43,
    });
  });
  it("translates a scaled iframe into local CSS pixels", () => {
    expect(
      visibleRegistrationDialogInsets(embedded(100, 900, 757, 0.5)),
    ).toEqual({
      top: 0,
      bottom: 0,
    });
  });
  it("retains normal MUI containment outside an iframe", () => {
    expect(
      visibleRegistrationDialogInsets({
        frameElement: null,
      } as unknown as Window),
    ).toBeNull();
  });
  it("does not reach across a cross-origin embedding", () => {
    const view = {
      get frameElement() {
        throw new Error("cross-origin");
      },
    };
    expect(
      visibleRegistrationDialogInsets(view as unknown as Window),
    ).toBeNull();
  });
  it("rejects an invisible or zero-scale frame", () => {
    expect(visibleRegistrationDialogInsets(embedded(800))).toBeNull();
    expect(
      visibleRegistrationDialogInsets(embedded(0, 900, 757, 0)),
    ).toBeNull();
  });
});
