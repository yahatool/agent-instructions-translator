# Changelog

## Unreleased

- Add a manual release PR template and required Marketplace approval checks, and publish reviewed CHANGELOG notes with GitHub Release assets after deployment.
- Add GitHub Actions CI for static checks, dependency audits, secret scanning, and tests on Windows/macOS/Linux.
- Add release builds for five platform-specific VSIX packages, packaged-runtime smoke tests, Marketplace publication, and GitHub Release assets.
- Support PAT and Microsoft Entra ID authentication for Marketplace publication.
- Store versioned VSIX artifacts in `dist/` and make the test runner portable across operating systems.

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
