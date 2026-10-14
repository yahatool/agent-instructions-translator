import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Project policy: lowercase, known types; descriptions may use any language.
export function validateTitle(title) {
  if (typeof title !== "string" ||
      !/^(feat|fix|perf|revert|docs|style|refactor|test|build|ci|chore)(\([^()\r\n]+\))?!?: \S[^\r\n]*$/u.test(title)) {
    throw new Error("Use a Conventional Commit PR title, e.g. feat(sync): add a provider or fix!: change pairing behavior");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    validateTitle(event.pull_request?.title);
    console.log("Conventional Commit PR title is valid.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
