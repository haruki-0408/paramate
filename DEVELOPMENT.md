# SyncMate 開発ガイド

## プロジェクト構成

### ディレクトリ構造
```
syncmate/
├── src/                    # メインソースコード
│   ├── cli/               # CLIエントリーポイント
│   │   └── cli.ts        # コマンド定義・実行
│   ├── config/           # 設定・認証管理
│   │   ├── awsCredentials.ts    # AWS認証情報管理
│   │   └── constants.ts         # アプリケーション定数
│   ├── services/         # ビジネスロジック層
│   │   ├── parameter-store.service.ts  # AWS Parameter Store操作
│   │   └── csv.service.ts              # CSV解析・生成
│   ├── types/            # TypeScript型定義
│   │   └── index.ts      # 共通型定義
│   └── utils/            # ユーティリティ
│       ├── logger.ts     # ログ出力機能
│       └── validation.ts # バリデーション機能
├── templates/            # CSVテンプレートファイル
├── tests/               # テストファイル
│   ├── unit/           # 単体テスト
│   └── integration/    # 統合テスト
└── dist/               # ビルド出力
```

## アーキテクチャ

### コンポーネント構成

**CLI層** (`src/cli/cli.ts`):
- Commander.jsを使用したコマンドライン解析
- 5つのメインコマンド（sync, export, diff, validate, generate-template）
- エラーハンドリングとプロセス終了制御

**設定・認証層** (`src/config/`):
- `AWSCredentials`: AWS認証情報管理（MFA対応）
- `constants`: アプリケーション定数・バリデーション制限値

**サービス層** (`src/services/`):
- `ParameterStoreService`: AWS SSM Parameter Store API操作
- `CSVService`: CSV読み書き・バリデーション・テンプレート生成

**ユーティリティ層** (`src/utils/`):
- `Logger`: 色分けログ出力・進捗表示
- `ValidationUtils`: 共有バリデーションロジック（セキュリティ検証含む）

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