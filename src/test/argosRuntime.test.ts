import assert from "node:assert/strict";
import test from "node:test";
import { currentVsCodeTarget, resolveArgosRuntime } from "../argosRuntime";

test("maps supported Node platforms to VS Code targets", () => {
  assert.equal(currentVsCodeTarget("darwin", "arm64"), "darwin-arm64");
  assert.equal(currentVsCodeTarget("darwin", "x64"), "darwin-x64");
  assert.equal(currentVsCodeTarget("linux", "arm64"), "linux-arm64");
  assert.equal(currentVsCodeTarget("linux", "x64"), "linux-x64");
  assert.equal(currentVsCodeTarget("win32", "x64"), "win32-x64");
  assert.equal(currentVsCodeTarget("win32", "arm64"), "win32-arm64");
  assert.equal(currentVsCodeTarget("freebsd", "x64"), undefined);
  assert.equal(currentVsCodeTarget("linux", "ia32"), undefined);
});

test("a configured Argos path overrides the bundled runtime", () => {
  const runtime = resolveArgosRuntime(
    { fsPath: "/missing-extension" } as never,
    { fsPath: "/missing-storage" } as never,
    "/custom/argos",
  );

  assert.deepEqual(runtime, { executable: "/custom/argos", environment: {} });
});
