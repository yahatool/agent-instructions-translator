import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const mode = process.env.MARKETPLACE_AUTH_MODE ?? "pat";
if (!["pat", "entra"].includes(mode)) throw new Error("MARKETPLACE_AUTH_MODE must be pat or entra.");
if (process.env.ARGOS_MODEL_REDISTRIBUTION_CONFIRMED !== "true") {
  throw new Error("Confirm bundled model redistribution rights, then set ARGOS_MODEL_REDISTRIBUTION_CONFIRMED=true in the marketplace environment.");
}
if (process.argv.includes("--check")) {
  if (mode === "pat" && !process.env.VSCE_PAT) throw new Error("Set the marketplace environment secret VSCE_PAT.");
  if (mode === "entra" && (!process.env.AZURE_CLIENT_ID || !process.env.AZURE_TENANT_ID)) {
    throw new Error("Set AZURE_CLIENT_ID and AZURE_TENANT_ID in the marketplace environment.");
  }
  console.log("Marketplace publishing configuration is ready.");
} else {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  const targets = ["win32-x64", "darwin-x64", "darwin-arm64", "linux-x64", "linux-arm64"];
  const expected = targets.map((target) => `${manifest.name}-${manifest.version}-${target}.vsix`).sort();
  const actual = readdirSync("dist").filter((name) => name.endsWith(".vsix")).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Expected all five platform-specific VSIX packages for the current version.");
  }
  const environment = { ...process.env };
  if (mode === "entra") delete environment.VSCE_PAT;
  const result = spawnSync(process.execPath, [
    "node_modules/@vscode/vsce/vsce",
    "publish",
    "--packagePath", ...actual.map((name) => path.join("dist", name)),
    "--skip-duplicate",
    ...(mode === "entra" ? ["--azure-credential"] : []),
    ...(process.env.PRE_RELEASE === "true" ? ["--pre-release"] : []),
  ], { stdio: "inherit", env: environment });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
