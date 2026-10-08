import path from "node:path";
import { pathToFileURL } from "node:url";

export function requireReviewers(environment) {
  const rules = environment?.protection_rules;
  const configured = Array.isArray(rules) && rules.some((rule) =>
    rule?.type === "required_reviewers" && Array.isArray(rule.reviewers) &&
    rule.reviewers.some((entry) =>
      ["User", "Team"].includes(entry?.type) && Number.isSafeInteger(entry?.reviewer?.id) &&
      entry.reviewer.id > 0));
  if (!configured) {
    throw new Error("Configure Required reviewers in Settings > Environments > marketplace before publishing.");
  }
}

export async function checkReleaseEnvironment({ repository, token, apiUrl = "https://api.github.com", request = fetch }) {
  if (!repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("Set GITHUB_REPOSITORY to owner/repository.");
  }
  if (!token) throw new Error("Set GH_TOKEN with Actions read permission to check the marketplace environment.");
  const base = new URL(apiUrl);
  if (base.protocol !== "https:" || base.username || base.password) {
    throw new Error("GITHUB_API_URL must use HTTPS without URL credentials.");
  }
  const endpoint = `${base.href.replace(/\/$/, "")}/repos/${repository}/environments/marketplace`;
  let response;
  try {
    response = await request(endpoint, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("Unable to read marketplace protection rules. Publishing is stopped; check GitHub API connectivity.");
  }
  if (!response.ok) {
    throw new Error(`Unable to read marketplace protection rules (HTTP ${response.status}). Ensure the environment exists and GH_TOKEN has Actions read permission.`);
  }
  let environment;
  try {
    environment = await response.json();
  } catch {
    throw new Error("Invalid GitHub environment response. Publishing is stopped.");
  }
  requireReviewers(environment);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await checkReleaseEnvironment({
      repository: process.env.GITHUB_REPOSITORY,
      token: process.env.GH_TOKEN,
      apiUrl: process.env.GITHUB_API_URL,
    });
    console.log("Marketplace required reviewers are configured.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
