import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function extractReleaseNotes(changelog, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Release notes require a numeric X.Y.Z version.");
  const lines = changelog.replace(/\r\n/g, "\n").split("\n");
  const headings = [];
  let fence;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (fence) {
      const closing = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
      if (closing && closing[1][0] === fence[0] && closing[1].length >= fence.length) fence = undefined;
      continue;
    }
    const opening = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (opening) {
      fence = opening[1];
      continue;
    }
    if (/^##[ \t]+/.test(line)) {
      const match = line.match(/^##[ \t]+(?:\[v?(\d+\.\d+\.\d+)\]\([^\n]*\)|v?(\d+\.\d+\.\d+))(?=[ \t]|$)/);
      headings.push({ index, version: match?.[1] ?? match?.[2] });
    }
  }
  const matches = headings.filter((heading) => heading.version === version);
  if (matches.length !== 1) throw new Error(`CHANGELOG.md must contain exactly one release section for ${version}.`);
  const start = matches[0].index;
  const end = headings.find((heading) => heading.index > start)?.index ?? lines.length;
  const notes = lines.slice(start + 1, end).join("\n").trim();
  if (!notes) throw new Error(`The CHANGELOG.md section for ${version} must not be empty.`);
  return `${notes}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const manifest = JSON.parse(readFileSync("package.json", "utf8"));
    const notes = extractReleaseNotes(readFileSync("CHANGELOG.md", "utf8"), manifest.version);
    const args = process.argv.slice(2);
    const outputIndex = args.indexOf("--output");
    if (outputIndex !== -1) {
      const output = args[outputIndex + 1];
      if (!output || output.startsWith("--")) throw new Error("--output requires a file path.");
      writeFileSync(output, notes);
    } else {
      process.stdout.write(notes);
    }
    if (args.includes("--summary") && process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n## Release ${manifest.version}\n\n${notes}\n`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
