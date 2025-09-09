# Paramate 開発ガイド

## プロジェクト構成

### ディレクトリ構造
```
paramate/
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
DEBUG=1 npm run dev put -f test.csv --dry-run

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

## NPMパッケージ公開手順

### 1. 事前準備

#### npmアカウント設定
```bash
# npmアカウント作成（未作成の場合）
# https://www.npmjs.com/signup でアカウント作成

# ローカルでnpmにログイン
npm login

# ログイン確認
npm whoami
```

### 2. 公開前チェック

#### package.json確認

```bash
# package.json の内容確認
cat package.json | jq '{name, version, description, bin, repository, license}'
```

### 3. ビルドと品質チェック

#### 自動チェック実行
```bash
# 全自動チェック（prepublishOnlyスクリプト実行）
npm run prepublishOnly

# 以下が順次実行される：
# 1. npm run clean      - distディレクトリ削除
# 2. npm run build      - TypeScriptビルド  
# 3. npm run lint       - ESLint実行
# 4. npm run type-check - TypeScript型チェック
# 5. npm test          - テスト実行
```

#### 手動チェック（オプション）
```bash
# ビルド確認
npm run build && ls -la dist/

# テスト確認  
npm test

# リンター確認
npm run lint

# 型チェック確認
npm run type-check
```

### 4. 公開実行

#### バージョン更新（オプション）
```bash
# パッチバージョンアップ（例：1.0.0 → 1.0.1）
npm version patch

# マイナーバージョンアップ（例：1.0.0 → 1.1.0）  
npm version minor

# メジャーバージョンアップ（例：1.0.0 → 2.0.0）
npm version major
```

#### 公開前ドライラン
```bash
# 公開内容確認（実際には公開されない）
npm publish --dry-run

# 公開されるファイル一覧確認
npm pack --dry-run
```

#### 実際の公開
```bash
# npm に公開実行
npm publish

# または特定のタグで公開
npm publish --tag latest
```

### 5. 公開後の確認

#### パッケージ公開確認
```bash
# 公開されたパッケージ情報確認
npm view paramate

# バージョン確認
npm view paramate version

# 公開されたファイル確認
npm view paramate files
```

#### インストールテスト
```bash
# 別のディレクトリでテスト
cd /tmp
mkdir npm-test && cd npm-test

# グローバルインストールテスト
npm install -g paramate

# コマンド動作確認
prm --version
prm --help

# アンインストール
npm uninstall -g paramate
```

### 6. 公開後の作業

#### GitHubタグ作成
```bash
# 公開したバージョンにタグ付け
git tag v1.0.0
git push origin v1.0.0
```

## 重要な注意事項

### セキュリティ
- **絶対に機密情報をコミット・公開しない**
- `.npmignore`で不要ファイルを除外
- `files`フィールドで公開ファイルを明示的に指定

### バージョン管理
- **一度公開したバージョンは変更不可**
- 問題がある場合は新しいバージョンで修正
- セマンティックバージョニングに従う

### 公開前確認項目チェックリスト
- [ ] ビルドが成功する
- [ ] すべてのテストが通る  
- [ ] lintエラーがない
- [ ] TypeScript型エラーがない
- [ ] package.jsonの情報が正確
- [ ] READMEが最新の内容
- [ ] 機密情報が含まれていない
- [ ] `.npmignore`が適切に設定されている
