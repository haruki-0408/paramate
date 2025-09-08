# テストパターンCSVファイル仕様書

## 概要
`test-all-patterns.csv`は、AWS Systems Manager Parameter Storeの全機能を網羅的にテストするための包括的なテストデータセットです。

## テストカテゴリ

### 1. 基本パラメータタイプ
- **String型**: 通常のテキストパラメータ
- **SecureString型**: KMS暗号化パラメータ（デフォルト/AWS管理キー）
- **StringList型**: セミコロン区切りのリストパラメータ

### 2. パス構造パターン
- ルートレベルパラメータ（`/rootparam`）
- 深いネスト構造（`/test/paths/deep/nested/value`）
- 特殊文字を含むパス（ハイフン、アンダースコア、ドット）
- ダブルスラッシュを含むパス（エラーケース）
- 最大長に近いパラメータ名（499文字）

### 3. 値のパターン
- **JSON形式**: 構造化データ
- **XML形式**: XMLデータ
- **URL形式**: HTTPSエンドポイント
- **Base64エンコード**: バイナリデータの表現
- **複数行テキスト**: 改行を含む値
- **CSV特殊文字**: カンマ、引用符を含む値
- **空文字列**: バリデーションエラーケース
- **数値**: 整数、小数、負の数
- **真偽値**: true/false
- **日時**: ISO8601形式、UNIXタイムスタンプ

### 4. 国際化対応
- 日本語文字
- 絵文字
- 多言語混在（英語、日本語、中国語、ロシア語）

### 5. タグパターン
- タグなし
- 単一タグ
- 複数タグ（5個、10個）
- 特殊文字を含むタグキー（ハイフン、アンダースコア）
- セミコロンを含むタグ値（エッジケース）

### 6. セキュリティ関連
- デフォルトKMS暗号化（キー指定なし）
- AWS管理KMSキー（`alias/aws/ssm`）- 事前準備不要
- 機密情報のマスク表現（クレジットカード、SSN）

### 7. StringListエッジケース
- 単一要素のリスト
- 多数要素のリスト（10個）
- 空要素を含むリスト
- 特殊文字を含むリスト要素

### 8. エッジケース
- 先頭/末尾の空白
- 空白のみの値
- 正規表現特殊文字
- 最大長境界値テスト（パラメータ名: 499文字、説明: 499文字）

## 使用方法

### 1. バリデーションテスト
```bash
prm validate -f templates/test-all-patterns.csv
```

### 2. ドライラン実行
```bash
prm put -f templates/test-all-patterns.csv --dry-run
```

### 3. 実環境へのアップロード
```bash
# 注意: テスト環境でのみ実行してください
prm put -f templates/test-all-patterns.csv
```

### 4. ロールバックテスト
```bash
# 問題が発生した場合の緊急ロールバック
prm rollback
```

### 5. テストデータのクリーンアップ
```bash
# AWS CLIを使用してテストパラメータを削除
aws ssm delete-parameters --names $(aws ssm get-parameters-by-path --path /test --recursive --query 'Parameters[].Name' --output text)
```

## テスト項目チェックリスト

### パラメータタイプ
- [x] String
- [x] SecureString（デフォルトKMS）
- [x] SecureString（AWS管理KMS: alias/aws/ssm）
- [x] StringList

### パス構造
- [x] ルートレベルパス（`/rootparam`）
- [x] 基本パス（`/test/basic/string`）
- [x] 深いネスト（5階層）
- [x] 特殊文字（ハイフン、アンダースコア、ドット）
- [x] 無効なパス形式（エラーケース）
- [x] 最大長パラメータ名（499文字）

### 値の形式
- [x] プレーンテキスト
- [x] JSON
- [x] XML
- [x] URL
- [x] Base64
- [x] 改行を含むテキスト
- [x] CSV特殊文字（カンマ、引用符）
- [x] 空文字列（エラーケース）
- [x] 数値（整数、小数、負数）
- [x] 真偽値
- [x] 日時形式
- [x] 空白（先頭、末尾、空白のみ）

### タグ
- [x] タグなし
- [x] 単一タグ
- [x] 複数タグ（2個以上）
- [x] 特殊文字を含むタグキー
- [x] セミコロンを含むタグ値

### StringList
- [x] 基本的なリスト（3要素）
- [x] 単一要素のリスト
- [x] 多数要素のリスト（10個）
- [x] 空要素を含むリスト
- [x] 特殊文字を含む要素

### 国際化
- [x] ASCII文字のみ
- [x] 日本語
- [x] 絵文字
- [x] 多言語混在

### エッジケース
- [x] 空白を含む値
- [x] 特殊文字
- [x] 境界値
- [x] CSVパース時の特殊ケース

## 事前準備

### カスタムKMSキーの作成
テストファイルでは`alias/my-custom-key`というカスタムKMSキーを使用する箇所が1つあります。以下の手順で作成してください：

```bash
# 1. KMSキーの作成
aws kms create-key \
  --description "SyncMate test parameter encryption key" \
  --key-usage ENCRYPT_DECRYPT \
  --origin AWS_KMS

# 2. 作成されたKeyIdを環境変数に保存
export KEY_ID="<作成されたKeyId>"

# 3. キーエイリアスの作成
aws kms create-alias \
  --alias-name alias/my-custom-key \
  --target-key-id $KEY_ID

# 4. キーポリシーの設定（必要に応じて）
aws kms put-key-policy \
  --key-id $KEY_ID \
  --policy-name default \
  --policy '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "Enable IAM User Permissions",
        "Effect": "Allow",
        "Principal": {
          "AWS": "arn:aws:iam::<YOUR_ACCOUNT_ID>:root"
        },
        "Action": "kms:*",
        "Resource": "*"
      },
      {
        "Sid": "Allow SSM to use the key",
        "Effect": "Allow",
        "Principal": {
          "Service": "ssm.amazonaws.com"
        },
        "Action": [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ],
        "Resource": "*"
      }
    ]
  }'
```

### KMSキーの削除（テスト後）
```bash
# エイリアスの削除
aws kms delete-alias --alias-name alias/my-custom-key

# キーの無効化（即座に削除はできないため）
aws kms schedule-key-deletion --key-id $KEY_ID --pending-window-in-days 7
```

## 注意事項

1. **環境分離**: このファイルは`/test/`プレフィックスを使用しているため、本番環境では使用しないでください
2. **KMSキー**: カスタムKMSキー（`alias/my-custom-key`）は事前作成が必要です。上記手順を参照してください
3. **エラーケース**: 空文字列やダブルスラッシュなど、意図的にエラーとなるケースも含まれています
4. **クリーンアップ**: テスト後は必ずパラメータを削除してください
5. **コスト**: 大量のパラメータ作成およびKMSキー使用によりAWS料金が発生する可能性があります

## 統計情報

- **総パラメータ数**: 56個
- **String型**: 45個
- **SecureString型**: 6個（カスタムKMS使用: 1個）
- **StringList型**: 5個
- **最長パラメータ名**: 499文字
- **最長説明文**: 499文字
- **最多タグ数**: 10個
- **エラーケース**: 3個（空文字列、無効なパス形式、KMS設定要件）

---

## 🧪 **手動テスト項目 - 実機検証**

> **注意**: 以下の項目はunit/integrationテストでカバーできない、実際のAWS環境での最終動作確認です。

### **環境準備**

#### **テスト用AWS環境**
```bash
# 1. テスト用AWSプロファイル設定
aws configure --profile paramate-test
export AWS_PROFILE=paramate-test

# 2. Parameter Store権限確認
aws sts get-caller-identity
aws ssm describe-parameters --max-items 1  # 権限テスト
```

#### **KMSキー事前準備**
```bash
# カスタムKMSキー作成（SecureStringテスト用）
aws kms create-key --description "Paramate test key" --key-usage ENCRYPT_DECRYPT
export TEST_KEY_ID="<作成されたKeyId>"
aws kms create-alias --alias-name alias/paramate-test-key --target-key-id $TEST_KEY_ID
```

---

### **1. 基本機能動作確認**

#### **テストケース 1-1: プロジェクト名・コマンド名確認**
```bash
# ✅ 確認項目
prm --version                    # バージョン表示 (1.0.0)
prm --help                      # ヘルプにParamate表記があること
prm put --help                  # putコマンドヘルプ表示
```
**期待結果**: 
- コマンド名が`prm`で正常動作
- ヘルプにParamate関連の説明表示
- エラーなくヘルプ表示

#### **テストケース 1-2: テンプレート生成**
```bash
# ✅ 確認項目  
prm generate-template -o test-manual.csv
prm generate-template -o test-no-examples.csv --no-examples

# 手動確認
cat test-manual.csv              # サンプルデータ含有確認
cat test-no-examples.csv         # ヘッダーのみ確認
```
**期待結果**:
- CSVファイルが正常生成
- サンプルデータの有無が正しく制御される
- CSV形式が正しい（カンマ区切り、適切なヘッダー）

---

### **2. AWS連携機能確認**

#### **テストケース 2-1: AWS認証・リージョン解決**
```bash
# ✅ 確認項目
prm put -f test-manual.csv --dry-run -r us-east-1 -p paramate-test
```
**手動確認ポイント**:
- [ ] AWS Context情報が正しく表示される（Account, Region, User, Profile）
- [ ] 指定したリージョン・プロファイルが反映される
- [ ] 認証エラーが発生しない

#### **テストケース 2-2: Parameter Store接続確認**
```bash
# ✅ 確認項目
# 最小限のテストパラメータで接続確認
echo 'name,value,type,description,kmsKeyId,tags
/paramate/test/connection,test-value,String,Connection test,,' > connection-test.csv

prm validate -f connection-test.csv
prm put -f connection-test.csv --dry-run
```
**手動確認ポイント**:
- [ ] Parameter Storeへの接続が正常
- [ ] dry-runで変更内容が正しく表示される
- [ ] バリデーションが正常動作

---

### **3. パラメータタイプ別動作確認**

#### **テストケース 3-1: String型パラメータ**
```bash
# ✅ 確認項目
echo 'name,value,type,description,kmsKeyId,tags
/paramate/test/string,hello-world,String,String type test,,' > string-test.csv

prm put -f string-test.csv
aws ssm get-parameter --name /paramate/test/string
```
**手動確認ポイント**:
- [ ] Parameter Storeに正常作成
- [ ] 値が正しく保存される
- [ ] タイプがStringで保存される

#### **テストケース 3-2: SecureString型パラメータ**
```bash
# ✅ 確認項目
echo 'name,value,type,description,kmsKeyId,tags
/paramate/test/secure,secret123,SecureString,Secure string test,alias/aws/ssm,' > secure-test.csv

prm put -f secure-test.csv
aws ssm get-parameter --name /paramate/test/secure --with-decryption
```
**手動確認ポイント**:
- [ ] SecureStringとして正常作成
- [ ] KMS暗号化が適用される
- [ ] 復号化で正しい値が取得できる

#### **テストケース 3-3: StringList型パラメータ**
```bash
# ✅ 確認項目
echo 'name,value,type,description,kmsKeyId,tags
/paramate/test/list,"item1,item2,item3",StringList,String list test,,' > list-test.csv

prm put -f list-test.csv
aws ssm get-parameter --name /paramate/test/list
```
**手動確認ポイント**:
- [ ] StringListとして正常作成
- [ ] カンマ区切りが正しく処理される
- [ ] リスト値が正確に保存される

---

### **4. エクスポート・差分機能確認**

#### **テストケース 4-1: エクスポート機能**
```bash
# ✅ 確認項目
prm export --path-prefix /paramate/test/ -o exported-manual.csv
cat exported-manual.csv
```
**手動確認ポイント**:
- [ ] 指定パスのパラメータが正しくエクスポートされる
- [ ] CSV形式が正しい
- [ ] メタデータ（lastModifiedDate, version）が含まれる
- [ ] タグが正しい形式（カンマ区切り）でエクスポートされる

#### **テストケース 4-2: 差分機能**
```bash
# ✅ 確認項目
# 既存パラメータの値を変更してdiff確認
echo 'name,value,type,description,kmsKeyId,tags
/paramate/test/string,modified-value,String,Modified test,,' > diff-test.csv

prm diff -f diff-test.csv
```
**手動確認ポイント**:
- [ ] 変更項目が正しく検出される
- [ ] 新規作成項目が表示される
- [ ] 差分表示が分かりやすい
- [ ] 削除項目は表示されない（仕様通り）

---

### **5. エラーハンドリング確認**

#### **テストケース 5-1: バリデーションエラー**
```bash
# ✅ 確認項目
echo 'name,value,type,description,kmsKeyId,tags
invalid-name,value,String,Invalid name test,,' > invalid-test.csv

prm validate -f invalid-test.csv
```
**手動確認ポイント**:
- [ ] パラメータ名エラーが適切に検出される
- [ ] エラーメッセージが分かりやすい
- [ ] 行番号が正しく表示される

#### **テストケース 5-2: AWS権限エラー**
```bash
# ✅ 確認項目
# 権限不足環境でのテスト（可能であれば）
AWS_PROFILE=invalid-profile prm put -f string-test.csv --dry-run
```
**手動確認ポイント**:
- [ ] 認証エラーが適切にハンドリングされる
- [ ] エラーメッセージが明確
- [ ] アプリケーションがクラッシュしない

---

### **6. 国際化・特殊文字確認**

#### **テストケース 6-1: 日本語・絵文字**
```bash
# ✅ 確認項目
echo 'name,value,type,description,kmsKeyId,tags
/paramate/test/japanese,こんにちは世界,String,日本語テスト,,' > japanese-test.csv

prm put -f japanese-test.csv
aws ssm get-parameter --name /paramate/test/japanese
```
**手動確認ポイント**:
- [ ] 日本語が正しく保存・取得される
- [ ] 文字化けが発生しない
- [ ] CSV解析が正常動作

#### **テストケース 6-2: JSON・XML値**
```bash
# ✅ 確認項目
echo 'name,value,type,description,kmsKeyId,tags
/paramate/test/json,"{""key"": ""value"", ""number"": 123}",String,JSON test,,
/paramate/test/xml,"<root><item>value</item></root>",String,XML test,,' > structured-test.csv

prm put -f structured-test.csv
```
**手動確認ポイント**:
- [ ] JSON値が正しく保存される
- [ ] XML値が正しく保存される
- [ ] CSVエスケープ処理が正常動作

---

### **7. 大容量・境界値テスト**

#### **テストケース 7-1: テストパターンファイル**
```bash
# ✅ 確認項目
prm validate -f templates/test-all-patterns.csv
prm put -f templates/test-all-patterns.csv --dry-run
```
**手動確認ポイント**:
- [ ] 56個全パラメータのバリデーション成功
- [ ] dry-runで全項目が正常処理される
- [ ] メモリ使用量が適切（大量データ処理）

#### **テストケース 7-2: パフォーマンス確認**
```bash
# ✅ 確認項目
time prm put -f templates/test-all-patterns.csv
```
**手動確認ポイント**:
- [ ] 1分以内での処理完了（56個パラメータ）
- [ ] 途中でハングアップしない
- [ ] 適切な進捗表示

---

### **8. ロールバック機能確認**

#### **テストケース 8-1: ロールバック（未実装確認）**
```bash
# ✅ 確認項目
prm rollback
```
**手動確認ポイント**:
- [ ] 未実装エラーが適切に表示される
- [ ] アプリケーションがクラッシュしない
- [ ] エラーメッセージが明確

---

### **9. クリーンアップとファイナライズ**

#### **テストケース 9-1: テストデータ削除**
```bash
# ✅ クリーンアップ
aws ssm get-parameters-by-path --path /paramate/test --recursive --query 'Parameters[].Name' --output text | xargs -I {} aws ssm delete-parameter --name {}

# KMSキー削除
aws kms delete-alias --alias-name alias/paramate-test-key
aws kms schedule-key-deletion --key-id $TEST_KEY_ID --pending-window-in-days 7
```

---

### **✅ 手動テスト完了チェックリスト**

- [ ] プロジェクト名・コマンド名確認
- [ ] テンプレート生成機能
- [ ] AWS認証・リージョン解決
- [ ] Parameter Store接続
- [ ] String型パラメータ動作
- [ ] SecureString型パラメータ動作
- [ ] StringList型パラメータ動作
- [ ] エクスポート機能
- [ ] 差分機能
- [ ] バリデーションエラーハンドリング
- [ ] AWS権限エラーハンドリング
- [ ] 国際化対応（日本語・絵文字）
- [ ] 構造化データ（JSON・XML）
- [ ] 大容量テストパターン
- [ ] パフォーマンス確認
- [ ] ロールバック未実装確認
- [ ] テストデータクリーンアップ

**すべてのチェックが完了したら、Paramateは実機環境で正常動作することが確認されます。**

---

## 更新履歴

- 2024-01-18: 初版作成
- 2024-01-18: KMSキー要件を簡素化（カスタムキーを1つに削減、AWS管理キーを使用）
- 2024-01-18: 追加パターンを実装（CSV特殊文字、XML、空要素リスト、タグエッジケース等）
- 2025-09-08: Paramateプロジェクト要件定義書に基づく更新
  - コマンド例を`scm`から`prm`に変更
  - `sync`コマンドを`put`コマンドに変更
  - ロールバックテスト手順を追加
  - タグ形式の不整合を修正（セミコロン→カンマ）
  - エラーケースの修正と改善
- 2025-09-08: 手動テスト項目追加
  - Unit/Integrationテストでカバーできない実機検証項目を追加
  - AWS環境での最終動作確認手順を詳細化
  - 17項目の手動テストケースと完了チェックリストを追加