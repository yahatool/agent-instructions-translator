import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

function runModule(script: string, code: string, args: unknown) {
  const url = pathToFileURL(path.resolve(script)).href;
  return spawnSync(process.execPath, [
    "--input-type=module", "--eval",
    `import * as module from ${JSON.stringify(url)};
     const input = JSON.parse(process.argv[1]);
     try { ${code} } catch (error) { console.error(error.message); process.exitCode = 1; }`,
    JSON.stringify(args),
  ], { encoding: "utf8" });
}

function runNotes(changelog: string, version = "0.2.0") {
  return runModule("scripts/release_notes.mjs",
    "process.stdout.write(module.extractReleaseNotes(input.changelog, input.version));", { changelog, version });
}

function reviewers(type = "User") {
  return { protection_rules: [{ type: "required_reviewers", reviewers: [{ type, reviewer: { id: 1 } }] }] };
}

test("manual release PRs include a version, changelog, and approval checklist", () => {
  const template = readFileSync(".github/PULL_REQUEST_TEMPLATE/release.md", "utf8");
  assert.match(template, /package\.json/);
  assert.match(template, /CHANGELOG\.md/);
  assert.match(template, /CI passed/);
  assert.match(template, /Required reviewers/);
  assert.match(template, /マージだけでは公開されません/);
});

test("release automation creates draft releases and tags while retaining tag-triggered CD", () => {
  const config = JSON.parse(readFileSync("release-please-config.json", "utf8"));
  const root = config.packages["."];
  assert.equal(root["release-type"], "node");
  assert.equal(root.draft, true);
  assert.equal(root["force-tag-creation"], true);
  assert.equal(root["include-component-in-tag"], false);
  assert.equal(root["include-v-in-tag"], true);
  assert.equal(root["bump-minor-pre-major"], true);
  assert.equal(root["bump-patch-for-minor-pre-major"], false);
  const manifest = JSON.parse(readFileSync(".release-please-manifest.json", "utf8"));
  assert.equal(manifest["."], JSON.parse(readFileSync("package.json", "utf8")).version);
  const bot = readFileSync(".github/workflows/release-please.yml", "utf8");
  assert.match(bot, /googleapis\/release-please-action@[a-f0-9]{40}/);
  assert.match(bot, /token: \$\{\{ steps.app-token.outputs.token \}\}/);
  assert.match(bot, /branches: \[main\]/);
  assert.doesNotMatch(bot, /secrets.GITHUB_TOKEN|github.token/);
  const release = readFileSync(".github/workflows/release.yml", "utf8");
  assert.match(release, /push:\s*tags: \["v\*"\]/);
});

test("Release Please uses a repository-scoped App token without PAT fallback", () => {
  const bot = readFileSync(".github/workflows/release-please.yml", "utf8");
  assert.match(bot, /actions\/create-github-app-token@[a-f0-9]{40}/);
  assert.match(bot, /client-id: \$\{\{ vars.RELEASE_PLEASE_APP_CLIENT_ID \}\}/);
  assert.match(bot, /private-key: \$\{\{ secrets.RELEASE_PLEASE_APP_PRIVATE_KEY \}\}/);
  for (const permission of ["contents", "pull-requests", "issues"]) {
    assert.match(bot, new RegExp(`permission-${permission}: write`));
  }
  assert.match(bot, /permissions:\n  contents: read/);
  assert.match(bot, /test -n "\$APP_CLIENT_ID"/);
  assert.match(bot, /test -n "\$APP_PRIVATE_KEY"/);
  assert.doesNotMatch(bot, /RELEASE_PLEASE_TOKEN|secrets.GITHUB_TOKEN|github.token/);
  assert.doesNotMatch(bot, /^\s*(owner|repositories|skip-token-revoke):/m);
});

test("Conventional Commit PR titles support scopes, breaking changes, and Japanese", () => {
  for (const title of ["feat: add provider", "fix(frontmatter): 引用符を保持", "feat(sync)!: change layout", "chore(main): release 0.2.0", "docs: examples"]) {
    const result = runModule("scripts/check_conventional_title.mjs", "module.validateTitle(input);", title);
    assert.equal(result.status, 0, result.stderr);
  }
  for (const title of ["Update files", "feat:no space", "fix: ", "feat(): empty scope", "feat: first\nsecond", "unknown: change", null]) {
    const result = runModule("scripts/check_conventional_title.mjs", "module.validateTitle(input);", title);
    assert.equal(result.status, 1);
  }
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");
  assert.match(ci, /types: \[opened, synchronize, reopened, edited, ready_for_review\]/);
  assert.match(ci, /node scripts\/check_conventional_title.mjs/);
  assert.doesNotMatch(ci, /\$\{\{ github.event.pull_request.title/);
});

test("publication retains the approval gate and stages assets before making a release public", () => {
  const workflow = readFileSync(".github/workflows/release.yml", "utf8");
  const publish = workflow.split("\n  publish:\n")[1]?.split("\n  release-assets:\n")[0] ?? "";
  assert.match(publish, /needs: \[prepare, build\]/);
  assert.match(publish, /environment: marketplace/);
  assert.match(publish, /actions: read/);
  assert.match(publish, /node scripts\/check_release_environment\.mjs/);
  assert.equal((workflow.match(/node scripts\/check_release_environment\.mjs/g) ?? []).length, 2);
  assert.doesNotMatch(workflow, /--generate-notes/);
  assert.match(workflow, /gh release create .*--draft .*--notes-file/);
  assert.match(workflow, /needs: \[prepare, publish\]/);
  assert.ok(workflow.indexOf("gh release upload") < workflow.indexOf("gh release edit"));
  assert.match(workflow, /gh release edit .*--draft=false .*--notes-file dist\/release-notes\.md/);
});

test("required reviewer protection accepts users and teams", () => {
  for (const type of ["User", "Team"]) {
    const result = runModule("scripts/check_release_environment.mjs", "module.requireReviewers(input);", reviewers(type));
    assert.equal(result.status, 0, result.stderr);
  }
});

test("missing, empty, malformed, or timer-only protection rules stop publication", () => {
  for (const environment of [
    null, {}, { protection_rules: [] },
    { protection_rules: [{ type: "wait_timer", wait_timer: 30 }] },
    { protection_rules: [{ type: "required_reviewers", reviewers: [] }] },
    { protection_rules: [{ type: "required_reviewers", reviewers: [{}] }] },
    { protection_rules: [null, { type: "required_reviewers", reviewers: [{ type: "User", reviewer: { id: 0 } }] }] },
  ]) {
    const result = runModule("scripts/check_release_environment.mjs", "module.requireReviewers(input);", environment);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Configure Required reviewers/);
  }
});

test("environment lookup authenticates a read-only request without following redirects", () => {
  const result = runModule("scripts/check_release_environment.mjs", `
    await module.checkReleaseEnvironment({
      repository: 'owner/repo', token: 'test-only-token', apiUrl: 'https://github.example/api/v3/',
      request: async (url, options) => {
        if (url !== 'https://github.example/api/v3/repos/owner/repo/environments/marketplace' ||
            options.headers.Authorization !== 'Bearer test-only-token' || options.redirect !== 'error') {
          throw new Error('Unexpected request');
        }
        return new Response(JSON.stringify(input), { status: 200 });
      }
    });`, reviewers());
  assert.equal(result.status, 0, result.stderr);
});

test("API errors stop publication without including response contents in errors", () => {
  for (const status of [401, 403, 404, 500]) {
    const result = runModule("scripts/check_release_environment.mjs", `
      await module.checkReleaseEnvironment({ repository: 'owner/repo', token: 'test-only-token',
        request: async () => new Response('private-response-details', { status: input }) });`, status);
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`HTTP ${status}`));
    assert.doesNotMatch(result.stderr, /private-response-details|test-only-token/);
  }
});

test("network failures and malformed API responses fail closed", () => {
  for (const request of [
    "async () => { throw new Error('private-network-details'); }",
    "async () => new Response('not JSON', { status: 200 })",
  ]) {
    const result = runModule("scripts/check_release_environment.mjs", `
      await module.checkReleaseEnvironment({ repository: 'owner/repo', token: 'test-only-token', request: ${request} });`, null);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Publishing is stopped/);
    assert.doesNotMatch(result.stderr, /private-network-details|test-only-token/);
  }
});

test("release environment CLI fails before network access when no token is configured", () => {
  const result = spawnSync(process.execPath, ["scripts/check_release_environment.mjs"], {
    encoding: "utf8", env: { ...process.env, GH_TOKEN: "", GITHUB_REPOSITORY: "owner/repo" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Set GH_TOKEN/);
});

test("release notes accept plain and linked version headings and omit other versions", () => {
  for (const heading of ["## 0.2.0", "## v0.2.0", "## [0.2.0](https://github.com/owner/repo/compare/v0.1.0...v0.2.0) (2026-09-27)"]) {
    const result = runNotes(`# Changelog\n\n## Unreleased\n\n- Future work\n\n${heading}\n\n### Features\n\n- Reviewed addition\n\n## 0.1.0\n\n- Old work\n`);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "### Features\n\n- Reviewed addition\n");
  }
});

test("release notes preserve fenced content that resembles a release heading", () => {
  for (const fence of ["```", "~~~~"]) {
    const body = `- Example\n\n${fence}markdown\n## 0.2.0\n## Example heading\n${fence}\n\n- More notes`;
    const result = runNotes(`## 0.2.0\n\n${body}\n\n## 0.1.0\n\n- Older\n`);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `${body}\n`);
  }
});

test("release notes normalize CRLF and preserve Markdown subsections", () => {
  const result = runNotes("## 0.2.0\r\n\r\n### Fixes\r\n\r\n- Preserve `code` and [links](https://example.com).\r\n");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "### Fixes\n\n- Preserve `code` and [links](https://example.com).\n");
});

test("missing, empty, duplicate, or prefix-only matching release sections are rejected", () => {
  for (const changelog of [
    "## Unreleased\n\n- Future work\n", "## 0.2.0\n\n## 0.1.0\n- Older\n",
    "## 0.2.0\n- First\n## 0.2.0\n- Second\n", "## 0.2.00\n- Wrong version\n",
  ]) {
    const result = runNotes(changelog);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /CHANGELOG\.md/);
  }
});

test("release notes CLI stores the same reviewed notes in its artifact and approval summary", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ait-release-notes-"));
  try {
    const output = path.join(directory, "release-notes.md");
    const summary = path.join(directory, "summary.md");
    const result = spawnSync(process.execPath, ["scripts/release_notes.mjs", "--output", output, "--summary"], {
      encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: summary },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    const manifest = JSON.parse(readFileSync("package.json", "utf8"));
    const expected = runNotes(readFileSync("CHANGELOG.md", "utf8"), manifest.version);
    assert.equal(expected.status, 0, expected.stderr);
    assert.equal(readFileSync(output, "utf8"), expected.stdout);
    assert.equal(readFileSync(summary, "utf8"), `\n## Release ${manifest.version}\n\n${expected.stdout}\n`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
