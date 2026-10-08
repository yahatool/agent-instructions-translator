import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
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

test("release automation does not depend on a release PR bot or its configuration", () => {
  for (const file of [".github/workflows/release-please.yml", "release-please-config.json", ".release-please-manifest.json"]) {
    assert.equal(existsSync(file), false, `${file} must not be required`);
  }
  for (const file of readdirSync(".github/workflows").filter((name) => /\.ya?ml$/.test(name))) {
    const workflow = readFileSync(path.join(".github/workflows", file), "utf8");
    assert.doesNotMatch(workflow, /release-please|RELEASE_PLEASE_TOKEN/i);
  }
  const release = readFileSync(".github/workflows/release.yml", "utf8");
  assert.match(release, /push:\s*tags: \["v\*"\]/);
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
