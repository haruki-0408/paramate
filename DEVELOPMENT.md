# SyncMate 開発ガイド

## プロジェクト構成

### ディレクトリ構造
```
syncmate/
├── src/                    # メインソースコード
│   ├── cli/               # CLIエントリーポイント
│   │   └── cli.ts        # コマンド定義・実行
│   ├── services/         # ビジネスロジック層
│   │   ├── parameter-store.service.ts  # AWS Parameter Store操作
│   │   └── csv.service.ts              # CSV解析・生成
│   ├── types/            # TypeScript型定義
│   │   └── index.ts      # 共通型定義
│   └── utils/            # ユーティリティ
│       └── logger.ts     # ログ出力機能
├── templates/            # CSVテンプレートファイル
├── tests/               # テストファイル
│   ├── unit/           # 単体テスト
│   └── integration/    # 統合テスト
└── dist/               # ビルド出力
```

## 技術スタック

### 本番依存関係
| ライブラリ | バージョン | 用途 |
|-----------|-----------|------|
| `@aws-sdk/client-ssm` | ^3.700.0 | AWS Parameter Store操作 |
| `@aws-sdk/credential-providers` | ^3.844.0 | AWS認証情報管理 |
| `commander` | ^12.0.0 | CLIコマンド解析・実行 |
| `chalk` | ^4.1.2 | ターミナル出力色付け |
| `csv-parser` | ^3.0.0 | CSV読み込み・解析 |
| `csv-writer` | ^1.6.0 | CSV書き出し生成 |

### 開発依存関係
| ライブラリ | バージョン | 用途 |
|-----------|-----------|------|
| `typescript` | ^5.0.0 | TypeScriptコンパイラ |
| `@types/node` | ^20.0.0 | Node.js型定義 |
| `@types/jest` | ^29.0.0 | Jest型定義 |
| `jest` | ^29.0.0 | テストフレームワーク |
| `ts-jest` | ^29.0.0 | TypeScript用Jestプリセット |
| `ts-node` | ^10.0.0 | TypeScript直接実行 |
| `eslint` | ^8.0.0 | コード品質チェック |
| `@typescript-eslint/eslint-plugin` | ^6.21.0 | TypeScript用ESLintルール |
| `@typescript-eslint/parser` | ^6.21.0 | TypeScript用ESLintパーサー |

## アーキテクチャ

### コンポーネント構成

**CLI層** (`src/cli/cli.ts`):
- Commander.jsを使用したコマンドライン解析
- 5つのメインコマンド（sync, export, diff, validate, generate-template）
- エラーハンドリングとプロセス終了制御

**サービス層** (`src/services/`):
- `ParameterStoreService`: AWS SSM Parameter Store API操作
- `CSVService`: CSV読み書き・バリデーション・テンプレート生成

**ユーティリティ層** (`src/utils/`):
- `Logger`: 色分けログ出力・進捗表示

**型定義** (`src/types/index.ts`):
- 全コンポーネント間で共有される型定義
- AWS API レスポンス型の拡張

## 開発環境セットアップ

### 前提条件
- Node.js 18以上
- AWS CLI設定済み
- TypeScript基本知識

### セットアップ手順
```bash
# 1. リポジトリクローン
git clone https://github.com/asano-haruki/syncmate.git
cd syncmate

# 2. 依存関係インストール
npm install

# 3. TypeScript設定確認
npm run type-check

# 4. ビルドテスト
npm run build

# 5. テスト実行
npm test
```

## 開発ワークフロー

### コード変更からテストまで
```bash
# 1. 開発モードで実行
npm run dev

# 2. 自動テスト実行
npm run test:watch

# 3. コード品質チェック
npm run lint

# 4. 型チェック
npm run type-check

# 5. ビルド確認
npm run build
```

### リリース準備
```bash
# すべてのチェックを実行（prepublishOnlyスクリプト）
npm run clean && npm run build && npm run lint && npm run type-check && npm test
```

## テスト戦略

### 単体テスト (`tests/unit/`)
- 各サービスクラスの機能テスト
- モック使用でAWS APIから独立
- 境界値・エラーケースのテスト

### 統合テスト (`tests/integration/`)
- 実際のAWS環境との連携テスト
- エンドツーエンドのワークフローテスト

### テストカバレッジ
```bash
# カバレッジ確認
npm run test:coverage
```

## コード規約

### TypeScript
- 厳格な型チェック有効
- すべての public インターフェースにJSDoc
- null/undefined の明示的処理

### ESLint設定
- TypeScript推奨ルール適用
- 自動修正可能なルールを優先
- コミット前の自動実行

## デバッグ

### 開発時デバッグ
```bash
# デバッグモードで実行
DEBUG=1 npm run dev sync -f test.csv --dry-run

# VSCode デバッガー使用
# F5でlaunch.json設定に基づいて実行
```

### AWS関連デバッグ
```bash
# AWS認証情報確認
aws sts get-caller-identity

# CloudTrail でAPI呼び出しログ確認
aws logs describe-log-groups --log-group-name-prefix /aws/cloudtrail
```

## 貢献ガイドライン

### プルリクエスト手順
1. Issue作成・確認
2. フィーチャーブランチ作成
3. 実装・テスト追加
4. リント・テスト実行
5. プルリクエスト作成

### コミットメッセージ
```
type(scope): description

例:
feat(cli): add diff command for parameter comparison
fix(csv): handle empty values in parsing
docs(readme): update installation instructions
```

### 変更が必要なファイル
- 機能追加: `src/` + `tests/unit/` + 型定義更新
- CLI変更: `src/cli/cli.ts` + ヘルプテキスト
- API変更: 型定義 + サービス実装 + テスト

## パフォーマンス考慮事項

### AWS API制限
- Parameter Store: 10 TPS (Throttling対策必要)
- バッチ処理での効率化実装

### メモリ使用量
- 大量パラメータ処理時のストリーミング
- CSV解析での逐次処理

## セキュリティ考慮事項

### 機密情報保護
- SecureStringの適切な処理
- ログ出力での値マスキング
- 一時ファイルの安全な削除

### 権限管理
- 最小権限の原則
- IAMポリシー例の提供

## リリース管理

### バージョニング
- セマンティックバージョニング採用
- 破壊的変更時のマイグレーションガイド提供

### NPM公開
```bash
# バージョン更新
npm version patch|minor|major

# 公開前チェック
npm publish --dry-run

# 実際の公開
npm publish
```

## 関連リンク

### 技術ドキュメント
- [AWS SDK for JavaScript](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
- [Commander.js](https://github.com/tj/commander.js)
- [Jest Testing Framework](https://jestjs.io/docs/getting-started)

### AWS参考資料
- [Parameter Store API Reference](https://docs.aws.amazon.com/systems-manager/latest/APIReference/API_Operations_Amazon_Simple_Systems_Manager.html)
- [AWS SDK Best Practices](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/best-practices.html)