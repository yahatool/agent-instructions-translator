import type { TranslationRequest, Translator } from "./types";

interface FrontmatterDocument {
  readonly opening: string;
  readonly content: string;
  readonly closing: string;
  readonly body: string;
}

const frontmatterPattern = /^(---[ \t]*\r?\n)([\s\S]*?)(^(?:---|\.\.\.)[ \t]*(?:\r?\n|$))/m;
const yamlKeyValuePattern = /^(\s*[^#\s][^:]*:[ \t]*)(.*)$/;
const blockScalarPattern = /^[>|][+-]?(?:[1-9])?$/;
const protectedKeys = new Set([
  "argument-hint",
  "author",
  "authors",
  "homepage",
  "id",
  "license",
  "publisher",
  "repository",
  "slug",
  "url",
  "version",
]);

export async function translateMarkdownDocument(
  translator: Translator,
  request: TranslationRequest,
): Promise<string> {
  const parsed = parseFrontmatter(request.text);
  if (!parsed) return translateMarkdownBody(translator, request, request.text);

  const translatedFrontmatter = await translateFrontmatterContent(
    translator,
    request,
    parsed.content,
  );
  const translatedBody = await translateMarkdownBody(translator, request, parsed.body);
  return `${parsed.opening}${translatedFrontmatter}${parsed.closing}${translatedBody}`;
}

async function translateMarkdownBody(
  translator: Translator,
  request: TranslationRequest,
  body: string,
): Promise<string> {
  if (!body.trim()) return body;
  const lines = body.match(/[^\r\n]*(?:\r\n|\n|$)/g)?.filter((line) => line.length > 0) ?? [];
  const output: string[] = [];
  let prose = "";
  let fence = "";
  let fenced = "";

  const flushProse = async (): Promise<void> => {
    if (!prose) return;
    output.push(await translatePreservingOuterWhitespace(translator, request, prose));
    prose = "";
  };

  for (const line of lines) {
    if (!fence) {
      const opening = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (!opening?.[1]) {
        prose += line;
        continue;
      }
      await flushProse();
      fence = opening[1];
      fenced = line;
      continue;
    }

    fenced += line;
    const closingPattern = new RegExp(`^ {0,3}${escapeRegExp(fence[0] ?? "")}{${fence.length},}[ \\t]*(?:\\r?\\n|$)`);
    if (closingPattern.test(line)) {
      output.push(fenced);
      fence = "";
      fenced = "";
    }
  }
  if (fenced) output.push(fenced);
  await flushProse();
  return output.join("");
}

async function translatePreservingOuterWhitespace(
  translator: Translator,
  request: TranslationRequest,
  text: string,
): Promise<string> {
  if (!text.trim()) return text;
  const leading = text.match(/^\s*/)?.[0] ?? "";
  const trailing = text.match(/\s*$/)?.[0] ?? "";
  const content = text.slice(leading.length, text.length - trailing.length);
  const result = await translator.translate({ ...request, text: content });
  return `${leading}${result.trim()}${trailing}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseFrontmatter(text: string): FrontmatterDocument | undefined {
  const match = frontmatterPattern.exec(text);
  if (!match || match.index !== 0) return undefined;
  const [whole, opening, content, closing] = match;
  if (whole === undefined || opening === undefined || content === undefined || closing === undefined) {
    return undefined;
  }
  return { opening, content, closing, body: text.slice(whole.length) };
}

async function translateFrontmatterContent(
  translator: Translator,
  request: TranslationRequest,
  content: string,
): Promise<string> {
  const records = content.match(/[^\r\n]*(?:\r\n|\n|$)/g)?.filter((line) => line.length > 0) ?? [];
  const translated: string[] = [];
  for (const record of records) {
    const ending = record.endsWith("\r\n") ? "\r\n" : record.endsWith("\n") ? "\n" : "";
    const line = ending ? record.slice(0, -ending.length) : record;
    translated.push(await translateFrontmatterLine(translator, request, line) + ending);
  }
  return translated.join("");
}

async function translateFrontmatterLine(
  translator: Translator,
  request: TranslationRequest,
  line: string,
): Promise<string> {
  const match = yamlKeyValuePattern.exec(line);
  if (!match) return line;
  const prefix = match[1];
  const rawValue = match[2];
  if (prefix === undefined || rawValue === undefined || !rawValue.trim()) return line;

  const commentMatch = rawValue.match(/^(.*?)([ \t]+#.*)$/);
  const valueWithSpacing = commentMatch?.[1] ?? rawValue;
  const comment = commentMatch?.[2] ?? "";
  const leading = valueWithSpacing.match(/^\s*/)?.[0] ?? "";
  const trailing = valueWithSpacing.match(/\s*$/)?.[0] ?? "";
  let value = valueWithSpacing.slice(leading.length, valueWithSpacing.length - trailing.length);
  if (!value || blockScalarPattern.test(value)) return line;

  let quote = "";
  if ((value.startsWith("\"") && value.endsWith("\""))
    || (value.startsWith("'") && value.endsWith("'"))) {
    quote = value[0] ?? "";
    value = value.slice(1, -1);
  }
  if (!value) return line;
  const key = prefix.slice(0, prefix.lastIndexOf(":")).trim().replace(/^["']|["']$/g, "");
  if (!shouldTranslateScalar(key, value)) return line;

  const result = await translator.translate({ ...request, text: value });
  const translatedValue = result.trim();
  return `${prefix}${leading}${quote}${translatedValue}${quote}${trailing}${comment}`;
}

function shouldTranslateScalar(key: string, value: string): boolean {
  if (protectedKeys.has(key.toLowerCase())) return false;
  if (/^(?:true|false|null|yes|no|on|off|~)$/i.test(value)) return false;
  if (/^[vV]?\d+(?:\.\d+)*(?:[-+][A-Za-z0-9.-]+)?$/.test(value)) return false;
  if (/^\d{4}-\d{2}-\d{2}(?:[T ][^\s]+)?$/.test(value)) return false;
  if (/^(?:https?:\/\/|mailto:|urn:)/i.test(value)) return false;
  if (/^<[^<>]+>$/.test(value) || /^\$?\{[^{}]+\}$/.test(value)) return false;
  if (/^[\[{].*[\]}]$/.test(value)) return false;
  if (!/\s/.test(value) && /[\\/@$]/.test(value)) return false;
  return true;
}
