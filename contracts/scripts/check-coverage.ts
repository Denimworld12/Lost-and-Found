import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Fails unless every line of the contracts below is covered.
// Hardhat 3's coverage reports lines and statements; see docs/report/coverage.md for branches.
const REQUIRED = ["contracts/LostAndFound.sol"];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lcov = await readFile(path.join(root, "coverage/lcov.info"), "utf8");

const results = new Map<string, { found: number; hit: number }>();
let entry: { found: number; hit: number } | undefined;
for (const line of lcov.split("\n")) {
  if (line.startsWith("SF:")) {
    entry = { found: 0, hit: 0 };
    results.set(line.slice(3), entry);
  } else if (entry && line.startsWith("LF:"))
    entry.found = Number(line.slice(3));
  else if (entry && line.startsWith("LH:")) entry.hit = Number(line.slice(3));
}

let failed = false;
for (const name of REQUIRED) {
  const entry = results.get(name);
  if (!entry) {
    console.error(`${name}: no coverage data`);
    failed = true;
    continue;
  }
  const pct = entry.found === 0 ? 100 : (entry.hit / entry.found) * 100;
  console.log(
    `${name}: ${entry.hit}/${entry.found} lines (${pct.toFixed(2)}%)`,
  );
  if (entry.hit !== entry.found) failed = true;
}

if (failed) {
  console.error("Line coverage below 100%.");
  process.exitCode = 1;
}
