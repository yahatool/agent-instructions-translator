import * as path from "node:path";
import * as vscode from "vscode";
import {
  centralizedNativePath,
  englishDirectoryForCentralizedNative,
  pairStateKey,
} from "./core";
import type { FilePair, Settings } from "./types";

export class PairResolver {
  public constructor(private readonly settings: Settings) {}

  public isManagedName(name: string): boolean {
    return name === this.settings.nativeFileName || this.settings.englishFileNames.includes(name);
  }

  public resolve(uri: vscode.Uri): FilePair | undefined {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder || !this.isInsideWorkspace(uri, workspaceFolder)) return undefined;

    const root = workspaceFolder.uri.fsPath;
    const stateRoot = path.join(root, this.settings.stateDirectory);
    const nativeRoot = path.join(stateRoot, "native");
    const mirrorRoot = path.join(root, this.settings.stateDirectory, "mirror");
    const inCentralizedNative = this.isInsidePath(uri.fsPath, nativeRoot);
    const inMirror = this.isInsidePath(uri.fsPath, mirrorRoot);
    const name = path.basename(uri.fsPath);
    if (!this.isManagedName(name)) return undefined;

    if (this.settings.outputLayout === "centralizedNative") {
      if (name === this.settings.nativeFileName) {
        if (!inCentralizedNative) return undefined;
        const englishDirectory = englishDirectoryForCentralizedNative(
          root,
          this.settings.stateDirectory,
          uri.fsPath,
        );
        return {
          workspaceFolder,
          english: vscode.Uri.file(path.join(englishDirectory, this.findExistingEnglishName(englishDirectory))),
          native: uri,
        };
      }
      if (this.isInsidePath(uri.fsPath, stateRoot)) return undefined;
      if (name !== this.findExistingEnglishName(path.dirname(uri.fsPath))) return undefined;
      return {
        workspaceFolder,
        english: uri,
        native: vscode.Uri.file(centralizedNativePath(
          root,
          this.settings.stateDirectory,
          uri.fsPath,
          this.settings.nativeFileName,
        )),
      };
    }

    const relative = inMirror
      ? path.relative(mirrorRoot, uri.fsPath)
      : path.relative(root, uri.fsPath);
    const relativeDirectory = path.dirname(relative);
    const sourceDirectory = path.join(root, relativeDirectory);
    const generatedDirectory = this.settings.outputLayout === "hiddenMirror"
      ? path.join(mirrorRoot, relativeDirectory)
      : sourceDirectory;

    if (name === this.settings.nativeFileName) {
      const native = uri;
      const englishDirectory = inMirror ? sourceDirectory : generatedDirectory;
      const englishName = this.findExistingEnglishName(englishDirectory);
      return {
        workspaceFolder,
        english: vscode.Uri.file(path.join(englishDirectory, englishName)),
        native,
      };
    }

    const nativeDirectory = inMirror ? sourceDirectory : generatedDirectory;
    return {
      workspaceFolder,
      english: uri,
      native: vscode.Uri.file(path.join(nativeDirectory, this.settings.nativeFileName)),
    };
  }

  public key(pair: FilePair): string {
    return pairStateKey(
      pair.workspaceFolder.uri.fsPath,
      pair.english.fsPath,
      pair.native.fsPath,
    );
  }

  public centralizedNativeRoot(folder: vscode.WorkspaceFolder): string {
    return path.join(
      folder.uri.fsPath,
      this.settings.stateDirectory,
      "native",
    );
  }

  private findExistingEnglishName(directory: string): string {
    for (const name of this.settings.englishFileNames) {
      try {
        require("node:fs").accessSync(path.join(directory, name));
        return name;
      } catch {
        // Try the next configured name.
      }
    }
    return this.settings.defaultEnglishFileName;
  }

  private isInsideWorkspace(uri: vscode.Uri, folder: vscode.WorkspaceFolder): boolean {
    return this.isInsidePath(uri.fsPath, folder.uri.fsPath);
  }

  private isInsidePath(candidate: string, parent: string): boolean {
    const relative = path.relative(parent, candidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  }
}
