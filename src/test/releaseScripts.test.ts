import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const manifest = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };

function runScript(script: string, environment: NodeJS.ProcessEnv, args: string[] = []) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, GITHUB_OUTPUT: "", ...environment },
  });
}

test("publishing accepts only the version tag for the selected channel", () => {
  for (const preRelease of [false, true]) {
    const result = runScript("scripts/validate_release.mjs", {
      WILL_PUBLISH: "true",
      PRE_RELEASE: String(preRelease),
      RELEASE_TAG: `v${manifest.version}${preRelease ? "-pre" : ""}`,
    });
    assert.equal(result.status, 0, result.stderr);
  }
});

test("publishing rejects a branch, mismatched version, or wrong channel", () => {
  for (const tag of ["main", "v999.999.999", `v${manifest.version}-pre`]) {
    const result = runScript("scripts/validate_release.mjs", {
      WILL_PUBLISH: "true",
      PRE_RELEASE: "false",
      RELEASE_TAG: tag,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Select\/push tag/);
  }
});

test("build-only runs do not require a tag", () => {
  const result = runScript("scripts/validate_release.mjs", {
    WILL_PUBLISH: "false", PRE_RELEASE: "false", RELEASE_TAG: "",
  });
  assert.equal(result.status, 0, result.stderr);
});

test("publication requires model redistribution confirmation before credentials", () => {
  const result = runScript("scripts/publish_vsix.mjs", {
    MARKETPLACE_AUTH_MODE: "pat",
    ARGOS_MODEL_REDISTRIBUTION_CONFIRMED: "",
    VSCE_PAT: "",
  }, ["--check"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Confirm bundled model redistribution rights/);
});

test("PAT mode fails when its environment secret is absent", () => {
  const result = runScript("scripts/publish_vsix.mjs", {
    MARKETPLACE_AUTH_MODE: "pat",
    ARGOS_MODEL_REDISTRIBUTION_CONFIRMED: "true",
    VSCE_PAT: "",
  }, ["--check"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /environment secret VSCE_PAT/);
});

test("Entra mode requires client and tenant IDs without a PAT", () => {
  const environment = {
    MARKETPLACE_AUTH_MODE: "entra",
    ARGOS_MODEL_REDISTRIBUTION_CONFIRMED: "true",
    AZURE_CLIENT_ID: "",
    AZURE_TENANT_ID: "",
    VSCE_PAT: "",
  };
  const missing = runScript("scripts/publish_vsix.mjs", environment, ["--check"]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /AZURE_CLIENT_ID and AZURE_TENANT_ID/);
  const configured = runScript("scripts/publish_vsix.mjs", {
    ...environment, AZURE_CLIENT_ID: "test-client", AZURE_TENANT_ID: "test-tenant",
  }, ["--check"]);
  assert.equal(configured.status, 0, configured.stderr);
});
