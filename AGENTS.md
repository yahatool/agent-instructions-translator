# Agent Instructions Translator

## Purpose

Create a VS Code extension that allows humans to understand and edit AI instruction files in their native language while enabling AI agents to read the English version.

The official English files will be `AGENTS.md` or `SKILL.md`, and the native language version will be `NATIVE.md`. The extension will translate upon the first launch and when saving managed files.

## Required Actions

- Target `AGENTS.md`, `SKILL.md`, and `NATIVE.md` within the workspace.
- By default, disable it. Only create a workspace-local state directory when a folder evaluates `enabled` as `true`, either when the folder is opened or when related settings are changed.
- In a multi-root workspace, respect folder-level settings. User settings of `enabled: true` will apply to all opened folders unless overridden at the folder level.
- Provide three synchronization modes.
  - `nativeToEnglish`: Update `AGENTS.md` or `SKILL.md` based on `NATIVE.md`.
  - `englishToNative`: Update `NATIVE.md` based on `AGENTS.md` or `SKILL.md`.
  - `bidirectional`: Translate to the other file regardless of which one is saved.
- Allow switching between three translation providers in VS Code settings.
  - The bundled offline Argos Translate runtime as the default
  - Configurable DeepL CLI
  - VS Code Language Model API (`vscode.lm`)
- Preserve Markdown structure, code blocks, paths, identifiers, commands, URLs, and frontmatter, translating only natural language.
- In YAML frontmatter, preserve delimiters, keys, colons, indentation, comments, quotes, versions, identifiers, URLs, paths, and placeholders. Translate only natural-language scalar values such as `name` and `description`.
- Prevent save loops and serialize processing on a file pair basis.
- In bidirectional mode, detect conflicts if both have been modified since the last synchronization and do not silently overwrite.
- On the first bidirectional scan, if both files already exist, translate neither file and record their current hashes as the synchronization baseline.
- Store synchronization metadata, centralized native files, and caches in a hidden workspace-local folder.
- By default, keep `AGENTS.md` and `SKILL.md` in their normal project locations and store each `NATIVE.md` under `.agent-instructions-translator/native/` with the original directory hierarchy preserved. Retain alongside and legacy hidden-mirror layouts as options.
- Provide a command to translate the active file and a command to synchronize the entire workspace.
- Do not log document contents or credentials, and display manageable errors.

## Technical Constraints

- Use strict settings for TypeScript and the VS Code Extension API.
- Place translation providers behind a small interface to allow for future additions.
- Use atomic writes as much as possible.
- Treat translated text as untrusted data and do not execute it.
- Pass the body to DeepL via standard input instead of command-line arguments.
- Pass the body to Argos Translate via standard input and do not perform network communication during translation.
- Bundle Argos with OS and CPU-specific VSIX to eliminate the need for users to install Python, pip, Argos, and models.
- Allow configuration of file names, native language locale, English locale, exclusion patterns, model family, CLI path, and CLI arguments.
- Add unit tests for pure synchronization and mapping logic, keeping VS Code dependencies minimal.
- Commit the portable `.agent-instructions-translator/state.json` baseline and `.agent-instructions-translator/native/**` source files. Do not commit other translation caches, `.vscode-test`, `node_modules`, compilation output, or secrets.

## Commit Messages

- When generating or creating commit messages, use Conventional Commits: `<type>[optional scope][!]: <description>`.
- Use a lowercase type from `feat`, `fix`, `perf`, `revert`, `docs`, `style`, `refactor`, `test`, `build`, `ci`, or `chore`. Select the type that reflects the actual change, not a desired version bump.
- Keep the description concise and specific. Use an optional scope to identify the affected area, for example `fix(frontmatter): preserve quoted values` or `docs: clarify release setup`.
- Mark breaking changes with `!` before the colon and explain the incompatibility and migration steps in the commit body.
- Use the same format for PR titles so squash-merge commit messages remain compatible with Release Please. See `CONTRIBUTING.md` for the project conventions.
- These formatting rules do not authorize committing or pushing without a user request.

## Verification

Run type checks and unit tests before completing changes. When behavior changes, verify both one-way modes, bidirectional conflict handling, save loop prevention, and file names under nested `skills/*`.
