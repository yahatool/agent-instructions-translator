import { createHash } from "node:crypto";
import * as path from "node:path";
import type { Direction, PairState, SyncMode } from "./types";

export function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function pairStateKey(workspaceRoot: string, englishPath: string, nativePath: string): string {
  const relative = (filePath: string): string => path
    .relative(workspaceRoot, filePath)
    .split(path.sep)
    .join("/");
  return `${relative(englishPath)}\0${relative(nativePath)}`;
}

export function centralizedNativePath(
  workspaceRoot: string,
  stateDirectory: string,
  englishPath: string,
  nativeFileName: string,
): string {
  const relativeDirectory = path.dirname(path.relative(workspaceRoot, englishPath));
  return path.join(workspaceRoot, stateDirectory, "native", relativeDirectory, nativeFileName);
}

export function englishDirectoryForCentralizedNative(
  workspaceRoot: string,
  stateDirectory: string,
  nativePath: string,
): string {
  const nativeRoot = path.join(workspaceRoot, stateDirectory, "native");
  return path.join(workspaceRoot, path.dirname(path.relative(nativeRoot, nativePath)));
}

export function directionAllowed(mode: SyncMode, direction: Direction): boolean {
  return mode === "bidirectional" || mode === direction;
}

export interface DirectionInput {
  readonly mode: SyncMode;
  readonly state?: PairState;
  readonly englishHash?: string;
  readonly nativeHash?: string;
}

export type DirectionDecision = Direction | "baseline" | "conflict" | "unchanged" | "incomplete";

export function decideDirection(input: DirectionInput): DirectionDecision {
  const hasEnglish = input.englishHash !== undefined;
  const hasNative = input.nativeHash !== undefined;

  if (input.mode === "nativeToEnglish") return hasNative ? "nativeToEnglish" : "incomplete";
  if (input.mode === "englishToNative") return hasEnglish ? "englishToNative" : "incomplete";
  if (!hasEnglish && !hasNative) return "incomplete";
  if (!hasEnglish) return "nativeToEnglish";
  if (!hasNative) return "englishToNative";

  if (input.state) {
    const englishChanged = input.englishHash !== input.state.englishHash;
    const nativeChanged = input.nativeHash !== input.state.nativeHash;
    if (englishChanged && nativeChanged) return "conflict";
    if (englishChanged) return "englishToNative";
    if (nativeChanged) return "nativeToEnglish";
    return "unchanged";
  }

  return "baseline";
}

export function replaceLanguagePlaceholders(
  args: readonly string[],
  sourceLanguage: string,
  targetLanguage: string,
): string[] {
  return args.map((arg) => arg
    .replaceAll("{sourceLanguage}", sourceLanguage)
    .replaceAll("{targetLanguage}", targetLanguage));
}

export function stripWrappingFence(text: string): string {
  const match = text.trim().match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return match?.[1] ?? text;
}
