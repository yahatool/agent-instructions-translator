import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

// Explicit paths work on Windows too, where the shell does not expand globs.
const tests = readdirSync("out/test")
  .filter((name) => name.endsWith(".test.js"))
  .sort()
  .map((name) => path.join("out/test", name));
if (!tests.length) throw new Error("No compiled tests found.");
const result = spawnSync(process.execPath, ["--test", ...tests], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
