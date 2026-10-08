import * as vscode from "vscode";
import { resolveArgosRuntime } from "./argosRuntime";
import { getSettings } from "./config";
import { SyncCoordinator } from "./syncCoordinator";
import type { Settings, Translator } from "./types";
import { ArgosTranslateTranslator } from "./translators/argosTranslate";
import { DeepLCliTranslator } from "./translators/deeplCli";
import { VsCodeLmTranslator } from "./translators/vscodeLm";

function createTranslator(settings: Settings, context: vscode.ExtensionContext): Translator {
  switch (settings.provider) {
    case "deeplCli":
      return new DeepLCliTranslator(settings.deeplCliPath, settings.deeplCliArgs);
    case "argosTranslate": {
      const runtime = resolveArgosRuntime(
        context.extensionUri,
        context.globalStorageUri,
        settings.argosTranslatePath,
      );
      return new ArgosTranslateTranslator(
        runtime.executable,
        settings.argosTranslateArgs,
        runtime.environment,
      );
    }
    case "vscodeLm":
      return new VsCodeLmTranslator(settings.vscodeLmVendor, settings.vscodeLmFamily);
  }
}

class CoordinatorManager implements vscode.Disposable {
  private readonly coordinators = new Map<string, SyncCoordinator>();
  private rebuildGeneration = 0;

  public constructor(private readonly context: vscode.ExtensionContext) {}

  public async rebuild(): Promise<void> {
    const generation = ++this.rebuildGeneration;
    this.disposeCoordinators();
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      if (generation !== this.rebuildGeneration) return;
      const settings = getSettings(folder.uri);
      if (!settings.enabled) continue;
      try {
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder.uri, settings.stateDirectory));
        if (generation !== this.rebuildGeneration) return;
        const coordinator = new SyncCoordinator(
          settings,
          createTranslator(settings, this.context),
          folder,
        );
        await coordinator.start();
        if (generation !== this.rebuildGeneration) {
          coordinator.dispose();
          return;
        }
        this.coordinators.set(folder.uri.fsPath, coordinator);
        void coordinator.syncWorkspace();
      } catch (error) {
        void vscode.window.showErrorMessage(
          `Agent Instructions Translator (${folder.name}): ${this.errorMessage(error)}`,
        );
      }
    }
  }

  public async translateActiveFile(token: vscode.CancellationToken): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) throw new Error("Open an AGENTS.md, SKILL.md, or NATIVE.md file first.");
    const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    const coordinator = folder ? this.coordinators.get(folder.uri.fsPath) : undefined;
    if (!coordinator) {
      throw new Error("Enable agentInstructionsTranslator.enabled for this workspace folder first.");
    }
    await coordinator.translateUri(editor.document.uri, token);
  }

  public async syncEnabledFolders(token: vscode.CancellationToken): Promise<void> {
    for (const coordinator of this.coordinators.values()) {
      if (token.isCancellationRequested) return;
      await coordinator.syncWorkspace(token);
    }
  }

  public dispose(): void {
    this.disposeCoordinators();
  }

  private disposeCoordinators(): void {
    for (const coordinator of this.coordinators.values()) coordinator.dispose();
    this.coordinators.clear();
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const manager = new CoordinatorManager(context);
  context.subscriptions.push(
    manager,
    vscode.commands.registerCommand("agentInstructionsTranslator.translateActiveFile", async () => {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Translating instruction file", cancellable: true },
        async (_progress, token) => {
          try {
            await manager.translateActiveFile(token);
          } catch (error) {
            void vscode.window.showErrorMessage(
              `Agent Instructions Translator: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        },
      );
    }),
    vscode.commands.registerCommand("agentInstructionsTranslator.syncWorkspace", async () => {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Synchronizing AI instruction files", cancellable: true },
        async (_progress, token) => manager.syncEnabledFolders(token),
      );
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("agentInstructionsTranslator")) void manager.rebuild();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => void manager.rebuild()),
  );
  void manager.rebuild();
}

export function deactivate(): void {}
