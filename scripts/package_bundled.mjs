import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const platformNames = { darwin: "darwin", linux: "linux", win32: "win32" };
const architectureNames = { arm64: "arm64", x64: "x64" };
const platform = platformNames[process.platform];
const architecture = architectureNames[process.arch];

if (!platform || !architecture) {
  throw new Error(`Unsupported VSIX build host: ${process.platform}/${process.arch}`);
}

const target = `${platform}-${architecture}`;
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
// GitHub knows the repository even when the local development manifest does not.
if (!manifest.repository && process.env.GITHUB_REPOSITORY) {
  manifest.repository = {
    type: "git",
    url: `https://github.com/${process.env.GITHUB_REPOSITORY}.git`,
  };
  writeFileSync("package.json", `${JSON.stringify(manifest, null, 2)}\n`);
}
const runtime = path.join("resources", "argos", target, "runtime",
  platform === "win32" ? "argos-runtime.exe" : "argos-runtime");
if (!existsSync(runtime)) throw new Error(`Build the bundled Argos runtime for ${target} first.`);
mkdirSync("dist", { recursive: true });
const result = spawnSync(
  process.execPath,
  [
    "node_modules/@vscode/vsce/vsce",
    "package",
    "--no-dependencies",
    "--target",
    target,
    "--ignore-other-target-folders",
    "--out",
    path.join("dist", `${manifest.name}-${manifest.version}-${target}.vsix`),
    ...(process.argv.includes("--pre-release") ? ["--pre-release"] : []),
  ],
  { stdio: "inherit" },
);

if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
