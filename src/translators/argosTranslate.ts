import { spawn } from "node:child_process";
import { replaceLanguagePlaceholders } from "../core";
import type { TranslationRequest, Translator } from "../types";

/** Runs an already-installed Argos model locally. It never performs setup or downloads. */
export class ArgosTranslateTranslator implements Translator {
  public constructor(
    private readonly executable: string,
    private readonly argumentTemplate: readonly string[],
    private readonly environment: NodeJS.ProcessEnv = {},
  ) {}

  public translate(request: TranslationRequest): Promise<string> {
    const args = replaceLanguagePlaceholders(
      this.argumentTemplate,
      request.sourceLanguage,
      request.targetLanguage,
    );

    return new Promise((resolve, reject) => {
      const child = spawn(this.executable, args, {
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          ARGOS_DEVICE_TYPE: process.env.ARGOS_DEVICE_TYPE ?? "cpu",
          ...this.environment,
        },
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let settled = false;
      const finish = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        cancellation.dispose();
        callback();
      };
      const cancellation = request.token.onCancellationRequested(() => child.kill());

      child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
      child.on("error", (error) => finish(() => reject(new Error(
        `Unable to start Argos Translate CLI at "${this.executable}": ${error.message}. `
        + "Install the matching platform-specific VSIX or configure argosTranslate.path.",
      ))));
      child.on("close", (code) => finish(() => {
        if (request.token.isCancellationRequested) {
          reject(new Error("Translation was cancelled."));
          return;
        }
        if (code !== 0) {
          const detail = Buffer.concat(stderr).toString("utf8").trim();
          reject(new Error(
            `Argos Translate exited with code ${code}${detail ? `: ${detail}` : ""}. `
            + `Confirm that ${request.sourceLanguage} -> ${request.targetLanguage} is installed.`,
          ));
          return;
        }
        resolve(Buffer.concat(stdout).toString("utf8"));
      }));
      child.stdin.on("error", () => undefined);
      child.stdin.end(request.text, "utf8");
    });
  }
}
