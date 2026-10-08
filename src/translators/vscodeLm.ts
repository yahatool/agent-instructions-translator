import * as vscode from "vscode";
import type { TranslationRequest, Translator } from "../types";
import { stripWrappingFence } from "../core";

export class VsCodeLmTranslator implements Translator {
  public constructor(private readonly vendor: string, private readonly family: string) {}

  public async translate(request: TranslationRequest): Promise<string> {
    const selector: vscode.LanguageModelChatSelector = {};
    if (this.vendor) selector.vendor = this.vendor;
    if (this.family) selector.family = this.family;
    const models = await vscode.lm.selectChatModels(selector);
    const model = models[0];
    if (!model) {
      throw new Error("No VS Code language model matches the configured vendor/family. Check model access and extension settings.");
    }

    const prompt = [
      `Translate the Markdown document from ${request.sourceLanguage} to ${request.targetLanguage}.`,
      "Return only the translated document, with no commentary or wrapping fence.",
      "Preserve Markdown structure, YAML frontmatter, code fences, inline code, file paths, identifiers, commands, URLs, placeholders, and configuration keys exactly.",
      "Translate natural-language prose, headings, and explanatory comments. Do not add, remove, summarize, or reinterpret requirements.",
      "",
      request.text,
    ].join("\n");
    const response = await model.sendRequest(
      [vscode.LanguageModelChatMessage.User(prompt)],
      {},
      request.token,
    );
    let result = "";
    for await (const fragment of response.text) result += fragment;
    return stripWrappingFence(result);
  }
}
