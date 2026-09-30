// Reuse the Atlas's existing parsers; print a derived snapshot, never a second authority.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const atlasPath =
  "records/implementation/2026-09-27-meta-clinic-tracker-atlas.html";
const html = fs.readFileSync(path.join(root, atlasPath), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!script?.includes("function parseTracker"))
  throw new Error("Atlas parsers missing");
const context = vm.createContext({
  document: { getElementById: () => ({ addEventListener() {} }) },
});
vm.runInContext(
  script.slice(
    0,
    script.indexOf(
      "document.getElementById('refresh-source').addEventListener",
    ),
  ),
  context,
);
const sources = vm.runInContext("files", context);
context.loaded = Object.fromEntries(
  Object.entries(sources).map(([key, source]) => [
    key,
    fs.readFileSync(path.join(root, source), "utf8"),
  ]),
);
const inventory = vm.runInContext(
  `(() => {
  const parsed = parseTracker(loaded.tracker);
  return [...parsed.core, ...parseIntake(loaded.intake), ...parsed.bh, ...parsed.pr,
    ...parseHardening(loaded.hardening), ...parseJourney(loaded.journey),
    parsed.sandbox, ...parseSandbox(loaded.sandbox)];
})()`,
  context,
);
if (
  inventory.length !== 81 ||
  new Set(inventory.map((row) => row.code)).size !== 81
)
  throw new Error("Expected 81 unique current Atlas inventory rows");
const core = JSON.parse(
  execFileSync(
    "ruby",
    [
      "-r",
      "./apps/api/app/services/qa/atlas",
      "-e",
      "puts JSON.generate(Qa::Atlas.parse(File.read(Qa::Atlas::SOURCE)))",
    ],
    { cwd: root, encoding: "utf8" },
  ),
);
const source_digests = Object.fromEntries(
  [...Object.values(sources), atlasPath].map((source) => [
    source,
    createHash("sha256")
      .update(
        fs
          .readFileSync(path.join(root, source), "utf8")
          .replaceAll("\r\n", "\n"),
      )
      .digest("hex"),
  ]),
);
process.stdout.write(
  JSON.stringify({ ...core, inventory, source_digests }, null, 2) + "\n",
);
