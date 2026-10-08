import * as fs from "node:fs";
import * as path from "node:path";
import type * as vscode from "vscode";

export interface ArgosRuntime {
  readonly executable: string;
  readonly environment: NodeJS.ProcessEnv;
}

export function currentVsCodeTarget(platform = process.platform, arch = process.arch): string | undefined {
  const platformName = platform === "win32"
    ? "win32"
    : platform === "darwin"
      ? "darwin"
      : platform === "linux"
        ? "linux"
        : undefined;
  const architecture = arch === "x64" ? "x64" : arch === "arm64" ? "arm64" : undefined;
  return platformName && architecture ? `${platformName}-${architecture}` : undefined;
}

export function resolveArgosRuntime(
  extensionUri: vscode.Uri,
  globalStorageUri: vscode.Uri,
  configuredPath: string,
): ArgosRuntime {
  if (configuredPath) return { executable: configuredPath, environment: {} };

  const target = currentVsCodeTarget();
  if (!target) {
    throw new Error(`The bundled Argos runtime does not support ${process.platform}/${process.arch}.`);
  }
  const targetDirectory = path.join(extensionUri.fsPath, "resources", "argos", target);
  const executable = path.join(
    targetDirectory,
    "runtime",
    process.platform === "win32" ? "argos-runtime.exe" : "argos-runtime",
  );
  const models = path.join(targetDirectory, "models");
  if (!fs.existsSync(executable) || !fs.existsSync(models)) {
    throw new Error(
      `This extension package does not contain the Argos runtime for ${target}. `
      + "Install the matching platform-specific VSIX or configure argosTranslate.path.",
    );
  }

  const writableData = path.join(globalStorageUri.fsPath, "argos");
  return {
    executable,
    environment: {
      ARGOS_PACKAGES_DIR: models,
      ARGOS_DEVICE_TYPE: "cpu",
      ARGOS_DEBUG: "0",
      XDG_DATA_HOME: path.join(writableData, "data"),
      XDG_CONFIG_HOME: path.join(writableData, "config"),
      XDG_CACHE_HOME: path.join(writableData, "cache"),
    },
  };
}
