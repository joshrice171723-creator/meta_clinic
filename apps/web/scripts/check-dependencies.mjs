import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
);
const missing = Object.keys({
  ...manifest.dependencies,
  ...manifest.devDependencies,
}).filter(
  (name) => !existsSync(resolve(root, "node_modules", name, "package.json")),
);
if (missing.length) {
  console.error(`Missing locked dependencies: ${missing.join(", ")}`);
  process.exitCode = 1;
}
