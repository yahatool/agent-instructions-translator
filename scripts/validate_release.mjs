import { appendFileSync, readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const preRelease = process.env.PRE_RELEASE === "true";
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
  throw new Error("Marketplace requires a numeric X.Y.Z version.");
}
if (process.env.WILL_PUBLISH === "true") {
  const tag = `v${manifest.version}${preRelease ? "-pre" : ""}`;
  if (process.env.RELEASE_TAG !== tag) {
    throw new Error(`Select/push tag ${tag} to publish this version.`);
  }
  if (!manifest.publisher || manifest.publisher === "local") {
    throw new Error("Set package.json publisher to the registered Marketplace publisher ID.");
  }
}
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${manifest.version}\npre_release=${preRelease}\n`);
}
console.log(`Release version: ${manifest.version}`);
