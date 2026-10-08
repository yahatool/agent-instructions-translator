import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("enabled is disabled by default and supports folder-scoped overrides", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
    contributes: {
      configuration: {
        properties: Record<string, { default?: unknown; scope?: string }>;
      };
    };
  };
  const enabled = manifest.contributes.configuration.properties["agentInstructionsTranslator.enabled"];

  assert.equal(enabled?.default, false);
  assert.equal(enabled?.scope, "resource");
});

test("bundled Argos is the default translation provider", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
    contributes: {
      configuration: {
        properties: Record<string, { default?: unknown; enum?: string[] }>;
      };
    };
  };
  const provider = manifest.contributes.configuration.properties["agentInstructionsTranslator.provider"];

  assert.equal(provider?.default, "argosTranslate");
  assert.deepEqual(provider?.enum, ["argosTranslate", "deeplCli", "vscodeLm"]);
});

test("the unsafe first-run conflict resolution setting is not exposed", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
    contributes: { configuration: { properties: Record<string, unknown> } };
  };

  assert.equal(
    manifest.contributes.configuration.properties["agentInstructionsTranslator.initialConflictResolution"],
    undefined,
  );
});

test("default discovery excludes local build output and sync metadata", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
    contributes: {
      configuration: {
        properties: Record<string, { default?: unknown }>;
      };
    };
  };

  assert.equal(
    manifest.contributes.configuration.properties["agentInstructionsTranslator.exclude"]?.default,
    "**/{node_modules,.git,.build,.agent-instructions-translator}/**",
  );
});

test("centralized native storage is the default output layout", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
    contributes: {
      configuration: {
        properties: Record<string, { default?: unknown; enum?: string[] }>;
      };
    };
  };
  const layout = manifest.contributes.configuration.properties["agentInstructionsTranslator.outputLayout"];

  assert.equal(layout?.default, "centralizedNative");
  assert.deepEqual(layout?.enum, ["centralizedNative", "alongside", "hiddenMirror"]);
});

test("Git tracks centralized native sources and state while ignoring other local data", () => {
  const ignore = readFileSync(".gitignore", "utf8");

  assert.match(ignore, /^\.agent-instructions-translator\/\*$/m);
  assert.match(ignore, /^!\.agent-instructions-translator\/state\.json$/m);
  assert.match(ignore, /^!\.agent-instructions-translator\/native\/$/m);
  assert.match(ignore, /^!\.agent-instructions-translator\/native\/\*\*$/m);
});
