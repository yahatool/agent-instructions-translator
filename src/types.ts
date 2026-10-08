import type * as vscode from "vscode";

export type SyncMode = "nativeToEnglish" | "englishToNative" | "bidirectional";
export type ProviderKind = "vscodeLm" | "deeplCli" | "argosTranslate";
export type OutputLayout = "centralizedNative" | "alongside" | "hiddenMirror";

export interface Settings {
  readonly enabled: boolean;
  readonly mode: SyncMode;
  readonly provider: ProviderKind;
  readonly nativeLanguage: string;
  readonly englishLanguage: string;
  readonly englishFileNames: readonly string[];
  readonly nativeFileName: string;
  readonly defaultEnglishFileName: string;
  readonly exclude: string;
  readonly outputLayout: OutputLayout;
  readonly stateDirectory: string;
  readonly vscodeLmVendor: string;
  readonly vscodeLmFamily: string;
  readonly deeplCliPath: string;
  readonly deeplCliArgs: readonly string[];
  readonly argosTranslatePath: string;
  readonly argosTranslateArgs: readonly string[];
}

export interface FilePair {
  readonly workspaceFolder: vscode.WorkspaceFolder;
  readonly english: vscode.Uri;
  readonly native: vscode.Uri;
}

export type Direction = "nativeToEnglish" | "englishToNative";

export interface TranslationRequest {
  readonly text: string;
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  readonly token: vscode.CancellationToken;
}

export interface Translator {
  translate(request: TranslationRequest): Promise<string>;
}

export interface PairState {
  readonly englishHash: string;
  readonly nativeHash: string;
  readonly synchronizedAt: string;
}

export interface PersistedState {
  readonly version: 2;
  readonly pairs: Record<string, PairState>;
}
