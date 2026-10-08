import * as path from "node:path";
import * as vscode from "vscode";
import type { PairState, PersistedState } from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class StateStore {
  private readonly states = new Map<string, PersistedState>();
  private readonly writes = new Map<string, Promise<void>>();

  public constructor(private readonly stateDirectory: string) {}

  public async ensureDirectory(folder: vscode.WorkspaceFolder): Promise<void> {
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder.uri, this.stateDirectory));
  }

  public async get(folder: vscode.WorkspaceFolder, key: string): Promise<PairState | undefined> {
    return (await this.load(folder)).pairs[key];
  }

  public async set(folder: vscode.WorkspaceFolder, key: string, value: PairState): Promise<void> {
    const folderKey = folder.uri.fsPath;
    const previous = this.writes.get(folderKey) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(async () => {
      const state = await this.load(folder);
      const next: PersistedState = { version: 2, pairs: { ...state.pairs, [key]: value } };
      this.states.set(folderKey, next);

      const directory = vscode.Uri.joinPath(folder.uri, this.stateDirectory);
      await vscode.workspace.fs.createDirectory(directory);
      const destination = vscode.Uri.joinPath(directory, "state.json");
      const temporary = vscode.Uri.joinPath(directory, `state.${process.pid}.tmp`);
      await vscode.workspace.fs.writeFile(temporary, encoder.encode(`${JSON.stringify(next, null, 2)}\n`));
      await vscode.workspace.fs.rename(temporary, destination, { overwrite: true });
    });
    this.writes.set(folderKey, current);
    try {
      await current;
    } finally {
      if (this.writes.get(folderKey) === current) this.writes.delete(folderKey);
    }
  }

  private async load(folder: vscode.WorkspaceFolder): Promise<PersistedState> {
    const cached = this.states.get(folder.uri.fsPath);
    if (cached) return cached;

    const uri = vscode.Uri.joinPath(folder.uri, this.stateDirectory, "state.json");
    try {
      const parsed = JSON.parse(decoder.decode(await vscode.workspace.fs.readFile(uri))) as PersistedState;
      if (parsed.version === 2 && parsed.pairs && typeof parsed.pairs === "object") {
        this.states.set(folder.uri.fsPath, parsed);
        return parsed;
      }
    } catch {
      // Missing or invalid state starts a safe first-run reconciliation.
    }
    // Version 1 used machine-specific absolute paths. Discard it so the next
    // safe baseline/write produces portable version 2 state.
    const empty: PersistedState = { version: 2, pairs: {} };
    this.states.set(folder.uri.fsPath, empty);
    return empty;
  }
}
