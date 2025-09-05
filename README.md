<div align="center">

# SyncMate

<p align="center">
  <img src="https://img.shields.io/npm/v/syncmate?style=for-the-badge&logo=npm&logoColor=white" alt="NPM Version">
  <img src="https://img.shields.io/github/license/asano-haruki/syncmate?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/coverage-65.3%25-yellow?style=for-the-badge&logo=jest&logoColor=white" alt="Test Coverage">
  <img src="https://img.shields.io/badge/tests-passing-brightgreen?style=for-the-badge&logo=jest&logoColor=white" alt="Tests">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/AWS%20SDK-FF9900?style=for-the-badge&logo=amazon-aws&logoColor=white" alt="AWS SDK">
  <img src="https://img.shields.io/badge/Jest-C21325?style=for-the-badge&logo=jest&logoColor=white" alt="Jest">
  <img src="https://img.shields.io/badge/Commander.js-003366?style=for-the-badge&logo=node.js&logoColor=white" alt="Commander.js">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-macOS-lightgrey?style=for-the-badge&logo=apple&logoColor=white" alt="Platform Support">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D16.0.0-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js">
</p>

</div>

**AWS Parameter StoreとCSVファイル間でパラメータを同期するCLIツール**

## インストール

```bash
# NPMから全体インストール
npm install -g syncmate

# 動作確認
scm --version
```

## 基本的な使い方

### 1. テンプレート生成と初期設定
```bash
# CSVテンプレート生成（サンプルデータ付き）
scm generate-template -o my-parameters.csv

# CSVファイルを編集してパラメータを定義
# エディタでmy-parameters.csvを開いて必要なパラメータを設定
```

### 2. データ同期の基本フロー
```bash
# ファイル検証
scm validate -f my-parameters.csv

# 差分プレビュー
scm diff -f my-parameters.csv

# テスト実行（実際には変更しない）
scm sync -f my-parameters.csv --dry-run

# 実際の同期実行
scm sync -f my-parameters.csv
```

### 3. データ取得
```bash
# Parameter Storeから現在の設定をCSV出力
scm export -o current-settings.csv

# 特定パスのみエクスポート
scm export --path-prefix /myapp/ -o myapp-settings.csv
```

## コマンドリファレンス

### `scm sync` - データ同期
**CSVファイルからParameter Storeへパラメータを同期**

```bash
scm sync -f <csv-file> [オプション]
```

**主要オプション：**
| オプション | 説明 | 例 |
|-----------|------|-----|
| `-f, --file` | CSVファイルパス（必須） | `-f parameters.csv` |
| `--dry-run` | テスト実行（変更なし） | `--dry-run` |
| `-r, --region` | AWSリージョン指定 | `-r ap-northeast-1` |
| `-p, --profile` | AWSプロファイル指定 | `-p production` |
| `--path-prefix` | パス絞り込み | `--path-prefix /myapp/` |

### `scm export` - データ取得
**Parameter StoreからCSVファイルへデータを取得**

```bash
scm export [オプション] -o <output-file>
```

**主要オプション：**
| オプション | 説明 | 例 |
|-----------|------|-----|
| `-o, --output` | 出力CSVファイルパス（必須） | `-o exported.csv` |
| `--path-prefix` | 取得パス指定 | `--path-prefix /prod/` |
| `--no-secure-strings` | SecureStringを除外 | `--no-secure-strings` |
| `--no-decrypt` | 暗号化値のまま取得 | `--no-decrypt` |
| `-r, --region` | AWSリージョン指定 | `-r us-west-2` |

### `scm diff` - 差分確認
**CSVファイルと現在のParameter Storeの差分表示**

```bash
scm diff -f <csv-file> [オプション]
```

### `scm validate` - ファイル検証
**CSVファイルの形式とデータをチェック**

```bash
scm validate -f <csv-file>
```

### `scm generate-template` - テンプレート生成
**サンプルCSVファイルを生成**

```bash
scm generate-template -o <output-file> [オプション]
```

**オプション：**
| オプション | 説明 |
|-----------|------|
| `--no-examples` | サンプルデータなしで生成 |

## CSVファイル仕様

### 列定義
| 列名 | 必須 | 説明 | 制限 |
|------|:----:|------|------|
| `name` | ✓ | パラメータ名 | `/`で開始、最大500文字 |
| `value` | ✓ | パラメータ値 | 空文字不可 |
| `type` | - | データタイプ | `String`/`SecureString`/`StringList` |
| `description` | - | 説明文 | 最大500文字 |
| `kmsKeyId` | - | KMS暗号化キーID | SecureString使用時 |
| `tags` | - | タグ | `key1=value1,key2=value2` 形式 |

### サンプルCSV
```csv
name,value,type,description,kmsKeyId,tags
/myapp/db/host,database.example.com,String,データベースホスト名,,env=prod,component=db
/myapp/db/password,secretpass123,SecureString,DB接続パスワード,alias/myapp-key,env=prod,component=db
/myapp/api/endpoints,"api1.com;api2.com;api3.com",StringList,API接続先一覧,,env=prod,component=api
```

## データ同期仕様

### 同期動作
- **新規パラメータ**: Parameter Storeに作成
- **既存パラメータ**: 値が異なる場合のみ更新
- **同一パラメータ**: スキップ（変更なし）
- **タグ**: パラメータ作成・更新時に自動設定

### 安全機能
- **ドライラン**: `--dry-run`で実際の変更前にプレビュー可能
- **バリデーション**: CSVファイルの事前検証で不正データを防止
- **差分表示**: 変更内容を事前確認
- **行数制限**: CSVファイルは最大500行まで

### AWS認証とリージョン解決
**認証情報の優先順位：**
1. コマンドオプション（`-p profile`）
2. 環境変数（`AWS_PROFILE`, `AWS_ACCESS_KEY_ID`）
3. `~/.aws/credentials`のdefaultプロファイル
4. IAMロール（EC2/Lambda実行時）

**リージョン解決順位：**
1. コマンドオプション（`-r region`）
2. 環境変数（`AWS_REGION`, `AWS_DEFAULT_REGION`）
3. `~/.aws/config`の設定
4. デフォルト：`us-east-1`

## AWS設定

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

**SecureString使用時の追加権限：**
```json
{
  "Effect": "Allow",
  "Action": ["kms:Encrypt", "kms:Decrypt"],
  "Resource": "arn:aws:kms:*:*:key/*"
}
```

### AWS認証情報設定
```bash
# AWS CLIでプロファイル設定
aws configure --profile myproject

# 環境変数での設定
export AWS_PROFILE=myproject
export AWS_REGION=ap-northeast-1
```

## 注意事項・制限事項

### セキュリティ
- **SecureString**: KMS暗号化でParameter Storeに保存
- **ログ出力**: パスワードなどの機密情報はマスク表示
- **ファイルアクセス**: パストラバーサル攻撃対策済み

### データ制限
- **CSVファイル**: 最大500行
- **パラメータ名**: 最大500文字、`/`で開始必須
- **パラメータ値**: 空文字不可
- **説明文**: 最大500文字
- **タグ**: キー・値ともに最大128文字

### 互換性
- **Node.js**: v16.0.0以上
- **AWS SDK**: v3系使用
- **OS**: Windows, macOS, Linux対応

## トラブルシューティング

### よくあるエラー
| エラーメッセージ | 原因 | 解決方法 |
|----------------|------|----------|
| `Access Denied` | IAM権限不足 | 必要なSSM・KMS権限を付与 |
| `Parameter name must start with /` | パラメータ名形式エラー | CSV内のnameを`/`で開始 |
| `CSV file exceeds maximum row limit` | 行数制限超過 | CSVを500行以下に分割 |
| `Could not load credentials` | AWS認証エラー | プロファイル設定や環境変数確認 |

### デバッグコマンド
```bash
# AWS認証確認
aws sts get-caller-identity

# 設定ファイル確認  
cat ~/.aws/config
cat ~/.aws/credentials

# 詳細ログ出力
export DEBUG=1
scm sync -f parameters.csv --dry-run
```

## ライセンス

MIT License