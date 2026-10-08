import * as path from "node:path";
import * as vscode from "vscode";
import { decideDirection, directionAllowed, hashText } from "./core";
import { translateMarkdownDocument } from "./markdownTranslation";
import { PairResolver } from "./pairResolver";
import { StateStore } from "./stateStore";
import type { Direction, FilePair, Settings, Translator } from "./types";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

interface FileSnapshot {
  readonly text: string;
  readonly hash: string;
}

export class SyncCoordinator implements vscode.Disposable {
  private readonly resolver: PairResolver;
  private readonly state: StateStore;
  private readonly subscriptions: vscode.Disposable[] = [];
  private readonly queues = new Map<string, Promise<void>>();
  private readonly generatedHashes = new Map<string, string>();
  private readonly output = vscode.window.createOutputChannel("Agent Instructions Translator", { log: true });

  public constructor(
    private readonly settings: Settings,
    private readonly translator: Translator,
    private readonly workspaceFolder: vscode.WorkspaceFolder,
  ) {
    this.resolver = new PairResolver(settings);
    this.state = new StateStore(settings.stateDirectory);
    this.subscriptions.push(this.output);
  }

  public async start(): Promise<void> {
    await this.state.ensureDirectory(this.workspaceFolder);
    if (this.settings.outputLayout === "centralizedNative") {
      await vscode.workspace.fs.createDirectory(
        vscode.Uri.file(this.resolver.centralizedNativeRoot(this.workspaceFolder)),
      );
    }
    this.subscriptions.push(vscode.workspace.onDidSaveTextDocument((document) => {
      void this.handleSave(document);
    }));
  }

  public async syncWorkspace(token: vscode.CancellationToken = new vscode.CancellationTokenSource().token): Promise<void> {
    if (!this.settings.enabled) return;
    const files = [...await vscode.workspace.findFiles(
      new vscode.RelativePattern(this.workspaceFolder, "**/*.md"),
      this.settings.exclude,
    )];
    if (this.settings.outputLayout === "centralizedNative") {
      const centralizedNativeFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(
          this.resolver.centralizedNativeRoot(this.workspaceFolder),
          `**/${this.settings.nativeFileName}`,
        ),
        null,
      );
      files.push(...centralizedNativeFiles);
    }
    const pairs = new Map<string, FilePair>();
    for (const uri of files) {
      const pair = this.resolver.resolve(uri);
      if (pair) pairs.set(this.resolver.key(pair), pair);
    }

    const errors: string[] = [];
    for (const pair of pairs.values()) {
      if (token.isCancellationRequested) break;
      try {
        await this.enqueue(pair, () => this.syncPair(pair, token));
      } catch (error) {
        const message = this.errorMessage(error);
        errors.push(message);
        this.output.error(message);
      }
    }
    if (errors.length > 0) {
      void vscode.window.showWarningMessage(
        `Agent Instructions Translator: ${errors.length} file pair(s) need attention. See the output channel for details.`,
        "Show Output",
      ).then((selection) => selection === "Show Output" && this.output.show());
    }
  }

  public async translateUri(uri: vscode.Uri, token: vscode.CancellationToken): Promise<void> {
    if (vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath !== this.workspaceFolder.uri.fsPath) {
      throw new Error("The active file is not in this enabled workspace folder.");
    }
    const pair = this.resolver.resolve(uri);
    if (!pair) throw new Error(`${path.basename(uri.fsPath)} is not a configured instruction filename.`);
    const direction = this.directionForUri(uri, pair);
    if (!directionAllowed(this.settings.mode, direction)) {
      throw new Error(`The current ${this.settings.mode} mode does not translate changes from this file.`);
    }
    await this.enqueue(pair, () => this.syncPair(pair, token));
  }

  public dispose(): void {
    for (const subscription of this.subscriptions) subscription.dispose();
  }

  private async handleSave(document: vscode.TextDocument): Promise<void> {
    if (!this.settings.enabled) return;
    if (vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath !== this.workspaceFolder.uri.fsPath) return;
    const generatedHash = this.generatedHashes.get(document.uri.fsPath);
    if (generatedHash === hashText(document.getText())) {
      this.generatedHashes.delete(document.uri.fsPath);
      return;
    }
    const pair = this.resolver.resolve(document.uri);
    if (!pair) return;
    const direction = this.directionForUri(document.uri, pair);
    if (!directionAllowed(this.settings.mode, direction)) return;

    try {
      await this.enqueue(pair, () => this.syncPair(pair, new vscode.CancellationTokenSource().token));
    } catch (error) {
      this.output.error(this.errorMessage(error));
      void vscode.window.showErrorMessage(`Agent Instructions Translator: ${this.errorMessage(error)}`);
    }
  }

  private enqueue(pair: FilePair, work: () => Promise<void>): Promise<void> {
    const key = this.resolver.key(pair);
    const previous = this.queues.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(work);
    this.queues.set(key, current);
    void current.finally(() => {
      if (this.queues.get(key) === current) this.queues.delete(key);
    }).catch(() => undefined);
    return current;
  }

  private async syncPair(
    pair: FilePair,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const [english, native, saved] = await Promise.all([
      this.readSnapshot(pair.english),
      this.readSnapshot(pair.native),
      this.state.get(pair.workspaceFolder, this.resolver.key(pair)),
    ]);
    const decision = decideDirection({
      mode: this.settings.mode,
      state: saved,
      englishHash: english?.hash,
      nativeHash: native?.hash,
    });

    if (decision === "unchanged" || decision === "incomplete") return;
    if (decision === "baseline") {
      if (!english || !native) return;
      await this.state.set(pair.workspaceFolder, this.resolver.key(pair), {
        englishHash: english.hash,
        nativeHash: native.hash,
        synchronizedAt: new Date().toISOString(),
      });
      this.output.info(
        `Recorded the initial baseline for ${pair.english.fsPath} and ${pair.native.fsPath} without translating either file.`,
      );
      return;
    }
    if (decision === "conflict") {
      throw new Error(`Conflict between ${pair.english.fsPath} and ${pair.native.fsPath}; both changed since the last sync.`);
    }
    if (!directionAllowed(this.settings.mode, decision)) return;

    const source = decision === "nativeToEnglish" ? native : english;
    const targetUri = decision === "nativeToEnglish" ? pair.english : pair.native;
    if (!source) return;
    const sourceLanguage = decision === "nativeToEnglish"
      ? this.settings.nativeLanguage
      : this.settings.englishLanguage;
    const targetLanguage = decision === "nativeToEnglish"
      ? this.settings.englishLanguage
      : this.settings.nativeLanguage;

    this.output.info(`Translating ${path.basename(decision === "nativeToEnglish" ? pair.native.fsPath : pair.english.fsPath)} (${sourceLanguage} -> ${targetLanguage}).`);
    const translated = await translateMarkdownDocument(this.translator, {
      text: source.text,
      sourceLanguage,
      targetLanguage,
      token,
    });
    if (!translated.trim()) throw new Error("The translation provider returned empty output.");
    await this.atomicWrite(targetUri, translated);
    this.generatedHashes.set(targetUri.fsPath, hashText(translated));

    const finalEnglishHash = decision === "nativeToEnglish" ? hashText(translated) : source.hash;
    const finalNativeHash = decision === "nativeToEnglish" ? source.hash : hashText(translated);
    await this.state.set(pair.workspaceFolder, this.resolver.key(pair), {
      englishHash: finalEnglishHash,
      nativeHash: finalNativeHash,
      synchronizedAt: new Date().toISOString(),
    });
  }

  private directionForUri(uri: vscode.Uri, pair: FilePair): Direction {
    return uri.fsPath === pair.native.fsPath ? "nativeToEnglish" : "englishToNative";
  }

  private async readSnapshot(uri: vscode.Uri): Promise<FileSnapshot | undefined> {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const text = decoder.decode(bytes);
      return { text, hash: hashText(text) };
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") return undefined;
      throw error;
    }
  }

  private async atomicWrite(uri: vscode.Uri, text: string): Promise<void> {
    const directory = vscode.Uri.file(path.dirname(uri.fsPath));
    await vscode.workspace.fs.createDirectory(directory);
    const temporary = vscode.Uri.file(path.join(directory.fsPath, `.${path.basename(uri.fsPath)}.${process.pid}.tmp`));
    await vscode.workspace.fs.writeFile(temporary, encoder.encode(text));
    await vscode.workspace.fs.rename(temporary, uri, { overwrite: true });
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
