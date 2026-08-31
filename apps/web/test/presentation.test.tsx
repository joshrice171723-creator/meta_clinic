import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Home } from "../src/features/launch/Home";
import { Contact } from "../src/features/launch/Contact";
import { Field, ErrorMessage } from "../src/shared/ui";

describe("frontend responsibility", () => {
  it("preserves selling content and six FAQs without a signup or unsupported offer", () => {
    const html = renderToStaticMarkup(<Home />);
    expect(html).toContain("Your own clinic.");
    expect(html).toContain("NPs &amp; PAs");
    expect(html.match(/<details>/g)).toHaveLength(6);
    expect(html).not.toContain("/signup");
    expect(html).not.toContain("opened the doors");
  });
  it("keeps contact payload scopes and sensitive-information warning", () => {
    const html = renderToStaticMarkup(<Contact />);
    for (const field of ["name", "email", "message", "website"])
      expect(html).toContain('name="contact_message[' + field + ']"');
    expect(html).toContain("Do not send patient information");
    expect(html).toContain("no email notification is sent yet");
  });
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
    function sources(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? sources(resolve(dir, e.name))
          : /\.tsx?$/.test(e.name)
            ? [readFileSync(resolve(dir, e.name), "utf8")]
            : [],
      );
    }
    for (const source of sources(resolve("src"))) {
      expect(source).not.toMatch(
        /localStorage|sessionStorage|indexedDB|dangerouslySetInnerHTML|serviceWorker\.register|from ['"].*apps\/api/,
      );
    }
  });
});
