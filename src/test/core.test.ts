import assert from "node:assert/strict";
import test from "node:test";
import {
  centralizedNativePath,
  decideDirection,
  directionAllowed,
  englishDirectoryForCentralizedNative,
  pairStateKey,
  replaceLanguagePlaceholders,
  stripWrappingFence,
} from "../core";

const state = {
  englishHash: "old-en",
  nativeHash: "old-native",
  synchronizedAt: "2026-01-01T00:00:00.000Z",
};

test("one-way modes require their authoritative source", () => {
  assert.equal(decideDirection({
    mode: "nativeToEnglish",
    nativeHash: "native",
  }), "nativeToEnglish");
  assert.equal(decideDirection({
    mode: "englishToNative",
    nativeHash: "native",
  }), "incomplete");
});

test("bidirectional mode follows the only changed side", () => {
  assert.equal(decideDirection({
    mode: "bidirectional",
    state,
    englishHash: "new-en",
    nativeHash: "old-native",
  }), "englishToNative");
  assert.equal(decideDirection({
    mode: "bidirectional",
    state,
    englishHash: "old-en",
    nativeHash: "new-native",
  }), "nativeToEnglish");
});

test("bidirectional mode reports concurrent changes", () => {
  assert.equal(decideDirection({
    mode: "bidirectional",
    state,
    englishHash: "new-en",
    nativeHash: "new-native",
  }), "conflict");
});

test("first-run bidirectional pairs establish a baseline without translation", () => {
  assert.equal(decideDirection({
    mode: "bidirectional",
    englishHash: "en",
    nativeHash: "native",
  }), "baseline");
});

test("direction checks and CLI placeholders are deterministic", () => {
  assert.equal(directionAllowed("bidirectional", "englishToNative"), true);
  assert.equal(directionAllowed("nativeToEnglish", "englishToNative"), false);
  assert.deepEqual(
    replaceLanguagePlaceholders(["--from={sourceLanguage}", "--to={targetLanguage}"], "ja", "en"),
    ["--from=ja", "--to=en"],
  );
});

test("only a single wrapping Markdown fence is removed", () => {
  assert.equal(stripWrappingFence("```markdown\n# Hello\n```"), "# Hello");
  assert.equal(stripWrappingFence("Text with `code`"), "Text with `code`");
});

test("state keys are portable workspace-relative paths including nested skills", () => {
  assert.equal(
    pairStateKey(
      "/workspace/project",
      "/workspace/project/skills/reviewer/SKILL.md",
      "/workspace/project/skills/reviewer/NATIVE.md",
    ),
    "skills/reviewer/SKILL.md\0skills/reviewer/NATIVE.md",
  );
});

test("centralized native paths preserve the English file hierarchy", () => {
  assert.equal(
    centralizedNativePath(
      "/workspace/project",
      ".agent-instructions-translator",
      "/workspace/project/skills/reviewer/SKILL.md",
      "NATIVE.md",
    ),
    "/workspace/project/.agent-instructions-translator/native/skills/reviewer/NATIVE.md",
  );
  assert.equal(
    englishDirectoryForCentralizedNative(
      "/workspace/project",
      ".agent-instructions-translator",
      "/workspace/project/.agent-instructions-translator/native/skills/reviewer/NATIVE.md",
    ),
    "/workspace/project/skills/reviewer",
  );
});
