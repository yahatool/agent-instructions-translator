# Changelog

## Unreleased

- Authenticate Release Please with a repository-scoped GitHub App installation token instead of a stored PAT.
- Add Conventional Commit PR title checks and Release Please automation with draft releases and the existing publication approval gate.
- Add a manual release PR template and required Marketplace approval checks, and publish reviewed CHANGELOG notes with GitHub Release assets after deployment.
- Add GitHub Actions CI for static checks, dependency audits, secret scanning, and tests on Windows/macOS/Linux.
- Add release builds for five platform-specific VSIX packages, packaged-runtime smoke tests, Marketplace publication, and GitHub Release assets.
- Support PAT and Microsoft Entra ID authentication for Marketplace publication.
- Store versioned VSIX artifacts in `dist/` and make the test runner portable across operating systems.

## [0.2.0](https://github.com/yahatool/agent-instructions-translator/compare/v0.1.1...v0.2.0) (2026-10-16)


### ⚠ BREAKING CHANGES

* **deps:** VS Code 1.140.0 or newer is required to match the updated VS Code API types. Upgrade VS Code before installing the extension.

### Build System

* **deps:** consolidate Dependabot updates ([#15](https://github.com/yahatool/agent-instructions-translator/issues/15)) ([e630c1d](https://github.com/yahatool/agent-instructions-translator/commit/e630c1d3685cad04ca91f30756ccfbf797a05801)), closes [#1](https://github.com/yahatool/agent-instructions-translator/issues/1) [#2](https://github.com/yahatool/agent-instructions-translator/issues/2) [#4](https://github.com/yahatool/agent-instructions-translator/issues/4) [#5](https://github.com/yahatool/agent-instructions-translator/issues/5) [#6](https://github.com/yahatool/agent-instructions-translator/issues/6) [#7](https://github.com/yahatool/agent-instructions-translator/issues/7) [#9](https://github.com/yahatool/agent-instructions-translator/issues/9) [#11](https://github.com/yahatool/agent-instructions-translator/issues/11)

## [0.1.1](https://github.com/yahatool/agent-instructions-translator/compare/v0.1.0...v0.1.1) (2026-10-16)


### Bug Fixes

* **build:** follow runtime symlinks and enforce UTF-8 pipes ([8ad4e99](https://github.com/yahatool/agent-instructions-translator/commit/8ad4e99c0be33c0381ecd32edbd3eb3df10cbd26))

## 0.1.0

- Add activation-time and save-time instruction translation.
- Add native-to-English, English-to-native, and bidirectional modes.
- Add VS Code Language Model API and configurable DeepL CLI providers.
- Add a fully bundled, offline Argos Translate provider with ja/en models and no end-user Python dependency.
- Add workspace-local conflict state and optional hidden mirror output.
- Disable translation by default and initialize state only in folders where resource-scoped `enabled` is true.
- Use the bundled offline Argos runtime as the default provider while retaining DeepL CLI and VS Code LM selection.
- Establish a hash-only baseline when both sides of a bidirectional pair exist on first scan, without translating either file.
- Store version 2 synchronization state with portable workspace-relative keys and track `state.json` in Git while ignoring other generated state-directory contents.
- Add `centralizedNative` as the default layout, preserving project hierarchy under `.agent-instructions-translator/native/` while leaving English AI files in place.
- Preserve YAML frontmatter syntax and metadata keys while translating only natural-language scalar values across all providers.
