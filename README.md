# APS (AWS Parameter Sync)

CSVファイルからAWS Parameter StoreとAWS Secrets Managerにパラメータを同期するコマンドラインツールです。

## 機能

- **CSV解析**: バリデーション機能付きのCSVファイル解析
- **AWS Parameter Store**: StringまたはSecureStringタイプでのパラメータ同期
- **AWS Secrets Manager**: JSONまたはプレーンテキスト形式でのシークレット同期
- **ドライラン**: 実際に変更を適用せずにプレビュー表示
- **詳細ログ**: 成功、失敗、更新、スキップを色分けした美しいログ出力
- **テンプレート生成**: 開始時に使用できるCSVテンプレートの生成
- **AWSプロファイル対応**: 異なるAWSプロファイルとリージョンの使用

## インストール

```bash
npm install -g aws-parameter-sync-cli
```

または、ローカルでクローンしてビルド:

```bash
git clone <repository-url>
cd aws-parameter-sync
npm install
npm run build
npm link
```

## 使用方法

### テンプレート生成

CSVテンプレートファイルを生成して開始:

```bash
# パラメータとシークレットの両方のテンプレートを生成
aps generate-template

# パラメータのテンプレートのみ生成
aps generate-template --type parameters

# シークレットのテンプレートのみ生成
aps generate-template --type secrets

# 出力ディレクトリを指定
aps generate-template --output ./my-templates
```

### Parameter Storeへのパラメータ同期

```bash
# 基本的な同期
aps sync-parameters --file parameters.csv

# 特定のAWSリージョンとプロファイルを指定
aps sync-parameters --file parameters.csv --region us-west-2 --profile production

# ドライラン（変更を適用せずにプレビュー）
aps sync-parameters --file parameters.csv --dry-run
```

### Secrets Managerへのシークレット同期

```bash
# 基本的な同期
aps sync-secrets --file secrets.csv

# 特定のAWSリージョンとプロファイルを指定
aps sync-secrets --file secrets.csv --region us-west-2 --profile production

# ドライラン（変更を適用せずにプレビュー）
aps sync-secrets --file secrets.csv --dry-run
```

## CSVフォーマット

### パラメータCSV

| 列名 | 必須 | 説明 | 有効な値 |
|------|------|------|----------|
| name | はい | パラメータ名（/で始まる必要がある） | `/app/config/key` |
| value | はい | パラメータ値 | `任意の文字列` |
| type | いいえ | パラメータタイプ（デフォルト: String） | `String`, `SecureString` |
| description | いいえ | パラメータの説明 | `任意の文字列` |

**例:**
```csv
name,value,type,description
/app/database/host,localhost,String,データベースホスト
/app/database/password,secret123,SecureString,データベースパスワード
/app/api/key,abc-123-def,SecureString,外部サービス用APIキー
```

### シークレットCSV

| 列名 | 必須 | 説明 | 例 |
|------|------|------|-----|
| name | はい | シークレット名 | `prod/database/credentials` |
| value | はい | シークレット値（JSON可） | `{"user":"admin","pass":"secret"}` |
| description | いいえ | シークレットの説明 | `データベース認証情報` |

**例:**
```csv
name,value,description
prod/database/credentials,"{""username"":""admin"",""password"":""secret""}",データベース認証情報
prod/api/tokens,"{""token"":""abc123"",""refresh"":""def456""}",APIトークン
prod/ssl/certificate,-----BEGIN CERTIFICATE-----...,SSL証明書
```

## AWS設定

このツールはAWS SDKを使用し、標準的なAWS設定を使用します：

1. **AWS認証情報**: AWS CLI、環境変数、またはIAMロールで設定
2. **リージョン**: `--region`フラグまたはAWS_REGION環境変数で指定
3. **プロファイル**: `--profile`フラグまたはAWS_PROFILE環境変数で指定

### 必要なAWS権限

#### Parameter Store用:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:PutParameter"
      ],
      "Resource": "*"
    }
  ]
}
```

#### Secrets Manager用:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:CreateSecret",
        "secretsmanager:UpdateSecret"
      ],
      "Resource": "*"
    }
  ]
}
```

## 使用例

### 基本的なワークフロー

1. テンプレートを生成:
   ```bash
   aps generate-template
   ```

2. 生成されたCSVファイルにパラメータ/シークレットを編集

3. ドライランで変更をプレビュー:
   ```bash
   aps sync-parameters --file ./templates/parameters-template.csv --dry-run
   ```

4. 変更を適用:
   ```bash
   aps sync-parameters --file ./templates/parameters-template.csv
   ```

### マルチ環境設定

```bash
# 開発環境
aps sync-parameters --file dev-params.csv --profile dev --region us-east-1

# 本番環境
aps sync-secrets --file prod-secrets.csv --profile prod --region us-west-2
```

## 出力例

### 成功時の出力
```
ℹ 2025-01-14T10:30:00.000Z parameters.csvからパラメータ同期を開始
ℹ 2025-01-14T10:30:00.100Z 3個のパラメータが見つかりました

▼ AWS Parameter Storeにパラメータを同期中
────────────────────────────────────────────────────────────
✓ 2025-01-14T10:30:00.200Z パラメータを作成: /app/database/host
↻ 2025-01-14T10:30:00.300Z パラメータを更新: /app/database/password
⊝ 2025-01-14T10:30:00.400Z パラメータをスキップ（変更なし）: /app/api/key

────────────────────────────────────────────────────────────
📊 概要:
  ✓ 成功: 1
  ✗ 失敗: 0
  ↻ 更新: 1
  ⊝ スキップ: 1
────────────────────────────────────────────────────────────
✓ 2025-01-14T10:30:00.500Z パラメータ同期が正常に完了しました
```

### ドライラン出力
```
⚠ 2025-01-14T10:30:00.000Z ドライランモード - 変更は行われません
⚡ 2025-01-14T10:30:00.200Z [ドライラン] パラメータを作成予定: /app/new/config
⚡ 2025-01-14T10:30:00.300Z [ドライラン] パラメータを更新予定: /app/existing/config
```

## 開発

### ビルド

```bash
npm run build
```

### テスト

```bash
npm test
```

### リント

```bash
npm run lint
```

## ライセンス

MIT - 詳細は[LICENSE](LICENSE)ファイルを参照してください。

## 貢献

1. リポジトリをフォーク
2. フィーチャーブランチを作成
3. 変更を実装
4. 該当する場合はテストを追加
5. `npm run lint`と`npm test`を実行
6. プルリクエストを提出

## トラブルシューティング

### よくある問題

1. **権限拒否**: AWS認証情報に必要な権限があることを確認
2. **リージョンが見つからない**: `--region`で正しいAWSリージョンを指定
3. **CSV解析エラー**: CSVファイルの形式が期待される列と一致することを確認
4. **パラメータ名が無効**: パラメータ名は`/`で始まり、有効な文字のみ含む必要がある

### ヘルプの取得

問題が発生した場合:

1. 詳細なエラー情報についてはAWS CloudTrailログを確認
2. CSVファイルの形式が期待される構造と一致することを確認
3. AWS認証情報と権限を確認
4. 変更を適用する前に`--dry-run`を使用して変更をプレビュー