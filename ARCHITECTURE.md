# Architecture & Folder Structure

本プロジェクトは、TypeScriptのベストプラクティスに基づいた清潔で保守性の高いアーキテクチャを採用しています。

## フォルダ構成

```
src/
├── cli/                    # CLIエントリーポイント
│   └── cli.ts             # Commanderベースのコマンドライン引数処理
├── services/              # ビジネスロジック・サービス層
│   ├── parameter-store.service.ts  # AWS Parameter Store操作
│   └── csv.service.ts     # CSV読み書き・バリデーション
├── types/                 # 型定義
│   └── index.ts           # 全ての型定義・インターフェース
├── utils/                 # ユーティリティ・ヘルパー
│   └── logger.ts          # ログ出力・フォーマット
└── index.ts               # ライブラリのメインエクスポート

tests/
├── unit/                  # ユニットテスト
│   ├── setup.ts           # Jest設定・モック
│   ├── csv.service.test.ts
│   ├── parameter-store.service.test.ts
│   ├── logger.test.ts
│   └── types.test.ts
└── integration/           # 統合テスト（将来拡張用）
```

## 責任分解

### 🏗️ Architecture Layers

#### 1. CLI Layer (`cli/`)
- **責任**: ユーザー入力の受付、コマンド処理、結果表示
- **依存関係**: Services, Utils
- **特徴**: 
  - Commanderライブラリを使用
  - 複数のサブコマンド対応 (sync, export, generate-template, validate, diff)
  - エラーハンドリング

#### 2. Service Layer (`services/`)
- **責任**: ビジネスロジック、外部API・ファイルシステムとの連携
- **依存関係**: Types, Utils
- **特徴**:
  - **ParameterStoreService**: AWS SDK操作、差分計算、同期処理
  - **CSVService**: ファイル読み書き、バリデーション、テンプレート生成

#### 3. Types Layer (`types/`)
- **責任**: 型安全性の確保、インターフェース定義
- **依存関係**: なし (純粋な型定義)
- **特徴**: 
  - 全ての型・インターフェースの中央管理
  - TypeScriptの型システムを最大限活用

#### 4. Utils Layer (`utils/`)
- **責任**: 共通ユーティリティ、ヘルパー関数
- **依存関係**: なし (または最小限)
- **特徴**:
  - **Logger**: 構造化ログ、色分け、タイムスタンプ

## 🔗 依存関係グラフ

```
CLI Layer
    ↓
Service Layer
    ↓
Types Layer ← Utils Layer
```

## 🧪 テスト戦略

### Unit Tests
- **各Serviceクラスの完全なテストカバレッジ**
- **モック**: AWS SDK、ファイルシステム
- **Focus**: ビジネスロジックの正確性

### Integration Tests (将来拡張)
- **実際のAWS環境での動作確認**
- **E2Eワークフローのテスト**

## 🚀 コマンド構成

### Primary Commands
1. `sync` - CSVからParameter Storeへ同期
2. `export` - Parameter StoreからCSVへエクスポート  
3. `generate-template` - CSVテンプレート生成
4. `validate` - CSVファイル形式検証
5. `diff` - Parameter Storeとの差分表示

### Key Features
- **Dry-run mode**: 実際の変更前にプレビュー
- **Interactive confirmation**: 重要な変更の確認
- **Detailed logging**: 操作の可視化
- **Error handling**: 堅牢なエラー処理

## 📦 Build & Distribution

- **TypeScript compilation**: ES2020 target
- **npm package**: CLI binary included
- **ESLint**: Code quality enforcement
- **Jest**: Comprehensive testing

このアーキテクチャにより、機能の拡張・保守が容易で、テスト可能性の高いコードベースを実現しています。