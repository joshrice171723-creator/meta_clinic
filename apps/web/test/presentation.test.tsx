import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Field, ErrorMessage } from "../src/shared/ui";

describe("frontend responsibility", () => {
  it("escapes dynamic content and labels controls without inline event handlers", () => {
    const html = renderToStaticMarkup(
      <>
        <ErrorMessage message="<script>synthetic</script>" />
        <Field name="reason" label="Reason" />
      </>,
    );
    expect(html).toContain("&lt;script&gt;synthetic&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain('for="');
    expect(html).toContain('required=""');
  });
  it("has no backend imports, persistent record storage, unsafe HTML or service worker", () => {
    function sources(dir: string): { path: string; content: string }[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? sources(resolve(dir, e.name))
          : /\.tsx?$/.test(e.name)
            ? [
                {
                  path: resolve(dir, e.name),
                  content: readFileSync(resolve(dir, e.name), "utf8"),
                },
              ]
            : [],
      );
    }
    for (const source of sources(resolve("src"))) {
      const isTrackingBoard = source.path.endsWith("TrackingBoardPage.tsx");
      const storageReferences = source.content.match(/localStorage/g) ?? [];
      expect(storageReferences).toHaveLength(isTrackingBoard ? 2 : 0);
      if (isTrackingBoard)
        expect(source.content).toContain(
          'const trackingBoardColumnsStorageKey = "apply.tracking-board.columns.v2"',
        );
      const sessionReferences = source.content.match(/sessionStorage/g) ?? [];
      expect(sessionReferences).toHaveLength(
        source.path.endsWith("DemoJourney.tsx") ? 2 : 0,
      );
      if (sessionReferences.length) {
        expect(source.content).toContain(
          "sessionStorage.setItem(sandboxDurationKey, String(duration))",
        );
        expect(source.content).toContain(
          "sessionStorage.getItem(sandboxDurationKey)",
        );
      }
      expect(source.content).not.toMatch(
        /indexedDB|dangerouslySetInnerHTML|serviceWorker\.register|from ['"].*apps\/api/,
      );
    }
  });
  it("acknowledges save only after the owner-specific response is accepted", () => {
    const source = readFileSync("src/shared/ui.tsx", "utf8");
    expect(source.indexOf("onSuccess?.(result)")).toBeLessThan(
      source.indexOf('setNotice("Saved.")'),
    );
  });
});
