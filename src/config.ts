import * as vscode from "vscode";
import type { Settings } from "./types";

const section = "agentInstructionsTranslator";

export function getSettings(resource?: vscode.Uri): Settings {
  const config = vscode.workspace.getConfiguration(section, resource);
  return {
    enabled: config.get("enabled", false),
    mode: config.get("mode", "nativeToEnglish"),
    provider: config.get("provider", "argosTranslate"),
    nativeLanguage: config.get("nativeLanguage", "ja"),
    englishLanguage: config.get("englishLanguage", "en"),
    englishFileNames: config.get("englishFileNames", ["AGENTS.md", "SKILL.md"]),
    nativeFileName: config.get("nativeFileName", "NATIVE.md"),
    defaultEnglishFileName: config.get("defaultEnglishFileName", "AGENTS.md"),
    exclude: config.get("exclude", "**/{node_modules,.git,.build,.agent-instructions-translator}/**"),
    outputLayout: config.get("outputLayout", "centralizedNative"),
    stateDirectory: config.get("stateDirectory", ".agent-instructions-translator"),
    vscodeLmVendor: config.get("vscodeLm.vendor", "copilot"),
    vscodeLmFamily: config.get("vscodeLm.family", ""),
    deeplCliPath: config.get("deeplCli.path", "deepl"),
    deeplCliArgs: config.get("deeplCli.args", [
      "translate",
      "--from",
      "{sourceLanguage}",
      "--to",
      "{targetLanguage}",
    ]),
    argosTranslatePath: config.get("argosTranslate.path", ""),
    argosTranslateArgs: config.get("argosTranslate.args", [
      "--from-lang",
      "{sourceLanguage}",
      "--to-lang",
      "{targetLanguage}",
    ]),
  };
}
