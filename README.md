<div align="center">

# SyncMate

<p align="center">
  <img src="https://img.shields.io/npm/v/syncmate?style=for-the-badge&logo=npm&logoColor=white" alt="NPM Version">
  <img src="https://img.shields.io/github/license/asano-haruki/syncmate?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/coverage-65.3%25-yellow?style=for-the-badge&logo=jest&logoColor=white" alt="Test Coverage">
  <img src="https://img.shields.io/badge/tests-96%20passed-brightgreen?style=for-the-badge&logo=jest&logoColor=white" alt="Tests">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/AWS%20SDK-FF9900?style=for-the-badge&logo=amazon-aws&logoColor=white" alt="AWS SDK">
  <img src="https://img.shields.io/badge/Jest-C21325?style=for-the-badge&logo=jest&logoColor=white" alt="Jest">
  <img src="https://img.shields.io/badge/Commander.js-003366?style=for-the-badge&logo=node.js&logoColor=white" alt="Commander.js">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=for-the-badge" alt="Platform Support">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D16.0.0-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js">
</p>

</div>

AWS Parameter StoreとCSVファイル間でパラメータを双方向同期するCLIツールです。

## 主な機能

- **双方向同期**: CSV -> AWS Parameter Storeへのデータ同期
- **エクスポート**: Parameter StoreからCSVファイルへのデータ抽出
- **バリデーション**: CSV形式とデータ内容の詳細チェック
- **差分表示**: 現在の状態との差分をプレビュー表示
- **ドライラン実行**: 変更を適用せずに実行結果をプレビュー
- **テンプレート生成**: CSVテンプレートの自動生成

## インストール

### NPMからのインストール
```bash
npm install -g syncmate
```

### ソースからのビルド
```bash
git clone https://github.com/asano-haruki/syncmate.git
cd syncmate
npm install
npm run build
npm link
```

## コマンド一覧

| コマンド | 説明 | 主な用途 |
|---------|------|---------|
| `scm sync` | CSVからParameter Storeへ同期 | パラメータのアップロード |
| `scm export` | Parameter StoreからCSVへエクスポート | 既存パラメータの取得 |
| `scm diff` | CSV内容との差分表示 | 変更前の確認 |
| `scm validate` | CSVファイルの形式チェック | データ検証 |
| `scm generate-template` | CSVテンプレート生成 | 初回セットアップ |

## 基本的な使い方

### 1. テンプレート生成
```bash
# CSVテンプレートを生成
scm generate-template -o parameters.csv

# サンプルデータなしで生成
scm generate-template -o parameters.csv --no-examples
```

### 2. パラメータ同期
```bash
# CSVからParameter Storeへ同期
scm sync -f parameters.csv

# ドライラン（プレビューのみ）
scm sync -f parameters.csv --dry-run

# AWSプロファイル・リージョン指定
scm sync -f parameters.csv -r us-west-2 -p production
```

### 3. エクスポート
```bash
# Parameter StoreからCSV出力
scm export --path-prefix /app/ -o exported.csv

# 特定パスの再帰検索
scm export --path-prefix /prod/ --output production.csv
```

### 4. 差分確認
```bash
# CSV内容と現在の状態を比較
scm diff -f parameters.csv

# 特定のAWS環境と比較
scm diff -f parameters.csv -r us-east-1 -p dev
```

### 5. バリデーション
```bash
# CSVファイルの形式チェック
scm validate -f parameters.csv
```

## CSVファイル形式

### 必須列
| 列名 | 必須 | 説明 | 例 |
|------|------|------|-----|
| `name` | ✓ | パラメータ名（/で開始） | `/app/database/host` |
| `value` | ✓ | パラメータ値 | `localhost` |
| `type` | - | パラメータタイプ | `String`, `SecureString`, `StringList` |
| `description` | - | 説明文 | `データベースホスト名` |

### 重要な注意点
- パラメータ名は `/` で始まる必要があります
- `type` は `String` または `SecureString`（デフォルト: `String`）
- `SecureString` はKMS暗号化されて保存されます

## AWS設定

### 認証情報の設定方法
1. **AWS CLI**: `aws configure` で設定
2. **環境変数**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
3. **IAMロール**: EC2インスタンスまたはLambda関数で使用
4. **プロファイル**: `~/.aws/credentials` の名前付きプロファイル

### 必要なIAM権限
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:GetParametersByPath",
        "ssm:PutParameter",
        "ssm:AddTagsToResource"
      ],
      "Resource": "*"
    }
  ]
}
```

SecureString使用時は、追加でKMS権限も必要:
```json
{
  "Effect": "Allow",
  "Action": [
    "kms:Decrypt",
    "kms:Encrypt"
  ],
  "Resource": "arn:aws:kms:*:*:key/*"
}
```

## 使用例

### 基本的なワークフロー
```bash
# 1. CSVテンプレート生成
scm generate-template -o parameters.csv

# 2. CSVファイルを編集してパラメータを定義
# （エディタでparameters.csvを編集）

# 3. ファイル形式の検証
scm validate -f parameters.csv

# 4. 変更内容の確認
scm diff -f parameters.csv

# 5. ドライラン実行
scm sync -f parameters.csv --dry-run

# 6. 実際の同期実行
scm sync -f parameters.csv
```

### Parameter Storeからのエクスポート
```bash
# 全パラメータをエクスポート
scm export -o current-parameters.csv

# 特定パスのパラメータのみエクスポート
scm export --path-prefix /app/ -o app-parameters.csv

# SecureStringを除外してエクスポート
scm export --no-secure-strings -o public-parameters.csv
```

### オプション使用法
```bash
# 特定のAWSプロファイル使用
scm sync -f parameters.csv --profile my-profile

# 特定のリージョン指定
scm sync -f parameters.csv --region us-west-2

# パスフィルタリング
scm sync -f parameters.csv --path-prefix /app/database/
```

## トラブルシューティング

### よくあるエラーと対処法

| エラー | 原因 | 対処法 |
|-------|------|--------|
| `Access Denied` | IAM権限不足 | 必要な権限をIAMポリシーに追加 |
| `Invalid parameter name` | パラメータ名が`/`で始まっていない | CSVでパラメータ名を修正 |
| `CSV parsing error` | CSV形式が不正 | `scm validate`で詳細確認 |
| `Region not found` | 無効なリージョン指定 | `--region`オプションで正しいリージョンを指定 |

### デバッグ方法
```bash
# AWS認証情報確認
aws sts get-caller-identity --profile your-profile

# 詳細ログ出力
export DEBUG=1
scm sync -f parameters.csv

# ドライランで事前確認
scm sync -f parameters.csv --dry-run
```

## ライセンス

MIT License - [LICENSE](LICENSE)ファイルをご確認ください。