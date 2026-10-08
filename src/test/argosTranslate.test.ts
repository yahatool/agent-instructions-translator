import assert from "node:assert/strict";
import test from "node:test";
import type * as vscode from "vscode";
import { ArgosTranslateTranslator } from "../translators/argosTranslate";

const token = {
  isCancellationRequested: false,
  onCancellationRequested: () => ({ dispose: () => undefined }),
} as unknown as vscode.CancellationToken;

test("Argos provider sends content on stdin and expands language placeholders", async () => {
  const script = [
    "let input = '';",
    "process.stdin.setEncoding('utf8');",
    "process.stdin.on('data', chunk => input += chunk);",
    "process.stdin.on('end', () => process.stdout.write(`${process.argv[1]}:${process.argv[2]}:${input}`));",
  ].join("");
  const translator = new ArgosTranslateTranslator(process.execPath, [
    "-e",
    script,
    "{sourceLanguage}",
    "{targetLanguage}",
  ]);

  const result = await translator.translate({
    text: "# 見出し\n",
    sourceLanguage: "ja",
    targetLanguage: "en",
    token,
  });

  assert.equal(result, "ja:en:# 見出し\n");
});
