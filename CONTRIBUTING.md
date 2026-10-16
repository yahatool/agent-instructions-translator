# 開発とコミット

PRタイトルをConventional Commits形式にし、Squash mergeでそのタイトルをコミット件名に使用してください。CIはPRタイトルを検証します。作業中の各コミットは検査しません。直接pushする場合も同じ形式を使用してください（push時の形式検査はありません）。

```text
feat(provider): 翻訳プロバイダーを追加
fix(frontmatter): 引用符の保持を修正
docs: 設定例を更新
ci: リリース手順を改善
feat!: 保存先の互換性を変更
```

許可するtypeは `feat`、`fix`、`perf`、`revert`、`docs`、`style`、`refactor`、`test`、`build`、`ci`、`chore` です。小文字を使い、scopeは任意、説明は日本語でも構いません。破壊的変更はPRタイトルの `!` で明示し、本文に移行方法を書いてください。

Release Pleaseは `feat` でminor、`fix` / `perf` でpatchを更新します。`0.x` の破壊的変更はminor、`1.x` 以降はmajorです。`docs` / `ci` / `chore` などだけでは通常リリースPRを作りません。

通常の開発PRでバージョンを更新する必要はありません。Release Pleaseが作るリリースPRで `package.json`、`CHANGELOG.md`、`.release-please-manifest.json` を確認します。公開手順と初期設定は [docs/releasing.md](docs/releasing.md) を参照してください。

参照: [Conventional Commits](https://www.conventionalcommits.org/ja/v1.0.0/)、[Release Please](https://github.com/googleapis/release-please-action)。
