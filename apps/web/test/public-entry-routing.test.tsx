import { renderToReadableStream } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../src/App";

afterEach(() => vi.unstubAllGlobals());

async function renderPath(pathname: string) {
  vi.stubGlobal("window", {
    location: { pathname, origin: "http://localhost:3344", search: "" },
    sessionStorage: { getItem: () => null },
  });
  const stream = await renderToReadableStream(<App />);
  await stream.allReady;
  return new Response(stream).text();
}

it("sends public root to the existing marketing home", async () => {
  const html = await renderPath("/");
  expect(html).toContain('aria-label="Meta Clinic home"');
  expect(html).toContain('href="/login"');
  expect(html).toContain("Run your clinic");
  expect(html).not.toContain("Development tools");
  expect(html).not.toContain("Launch &amp; onboarding");
});

it.each(["/demo", "/demo/"])(
  "%s starts with one branded demo entry and preserves the sign-in link",
  async (pathname) => {
    const html = await renderPath(pathname);
    expect(html).toContain("Step inside a");
    expect(html).toContain("Getting the clinic ready");
    expect(html).toContain('role="status"');
    expect(html).toContain("nightly refresh is scheduled");
    expect(html).toContain('href="/login"');
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html.match(/<header\b/g)).toHaveLength(1);
    expect(html.match(/<footer\b/g)).toHaveLength(1);
  },
);
