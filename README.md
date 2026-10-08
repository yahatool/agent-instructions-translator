# Agent Instructions Translator

`AGENTS.md` や `SKILL.md` はAI向けの英語で保ちつつ、人間は `NATIVE.md` を母国語で読んだり編集したりできるVS Code拡張機能のテンプレートです。

> 現在は開発用テンプレートです。Marketplaceには公開されていません。

## 動作

拡張機能の起動時にワークスペースを走査し、以後は対象ファイルの保存時に翻訳します。

既定では無効です。対象プロジェクトのワークスペース設定またはフォルダー設定で、次を有効にしてください。

```jsonc
{
  "agentInstructionsTranslator.enabled": true
}
```

`.agent-instructions-translator` は、この設定が `true` のフォルダーだけに、フォルダーを開いた時または設定変更時に作成されます。マルチルートワークスペースでもフォルダーごとに判定します。ユーザー設定へ `true` を書いた場合は、フォルダー側で無効化しない限り、開いたすべてのプロジェクトで有効になります。

翻訳プロバイダーは `agentInstructionsTranslator.provider` で選択します。未指定時は、完全ローカルの内蔵Argosを使用します。

| 設定値 | 翻訳方法 |
| --- | --- |
| `argosTranslate` | 内蔵Argos（日英・英日、既定値） |
| `deeplCli` | 設定したDeepL CLI |
| `vscodeLm` | VS Code Language Model API |

| モード | 正とするファイル | 翻訳方向 |
| --- | --- | --- |
| `nativeToEnglish` | `NATIVE.md` | 母国語 → `AGENTS.md` / `SKILL.md` |
| `englishToNative` | `AGENTS.md` / `SKILL.md` | 英語 → `NATIVE.md` |
| `bidirectional` | 最後に変更した側 | 双方向 |

同じディレクトリに `AGENTS.md` と `SKILL.md` の両方がある場合、`englishFileNames` の先頭にある既存ファイルを `NATIVE.md` の相手として選びます。曖昧さを避けるには各ファイルを別ディレクトリに置いてください。

双方向モードは `.agent-instructions-translator/state.json` に前回同期時のハッシュを記録します。初回に両方のファイルが存在する場合は、どちらも翻訳・上書きせず、現在のハッシュだけを同期基準として保存します。以後、片方だけが変わればその側から翻訳し、両方が変わっていた場合は上書きせずOutputパネルへ競合を報告します。

YAML frontmatterは構造を保持して処理します。`---`、キー名、コロン、インデント、コメント、引用符は翻訳せず、`name: Writing Guidelines`の`Writing Guidelines`や`description`の文章部分だけを翻訳します。`version`、`author`、`publisher`、`license`、URL、パス、`<file-or-pattern>`のようなプレースホルダーも保持します。

## 開発

```sh
npm install
npm run check
npm test
```

pnpmを使う場合は `pnpm install`、`pnpm run check`、`pnpm test` でも構いません。

GitHub ActionsでCIと5種類のVSIXのビルド・Marketplace公開を実行できます。バージョンとCHANGELOGを更新するリリース用PRを手動で作成・マージし、対象コミットにタグを付けると、VSIXを検証して公開直前の手動承認を待ちます。リリース用PRのテンプレートと、初期設定・公開手順は [docs/releasing.md](docs/releasing.md) を参照してください。公開せずビルドだけを試す手動実行にも対応しています。

F5キーまたは `Run Extension` デバッグ構成でExtension Development Hostを起動できます。

## 設定例

### VS Code Language Model API

```jsonc
{
  "agentInstructionsTranslator.enabled": true,
  "agentInstructionsTranslator.mode": "nativeToEnglish",
  "agentInstructionsTranslator.provider": "vscodeLm",
  "agentInstructionsTranslator.nativeLanguage": "ja",
  "agentInstructionsTranslator.vscodeLm.vendor": "copilot",
  "agentInstructionsTranslator.vscodeLm.family": ""
}
```

利用可能なモデルはVS Codeとインストール済みのモデル提供拡張機能に依存します。初回利用時にVS Codeがモデルアクセスの確認を表示することがあります。

### DeepL CLI

DeepL CLIはディストリビューションによって引数形式が異なるため、コマンドと引数を設定できます。本文は標準入力へ渡されます。

```jsonc
{
  "agentInstructionsTranslator.enabled": true,
  "agentInstructionsTranslator.provider": "deeplCli",
  "agentInstructionsTranslator.deeplCli.path": "/usr/local/bin/deepl",
  "agentInstructionsTranslator.deeplCli.args": [
    "translate",
    "--from",
    "{sourceLanguage}",
    "--to",
    "{targetLanguage}"
  ]
}
```

CLIの認証情報はCLI側の安全な設定・環境変数で管理してください。この拡張機能はAPIキーを設定やログへ書きません。

### Argos Translate（完全ローカル）

プラットフォーム別VSIXには、Pythonを含む実行ランタイムと日英・英日のモデルを同梱します。利用者側でPython、pip、Argos、言語モデルをインストールする必要はありません。APIキーも翻訳時のネットワーク接続も不要で、本文は子プロセスの標準入力へ渡します。

```jsonc
{
  "agentInstructionsTranslator.enabled": true,
  "agentInstructionsTranslator.provider": "argosTranslate",
  "agentInstructionsTranslator.nativeLanguage": "ja",
  "agentInstructionsTranslator.englishLanguage": "en"
}
```

`agentInstructionsTranslator.argosTranslate.path` の既定値は空で、その場合はVSIX内のランタイムを使います。高度な用途では、この設定と `argosTranslate.args` で外部CLIに差し替えられます。

#### 内蔵VSIXのビルド

ArgosはCTranslate2などのネイティブ依存を含むため、単一の実行物を全OSへコピーできません。対象OS・CPU上で次を実行すると、対応するランタイムとモデルを生成し、プラットフォーム指定付きVSIXを作ります。

```sh
npm run package:bundled
```

ビルド時にはPython 3.12と `uv` が必要です。これは配布物を作る側だけの要件で、完成したVSIXの利用者には不要です。生成した実行物とモデルは `resources/argos/<target>/`、VSIXは `dist/agent-instructions-translator-<version>-<target>.vsix` に出力されます。

CTranslate2の公式Pythonバイナリが直接対応する組み合わせは次のとおりです。

| OS | CPU | 既成バイナリ |
| --- | --- | --- |
| Windows | x64 | 対応（Visual C++ Runtimeが必要な場合あり） |
| Windows | ARM64 | 非対応。ソースビルドまたは別方式が必要 |
| macOS | Intel x64 / Apple Silicon ARM64 | 対応 |
| Linux glibc系 | x64 / ARM64 | 対応 |
| Linux ARMv7・32-bit | 非対応。ソースビルドが必要 |
| Alpine Linux（musl） | 標準wheel対象外。専用ビルドが必要 |
| VS Code for Web | CLI起動不可 |

したがって「Windows/macOS/Linuxでは使えない」という意味ではなく、OSとCPUごとに別のネイティブ配布物が必要という意味です。まず `win32-x64`、`darwin-x64`、`darwin-arm64`、`linux-x64`、`linux-arm64` の5種類を用意すれば、一般的なデスクトップ環境の大部分をカバーできます。

注意: Argos本体はMITライセンスですが、公式モデルアーカイブには再配布ライセンスが明記されていません。ローカル利用向けVSIXは生成できますが、Marketplaceなどで第三者へ公開する前にモデル作者へ再配布条件を確認してください。各バンドルには依存パッケージ一覧とこの注意事項も収録します。

- [Argos Translate](https://github.com/argosopentech/argos-translate)
- [CTranslate2の対応プラットフォーム](https://opennmt.net/CTranslate2/installation.html)
- [VS Codeのプラットフォーム別拡張機能](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#platformspecific-extensions)

## 保存先

`outputLayout` の既定値は `centralizedNative` です。英語ファイルはAIツールが発見できる本来の場所に保ち、母国語版だけを `.agent-instructions-translator/native/` 以下へ元の階層を維持して集約します。

```text
project/
├── AGENTS.md
├── skills/
│   └── example/
│       └── SKILL.md
└── .agent-instructions-translator/
    ├── state.json
    └── native/
        ├── NATIVE.md
        └── skills/
            └── example/
                └── NATIVE.md
```

中央管理された `NATIVE.md` も起動時の探索対象です。そのため、母国語版だけが存在する場合でも、対応する元階層へ `AGENTS.md` または `SKILL.md` を生成できます。

従来どおり英語ファイルの隣に `NATIVE.md` を置く場合は、`"agentInstructionsTranslator.outputLayout": "alongside"` を指定します。`hiddenMirror` は生成側を `.agent-instructions-translator/mirror/` に置く旧方式として残しています。

`.agent-instructions-translator/state.json` と `.agent-instructions-translator/native/**` はGitへコミットしてください。隠しミラー、テンポラリ、将来のキャッシュなど、それ以外の生成物は `.gitignore` の対象です。

## コマンド

- `Agent Instructions Translator: Translate Active File`
- `Agent Instructions Translator: Sync Workspace`

コマンドパレットから実行できます。設定変更後は自動で同期し直します。

## 現時点の制約

- 翻訳はファイル全体単位です。巨大な文書向けのチャンク分割は未実装です。
- 翻訳結果の意味的な同一性は自動判定しません。重要な指示はレビューしてください。
- 隠しミラー配置はVS Code外の一般的なAIツールから自動発見されないことがあります。
- リモートファイルシステムではなく、ローカルワークスペースを主対象にしています。
- 内蔵モデルは現在ja↔enのみです。他言語はモデル追加と配布条件の確認が必要です。
- VS Code for Webではローカル実行ファイルを起動できないため、内蔵Argosは利用できません。

## ライセンス

MIT
