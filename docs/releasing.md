# GitHub Actionsでのチェックと公開

## ワークフロー

`CI` はpull requestとブランチへのpushで実行します。リリース用PRは、`package.json` のバージョンとCHANGELOGを更新して手動で作成します。人が内容とCIの結果を確認し、デフォルトブランチへマージします。

リリース用PRのマージ後、対象コミットに `vX.Y.Z` タグを付けてpushすると `Release` が開始します。CIと全VSIXの検証後に公開承認を待ち、Marketplaceへの公開が成功してからGitHub Releaseを作成・公開します。リリース用PRのマージだけではCDや公開は開始しません。バージョン更新、PR作成、タグ付けは手動で行います。

`Release` は `vX.Y.Z-pre` タグやActions画面からの手動実行にも対応します。

| 段階 | 処理 |
| --- | --- |
| CI | TypeScriptの型チェック、JavaScript/Pythonの構文チェック、actionlintによるワークフロー検証 |
| CI | `pnpm audit --audit-level moderate`。開発・ビルド用パッケージも対象 |
| CI | Gitleaksによる取得済みGit履歴全体のシークレット検査。検査前に検出動作の自己テストを実行 |
| CI | Windows・macOS・Linuxで単体テスト |
| リリース準備 | `package.json` とCHANGELOGを更新するリリース用PRを手動で作成 |
| リリース準備 | 人がPRをマージし、対象コミットにバージョンタグを付けてpush |
| CD | CIを同じコミットで再実行し、公開タグと `package.json` のバージョンを照合 |
| CD | `marketplace` にRequired reviewersが設定されていることを確認し、対象バージョンのCHANGELOGを保存 |
| CD | 5種類のOS・CPU環境でPythonとArgosの実行物、日英・英日のモデル、VSIXを生成 |
| CD | ビルド環境にインストールしたPythonパッケージをpip-auditで検査 |
| CD | VSIXから取り出した実行物で英日・日英の翻訳を実行。モデル・publisher・バージョン・targetも検証 |
| CD | 全ビルド成功後、`marketplace` の手動承認を待ち、承認後に5種類のVSIXを公開 |
| CD | 公開成功後、下書きReleaseを作成し、VSIXとSHA-256チェックサムを添付して確認済みCHANGELOGをノートとして公開 |

チェックの失敗、中程度以上のNode.js依存の脆弱性、シークレット検出、Pythonの脆弱性、実翻訳テストの失敗は公開を止めます。承認者が未設定・削除済みの場合や、承認設定をAPIで確認できない場合も公開を止めます。公開ジョブでも承認ルールを再確認します。チェックが失敗・キャンセル・スキップの場合、`CI passed` も失敗になります。branch protectionではこのチェックを必須に設定してください。

パッケージマネージャーは `packageManager` に固定し、`pnpm install --frozen-lockfile` を使います。ActionはコミットSHA、ダウンロードする検査ツールはバージョンとSHA-256で固定しています。Dependabotがnpm依存とActionの更新pull requestを作成します。

## 配布物

| VS Code target | ビルド用runner |
| --- | --- |
| `win32-x64` | `windows-2022` |
| `darwin-x64` | `macos-15-intel` |
| `darwin-arm64` | `macos-15` |
| `linux-x64` | `ubuntu-22.04` |
| `linux-arm64` | `ubuntu-22.04-arm` |

PyInstallerはOS・CPUをまたいだビルドができないため、各runnerでビルドします。Windows ARM64、Alpine、VS Code for Webは対象外です。Linuxはglibc環境を対象にします。runnerの利用可否と料金はリポジトリの契約に依存します。

## 初回の設定

1. ソースをGitHubリポジトリへ配置し、Actionsを有効にします。
2. Marketplaceのpublisherを作成し、`package.json` の `publisher` と一致させます。現在の値は `yahatool` です。
3. Settings → Environments で `marketplace` を作成し、下記の公開承認ルールを設定します。公開するコミットはデフォルトブランチに含まれている必要があります。
4. 下記のMarketplace認証方式のいずれかを設定します。
5. 同梱モデルを再配布できることを確認した後、`marketplace` のEnvironment variable `ARGOS_MODEL_REDISTRIBUTION_CONFIRMED` を `true` にします。`runtime/MODEL_NOTICE.md` に現在の確認事項があります。この値がない場合は公開を止めます。

GitHubリポジトリのURLは、CI上でパッケージを作る際に `GITHUB_REPOSITORY` からmanifestへ補います。既に `package.json` に `repository` がある場合はその値を使います。

### 公開直前の手動承認

Settings → Environments → `marketplace` で次を設定します。

1. Required reviewersに、承認できるユーザーまたはチームを少なくとも1つ登録します。
2. 一人で開発する場合は、自分で公開を承認できるようにPrevent self-reviewをオフにします。複数人で別の担当者による承認を必須にする場合はオンにします。
3. 管理者による保護ルールの迂回も禁止する設定を推奨します。
4. Deployment branches and tagsをSelected branches and tagsにし、Tagsとして `v*` を許可します。

承認ルールはGitHubのリポジトリ設定です。ワークフローファイルだけでは承認者を登録できません。Required reviewersがない場合は `scripts/check_release_environment.mjs` が公開用の処理を停止します。

公開用runのCIと全ビルドが成功すると、Actionsの実行画面にReview deploymentsが表示されます。ArtifactsからVSIXを取得し、実行画面のSummaryに表示されたリリースノートと動作を確認してApprove and deployを選びます。Rejectした場合はMarketplaceへ公開せず、GitHub Releaseも作成・公開しません。既に下書きReleaseがある場合は、そのまま残ります。

公開リポジトリではGitHub FreeでもRequired reviewersを利用できます。非公開・内部リポジトリで利用するにはEnterpriseが必要です。契約上利用できない場合、この構成は自動公開せず停止します。

デフォルトブランチはPR経由の更新と `CI passed` を必須にする設定を推奨します。リリース用PRは自動マージしません。複数人ならPRレビューも必須にすると、公開内容の確認と公開実行の承認を分担できます。

参照: [Environment設定](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)、[デプロイの承認](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments)。

### MarketplaceのPAT認証

`marketplace` のEnvironment secretに `VSCE_PAT` を登録します。Azure DevOpsで作成するPATにはMarketplaceのManage権限と、publisherへの公開権限が必要です。Environment variable `MARKETPLACE_AUTH_MODE` を `pat` にするか、省略します。

PATはソースコードや設定ファイルへ書かず、GitHubのsecretとして登録してください。

### Microsoft Entra IDとGitHub OIDCによる認証

長期運用にはこちらの方式を使えます。グローバルPATは2026年12月1日の廃止が案内されています。

1. Entra IDのアプリケーション/service principal、またはユーザー割り当てマネージドIDを用意します。
2. GitHub Actionsのフェデレーション資格情報を設定します。既定のsubjectは `repo:OWNER/REPOSITORY:environment:marketplace`、issuerは `https://token.actions.githubusercontent.com`、audienceは `api://AzureADTokenExchange` です。独自のsubject形式を使っている場合は、その設定に合わせてください。
3. そのIDにMarketplaceのpublisherへの公開権限を付与します。Microsoftの手順に従って、Marketplaceが認識するIDをpublisherのContributorに追加してください。
4. `marketplace` のEnvironment variablesに次を登録します。

| 変数 | 値 |
| --- | --- |
| `MARKETPLACE_AUTH_MODE` | `entra` |
| `AZURE_CLIENT_ID` | アプリケーション/マネージドIDのclient ID |
| `AZURE_TENANT_ID` | tenant ID |

ワークフローは `azure/login` でOIDC認証し、`vsce publish --azure-credential` で公開します。Azure subscription IDやclient secret、PATはこの方式では不要です。Marketplaceへの公開権限はAzureへのログインとは別に設定します。

参照: [VS Codeの公開・Entra ID認証手順](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace)、[Azure LoginのOIDC設定](https://github.com/Azure/login#login-with-openid-connect-oidc)。

## 公開せずビルドを試す

Actions → Release → Run workflow でブランチを選択し、`publish` をオフのまま実行します。認証情報やモデル再配布確認用の変数を設定しなくても、CIと5種類のVSIXビルドを実行できます。成功したVSIXとチェックサムはArtifactsに14日間保存します。各VSIXは約250 MBになるため、5種類分の保存容量を見込んでください。

手動実行では `pre_release` をオンにするとMarketplaceのpre-release用VSIXを作ります。バージョンは `0.1.0-beta` などではなく、通常の `X.Y.Z` 形式を使います。

## 正式公開

1. 通常の開発PRをCI通過後にデフォルトブランチへマージします。
2. リリース用ブランチを作り、`package.json` の `version` とCHANGELOGを更新するPRを手動で作成します。例えば `0.2.0` ならCHANGELOGに `## 0.2.0` の欄を作り、公開する変更内容、既知の問題、必要な移行手順を記載します。Unreleasedの対象項目もこの欄へ移します。
3. PRのバージョン、CHANGELOG、`CI passed` を確認し、公開したいタイミングで人がマージします。
4. マージされたコミットへ `vX.Y.Z` タグを付けてpushします。タグは `package.json` のバージョンと一致させます。
5. `Release` がCI、ビルド、実翻訳の検証を行います。全て成功した後、`marketplace` の公開承認を行います。
6. Marketplace公開成功後、GitHub Releaseを作成し、5種類のVSIXとチェックサムを添付して公開します。

例えば `version: "0.2.0"` を公開する場合は、以下の `RELEASE_COMMIT_SHA` をリリース用PRの実際のマージコミットSHAに置き換えます。タグを後続の開発コミットへ付けないよう、対象を確認してください。

```sh
git fetch origin
git tag -a v0.2.0 RELEASE_COMMIT_SHA -m "Release v0.2.0"
git push origin v0.2.0
```

リリース用PRの本文には [.github/PULL_REQUEST_TEMPLATE/release.md](../.github/PULL_REQUEST_TEMPLATE/release.md) を使えます。GitHubのPR作成URLへ `template=release.md` を追加するか、ファイルの内容を本文へコピーします。テンプレートはデフォルトブランチへの反映後に利用できます。[GitHubのPRテンプレートの説明](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository)

リリースノートにはタグ時点のCHANGELOGの対象バージョン欄を使います。承認前にその内容をSummaryと `release-notes` Artifactへ保存し、公開時も同じファイルを使います。公開時に別の自動生成ノートへ置き換えることはありません。

バージョンは変更内容に応じて手動で決めます。コミットメッセージの形式は必須ではありません。`1.x` 以降は、互換性を保った修正はパッチ、機能追加はマイナー、互換性のない変更はメジャー更新を基本とします。初期開発中の `0.x` は、互換性がまだ安定していない段階として扱います。

| 変更の例 | 初期開発中の更新例 |
| --- | --- |
| frontmatterの引用符を保持する修正 | `0.1.0` → `0.1.1` |
| 翻訳プロバイダーの追加 | `0.1.0` → `0.2.0` |

複数の公開待ちバージョンを同時に作らず、公開が完了してから次のリリースPRをマージしてください。公開済みのバージョン番号やタグの対象コミットは変更せず、修正は新しいバージョンとして公開します。

### pre-releaseと手動実行

Actions画面から手動で公開用runを開始する場合は、対応する `vX.Y.Z` タグを選択し、`publish` をオンにします。pre-releaseもバージョンとCHANGELOGを更新するリリース用PRを作成・マージしてから、対象コミットに `vX.Y.Z-pre` タグを付けてpushします。そのタグを選択してActions画面から手動公開することもできます。例えば `package.json` のバージョンが `0.2.0` ならタグは `v0.2.0-pre`、Marketplace上のバージョンは `0.2.0` です。正式版とpre-releaseでは別のバージョンを割り当ててください。手動で開始しても、公開直前のEnvironment承認は必要です。

Marketplaceには複数プラットフォームをまとめて確定する仕組みがありません。途中で失敗すると一部だけが公開済みになる場合があります。その場合は同じタグのジョブを再実行します。`--skip-duplicate` により公開済みの同じバージョン・targetをスキップし、残りを公開します。公開済みの内容を修正する場合は、新しいバージョンを付けます。

## ローカルの出力先

VSIXは `dist/agent-instructions-translator-<version>-<target>.vsix` に生成します。`dist/`、生成済みランタイム、ビルド環境、モデルキャッシュはGit管理対象外です。以前ルートに生成したVSIXは、この変更では削除しません。
