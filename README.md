<div align="center">

# Paramate

<p align="center">
  <img src="https://img.shields.io/npm/v/paramate?style=for-the-badge&logo=npm&logoColor=white" alt="NPM Version">
  <img src="https://img.shields.io/github/license/asano-haruki/paramate?style=for-the-badge" alt="License">
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

**SSM Parameter StoreにCSVからパラメータを投入できるCLIツール**

## インストール

```bash
# NPMから全体インストール
npm install -g paramate

# 動作確認
prm --version
```

## 基本的な使い方

### 1. テンプレート生成と初期設定
```bash
# CSVテンプレート生成（サンプルデータ付き）
prm generate-template -o my-parameters.csv

# CSVファイルを編集してパラメータを定義
# エディタでmy-parameters.csvを開いて必要なパラメータを設定
```

### 2. パラメータ投入の基本フロー
```bash
# ファイル検証
prm validate -f my-parameters.csv

# テスト実行（実際には変更しない）
prm put -f my-parameters.csv --dry-run

# 実際のパラメータ投入
prm put -f my-parameters.csv
```

### 3. データ取得とロールバック
```bash
# Parameter StoreからCSVにエクスポート
prm export -o exported-parameters.csv

# CSVとParameter Storeの差分確認
prm diff -f my-parameters.csv

# 問題が発生した場合のロールバック
prm rollback
```

## コマンドリファレンス

### `prm put` - パラメータ投入
**CSVファイルからParameter Storeへパラメータを投入**

```bash
prm put -f <csv-file> [オプション]
```

**主要オプション：**
| オプション | 説明 | 例 |
|-----------|------|-----|
| `-f, --file` | CSVファイルパス（必須） | `-f parameters.csv` |
| `--dry-run` | テスト実行（変更なし） | `--dry-run` |
| `-r, --region` | AWSリージョン指定 | `-r ap-northeast-1` |
| `-p, --profile` | AWSプロファイル指定 | `-p production` |
| `--path-prefix` | パス絞り込み | `--path-prefix /myapp/` |

### `prm export` - データ取得
**Parameter StoreからCSVファイルへデータを取得**

```bash
prm export [オプション] -o <output-file>
```

**主要オプション：**
| オプション | 説明 | 例 |
|-----------|------|-----|
| `-o, --output` | 出力CSVファイルパス（必須） | `-o exported.csv` |
| `--path-prefix` | 取得パス指定 | `--path-prefix /prod/` |
| `--no-secure-strings` | SecureStringを除外 | `--no-secure-strings` |
| `--no-decrypt` | 暗号化値のまま取得 | `--no-decrypt` |
| `-r, --region` | AWSリージョン指定 | `-r us-west-2` |

### `prm diff` - 差分確認
**CSVファイルと現在のParameter Storeの差分表示**

```bash
prm diff -f <csv-file> [オプション]
```

**注意**: diffコマンドは、CSVファイルの内容に基づいて新規作成・変更項目のみを表示します。既存パラメータの削除は表示されません。

### `prm validate` - ファイル検証
**CSVファイルの形式とデータをチェック**

```bash
prm validate -f <csv-file>
```

### `prm generate-template` - テンプレート生成
**サンプルCSVファイルを生成**

```bash
prm generate-template -o <output-file> [オプション]
```

**オプション：**
| オプション | 説明 |
|-----------|------|
| `--no-examples` | サンプルデータなしで生成 |

### `prm rollback` - ロールバック
**前回put操作をロールバック**

```bash
prm rollback [オプション]
```

**主要オプション:**
| オプション | 説明 | 例 |
|-----------|------|-----|
| `-r, --region` | AWSリージョン指定 | `-r ap-northeast-1` |
| `-p, --profile` | AWSプロファイル指定 | `-p production` |

**注意**: ロールバックは前回のput操作で変更されたパラメータを元の状態に戻します。作成されたパラメータは削除され、更新されたパラメータは以前の値に復元されます。

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
/myapp/api/endpoints,"api1.com,api2.com,api3.com",StringList,API接続先一覧,,env=prod,component=api
```

### 📋 StringList型の書式仕様

**StringList型のパラメータは必ずダブルクォート（""）で囲む必要があります：**

✅ **正しい書式**：
```csv
/myapp/servers,"server1.com,server2.com,server3.com",StringList,サーバーリスト,,
/myapp/tags,"prod,webapp,api",StringList,タグリスト,,
```

❌ **間違った書式**：
```csv
/myapp/servers,server1.com,server2.com,server3.com,StringList,サーバーリスト,,  # CSVカンマと混同
/myapp/tags,prod;webapp;api,StringList,タグリスト,,                        # セミコロン区切りは非対応
```

**理由**：
- AWS Parameter StoreではStringListはカンマ区切りが標準
- CSVファイルのフィールド区切りもカンマのため、StringList内のカンマと混同を防ぐためダブルクォートで囲む
- ダブルクォート囲いにより、StringList値内にカンマを含めることが可能

## パラメータ投入仕様

### 投入動作
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

**注意**: リージョンが上記のいずれからも取得できない場合はエラーになります。必ず適切なリージョン設定を行ってください。

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
        "ssm:DeleteParameter",
        "ssm:AddTagsToResource",
        "ssm:DescribeParameters",
        "ssm:ListTagsForResource"
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

### 使用上の制限
- **CSVファイル**: 最大500行まで対応
- **処理速度**: 大量のパラメータ（50個以上）では数分程度かかります
- **ロールバック期限**: ロールバック可能期間は7日間のみ
- **同時実行**: 複数のparamateコマンドを同時実行しないでください

### AWSサービス制限
- **Parameter Store**: AWS側のレート制限により、大量データ投入時に時間がかかる場合があります
- **リージョン**: 異なるリージョン間でのパラメータ移行は直接サポートしていません
- **権限**: 実行前に適切なIAM権限が設定されている必要があります

### データ形式制限
- **CSVファイル**: 最大500行
- **パラメータ名**: 最大500文字、`/`で開始必須
- **パラメータ値**: 空文字不可
- **説明文**: 最大500文字
- **タグ**: キー・値ともに最大128文字

### レート制限とリトライ仕様
Paramateは、AWS Parameter Store APIのレート制限に対応するため、保守的な設定で動作します：

**AWS Parameter Store APIレート制限：**
- **PutParameterの制限**: 3 TPS（transactions per second）がデフォルト
- **高スループット有効時**: 10 TPSまで向上（追加料金が発生）
- **GetParameter系**: デフォルト40 TPS共有（GetParameter、GetParameters、GetParametersByPath）

**デフォルト設定：**
- **並行処理**: 1つずつシーケンシャル実行（安全性重視）
- **Rate Limitエラー発生時のみ遅延・リトライを実行**

**自動リトライ機能：**
- **最大リトライ回数**: 10回
- **初回リトライ待機**: 1.5秒
- **最大リトライ待機**: 60秒
- **指数バックオフ**: 待機時間を2倍ずつ増加
- **ジッター機能**: 同時リトライ分散のため0-200msのランダム待機追加

**レート制限が発生した場合：**
```
Rate limit hit for /myapp/db/host. Retrying in 2341ms (attempt 2/10)
Rate limit hit for /myapp/db/host. Retrying in 4189ms (attempt 3/10)
```
上記のようなメッセージが表示されますが、自動的にリトライされるため通常は手動介入は不要です。

**⚠️ 重要な注意点：**
- **PutParameterのレート制限**: デフォルト3 TPSのため、大量パラメータ（50個以上）では完了まで数分かかります
- **高スループット設定**: Parameter Storeの高スループット設定（10 TPS）を有効にすると処理速度向上（追加料金発生）
- **Rate Limitエラー**: 3 TPS制限を超えると自動リトライが発生し、処理時間が大幅に増加する可能性があります
- **リトライ上限**: まれにリトライ上限（10回）に達してエラーになる場合は、しばらく待ってから再実行してください

**高スループット設定の参考情報：**
高スループット設定を有効にするには、[AWS公式ドキュメント](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-throughput.html)を参照してください。

### 互換性
- **Node.js**: v16.0.0以上
- **AWS SDK**: v3系使用
- **OS**: macOS（動作検証済み）
  - Windows、Linuxでも動作する可能性がありますが、動作検証は実施していません

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
prm put -f parameters.csv --dry-run
```

## ライセンス

MIT License