import { spawn } from "node:child_process";
import type { TranslationRequest, Translator } from "../types";
import { replaceLanguagePlaceholders } from "../core";

export class DeepLCliTranslator implements Translator {
  public constructor(
    private readonly executable: string,
    private readonly argumentTemplate: readonly string[],
  ) {}

  public translate(request: TranslationRequest): Promise<string> {
    const args = replaceLanguagePlaceholders(
      this.argumentTemplate,
      request.sourceLanguage,
      request.targetLanguage,
    );

    return new Promise((resolve, reject) => {
      const child = spawn(this.executable, args, { shell: false, stdio: ["pipe", "pipe", "pipe"] });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      const cancellation = request.token.onCancellationRequested(() => child.kill());

      child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
      child.on("error", (error) => {
        cancellation.dispose();
        reject(new Error(`Unable to start DeepL CLI: ${error.message}`));
      });
      child.on("close", (code) => {
        cancellation.dispose();
        if (request.token.isCancellationRequested) {
          reject(new Error("Translation was cancelled."));
        } else if (code !== 0) {
          const detail = Buffer.concat(stderr).toString("utf8").trim();
          reject(new Error(`DeepL CLI exited with code ${code}${detail ? `: ${detail}` : ""}`));
        } else {
          resolve(Buffer.concat(stdout).toString("utf8"));
        }
      });
      child.stdin.on("error", () => undefined);
      child.stdin.end(request.text, "utf8");
    });
  }
}
