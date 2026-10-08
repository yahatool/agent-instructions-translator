import assert from "node:assert/strict";
import test from "node:test";
import type * as vscode from "vscode";
import { translateMarkdownDocument } from "../markdownTranslation";
import type { TranslationRequest, Translator } from "../types";

const token = {
  isCancellationRequested: false,
  onCancellationRequested: () => ({ dispose: () => undefined }),
} as unknown as vscode.CancellationToken;

class RecordingTranslator implements Translator {
  public readonly inputs: string[] = [];

  public async translate(request: TranslationRequest): Promise<string> {
    this.inputs.push(request.text);
    return `訳(${request.text})`;
  }
}

test("frontmatter translates only scalar values and preserves YAML structure", async () => {
  const translator = new RecordingTranslator();
  const source = [
    "---",
    "name: Writing Guidelines",
    "description: \"Review docs for compliance\" # keep this comment",
    "version: '1.0.0'",
    "metadata:",
    "  author: vercel",
    "  argument-hint: <file-or-pattern>",
    "---",
    "# Writing Guidelines",
    "",
    "Review the selected files.",
  ].join("\n");

  const result = await translateMarkdownDocument(translator, {
    text: source,
    sourceLanguage: "en",
    targetLanguage: "ja",
    token,
  });

  assert.equal(result, [
    "---",
    "name: 訳(Writing Guidelines)",
    "description: \"訳(Review docs for compliance)\" # keep this comment",
    "version: '1.0.0'",
    "metadata:",
    "  author: vercel",
    "  argument-hint: <file-or-pattern>",
    "---",
    "訳(# Writing Guidelines\n\nReview the selected files.)",
  ].join("\n"));
  assert.deepEqual(translator.inputs, [
    "Writing Guidelines",
    "Review docs for compliance",
    "# Writing Guidelines\n\nReview the selected files.",
  ]);
});

test("frontmatter delimiters and block scalar markers are never translated", async () => {
  const translator = new RecordingTranslator();
  const source = "---\r\ndescription: >\r\n  Long description\r\n---\r\n";

  const result = await translateMarkdownDocument(translator, {
    text: source,
    sourceLanguage: "en",
    targetLanguage: "ja",
    token,
  });

  assert.equal(result, source);
  assert.deepEqual(translator.inputs, []);
});

test("documents without frontmatter are translated in one request", async () => {
  const translator = new RecordingTranslator();
  const source = "# Heading\n\nBody";

  const result = await translateMarkdownDocument(translator, {
    text: source,
    sourceLanguage: "en",
    targetLanguage: "ja",
    token,
  });

  assert.equal(result, `訳(${source})`);
  assert.deepEqual(translator.inputs, [source]);
});

test("fenced code blocks are preserved while surrounding Markdown is translated", async () => {
  const translator = new RecordingTranslator();
  const source = [
    "---",
    "name: Writing Guidelines",
    "---",
    "",
    "Read this page.",
    "",
    "```text",
    "https://example.com/docs",
    "name: This is code, not frontmatter",
    "```",
    "",
    "Then continue.",
  ].join("\n");

  const result = await translateMarkdownDocument(translator, {
    text: source,
    sourceLanguage: "en",
    targetLanguage: "ja",
    token,
  });

  assert.equal(result, [
    "---",
    "name: 訳(Writing Guidelines)",
    "---",
    "",
    "訳(Read this page.)",
    "",
    "```text",
    "https://example.com/docs",
    "name: This is code, not frontmatter",
    "```",
    "",
    "訳(Then continue.)",
  ].join("\n"));
  assert.deepEqual(translator.inputs, [
    "Writing Guidelines",
    "Read this page.",
    "Then continue.",
  ]);
});

test("fenced code blocks are also preserved without frontmatter", async () => {
  const translator = new RecordingTranslator();
  const source = "Before\n\n~~~sh\necho hello\n~~~\n\nAfter";

  const result = await translateMarkdownDocument(translator, {
    text: source,
    sourceLanguage: "en",
    targetLanguage: "ja",
    token,
  });

  assert.equal(result, "訳(Before)\n\n~~~sh\necho hello\n~~~\n\n訳(After)");
  assert.deepEqual(translator.inputs, ["Before", "After"]);
});
