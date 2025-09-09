# Paramate シンプル要件定義

## 概要
ParamateをシンプルなParameter Store操作ツールとして定義します。複雑な状態管理や履歴機能は排除し、CSVからのパラメータ投入とロールバック機能に特化したツールとして設計します。

---

## 🎯 **コア機能要件**

### **1. CSVからのパラメータ投入（putコマンド）**

#### **基本動作**
```bash
prm put -f parameters.csv  # CSVファイルからParameter Storeにパラメータを投入
```

#### **詳細仕様**
- **目的**: CSVファイルに定義されたパラメータをParameter Storeに直接投入
- **既存パラメータの扱い**: 無条件で上書き（警告あり）
- **新規パラメータの扱い**: 新規作成
- **ロールバック用保存**: put実行時に変更前の状態を一時保存（1つのみ）

#### **投入プロセス**
1. CSVファイルの読み込み・バリデーション
2. **ロールバック用の現在状態保存（直前の1つのみ）**
3. Parameter Storeへの順次投入
4. 投入結果の報告

#### **オプション**
```bash
prm put -f config.csv                    # 基本投入
prm put -f config.csv --dry-run         # 投入内容の事前確認
```

---

### **2. シンプルなロールバック機能**

#### **基本動作**
```bash
prm rollback                    # 直前のput操作を1つ前の状態に戻す
```

#### **詳細仕様**
- **目的**: 最後に実行したput操作の変更を元に戻す
- **対象**: 直前のput操作で変更されたパラメータのみ
- **履歴**: 1回分（直前の状態）のみ保持
- **自動保存**: put実行時に現在の状態を一時保存（1つのみ）

#### **ロールバック処理**
1. 直前のput操作記録の確認
2. 変更されたパラメータを元の値に復元
3. 新規作成されたパラメータを削除
4. 復元結果の報告

---

### **3. 簡易検証機能**

#### **バリデーションコマンド**
```bash
prm validate -f config.csv              # CSVファイルの形式チェック
```

#### **詳細仕様**
- **目的**: 投入前のCSVファイル検証
- **チェック内容**: 現在の`validateCSVFile()`機能を維持
- **エラー時**: 詳細なエラーメッセージとライン番号を表示

#### **テンプレート生成**
```bash
prm generate-template -o template.csv   # CSVテンプレート生成
```

---

## 🗂️ **データ構造・フォーマット**

### **CSVファイル形式**
現在の仕様を維持:
```csv
name,value,type,description,kmsKeyId,tags
/myapp/db/host,localhost,String,データベースホスト名,,env=prod,component=db
/myapp/db/password,secret123,SecureString,DB接続パスワード,alias/parameter-store-key,env=prod,component=db
```

### **ロールバック用状態保存形式**
```typescript
interface LastPutState {
  timestamp: Date;                      // 実行日時
  operation: 'put';                     // 実行された操作
  previousParameters: ParameterFromStore[]; // 変更前の状態（変更されたもののみ）
  newParameters: Parameter[];           // 新規作成されたパラメータ
  affectedPaths: string[];             // 影響を受けたパラメータパス
}
```

### **状態保存場所**
```
~/.paramate/
  ├── last-put-state.json             # 直前のput操作の状態（1つのみ）
  └── config.json                     # ツール設定
```

---

## 🔧 **技術仕様**

### **ロールバック実装**
1. **状態保存**:
   ```typescript
   // put実行前に変更対象パラメータの現在状態を保存
   const lastPutState: LastPutState = {
     timestamp: new Date(),
     operation: 'put',
     previousParameters: existingParameters, // 変更されるパラメータの変更前状態
     newParameters: newParameters,          // 新規作成されるパラメータ
     affectedPaths: changedPaths
   };
   ```

2. **パラメータ復元**:
   - **変更されたパラメータ**: 元の値に復元
   - **新規作成されたパラメータ**: 削除
   - **削除対象はなし**: putコマンドは既存パラメータを削除しない

3. **シンプル設計**:
   - 履歴は1つのみ保持（`last-put-state.json`）
   - ロールバック操作は1回のみ可能（ロールバック後は状態クリア）

---

## 📋 **コマンド一覧**

### **基本コマンド**
- `prm put -f <csv-file> [options]` - CSVからParameter Storeにパラメータを投入
- `prm rollback` - 直前のput操作を1つ前の状態に戻す
- `prm validate -f <csv-file>` - CSVファイルの形式チェック
- `prm generate-template -o <file>` - CSVテンプレート生成

### **putコマンドオプション**
- `--dry-run` - 投入内容の事前確認（実際には変更しない）
- `-r, --region <region>` - AWSリージョン指定
- `-p, --profile <profile>` - AWSプロファイル指定

### **使用例**
```bash
# テンプレート生成
prm generate-template -o config.csv

# CSVバリデーション
prm validate -f config.csv

# ドライラン（確認のみ）
prm put -f config.csv --dry-run

# 実際のパラメータ投入
prm put -f config.csv

# 問題が発生した場合のロールバック
prm rollback
```

---

## 🔧 **技術的なコマンドライン仕様**

### **CLI構成**
```bash
prm put -f <csv-file> [options]         # メイン機能: パラメータ投入
prm rollback                            # 直前のput操作をロールバック
prm validate -f <csv-file>              # バリデーション
prm generate-template -o <file>         # テンプレート生成
```

### **現在サポートするコマンド**
```bash
# 以下のコマンドが使用可能
prm put -f <csv-file> [options]         # CSVからParameter Storeにパラメータを投入
prm rollback                            # 直前のput操作をロールバック（※未実装）
prm validate -f <csv-file>              # CSVファイルの形式チェック
prm generate-template -o <file>         # CSVテンプレート生成
prm export [options] -o <output-file>   # Parameter StoreからCSVファイルへデータを取得
prm diff -f <csv-file> [options]        # CSVファイルと現在のParameter Storeの差分表示
```

### **diff機能の詳細仕様**
diffコマンドは、CSVファイルと現在のParameter Storeの比較を行い、以下を表示します：
- **新規作成項目**: CSVにあるがParameter Storeに存在しないパラメータ
- **変更項目**: CSVの値がParameter Storeの現在値と異なるパラメータ

**重要**: diffは既存パラメータの削除は表示しません。あくまでCSVの内容に基づく新規作成・変更のみを表示する機能です。

---

## ⚠️ **制約・制限事項**

### **機能的制限**
1. **履歴管理なし**: 変更履歴の永続化は行わない
2. **競合検出なし**: 同時実行制御は行わない
3. **差分表示なし**: 複雑な状態比較機能は提供しない
4. **双方向同期なし**: Parameter Store → CSV の自動取得は行わない

### **ロールバック制限**
1. **1回のみ**: 直前のput操作のみロールバック可能
2. **ローカル保存**: 状態はローカルファイルシステムに保存
3. **自動クリア**: ロールバック実行後は状態がクリアされる

### **操作制限**
1. **全置換**: 部分的な更新ではなく、CSVの内容で完全置換
2. **パス制限なし**: `--path-prefix`のような部分操作は提供しない
3. **単一セッション**: put → rollback のサイクルは1回のみ

---

## 🎯 **ユースケース**

### **典型的な利用シナリオ**

#### **1. 開発環境設定の投入**
```bash
# 開発環境の設定をParameter Storeに投入
prm put -f dev-config.csv

# 問題が発生した場合のロールバック
prm rollback
```

#### **2. 本番環境デプロイ**
```bash
# 本番設定の投入（事前確認）
prm validate -f prod-config.csv
prm put -f prod-config.csv --dry-run

# 実際の投入（ロールバック用状態を自動保存）
prm put -f prod-config.csv

# 問題発生時の緊急ロールバック
prm rollback  # 直前の状態に戻す
```

#### **3. シンプルな運用フロー**
```bash
# 1. テンプレート生成
prm generate-template -o config.csv

# 2. 設定編集後、バリデーション
prm validate -f config.csv

# 3. ドライラン確認
prm put -f config.csv --dry-run

# 4. 実際の投入
prm put -f config.csv

# 5. 必要に応じてロールバック
prm rollback
```

---

## 🔄 **現在の実装状況**

### **実装済み機能**
- ✅ `prm put` - CSVからParameter Storeにパラメータを投入
- ✅ `prm validate` - CSVファイルの形式チェック
- ✅ `prm generate-template` - CSVテンプレート生成
- ✅ `prm export` - Parameter StoreからCSVファイルへデータを取得
- ✅ `prm diff` - CSVファイルと現在のParameter Storeの差分表示

### **未実装機能**
- ❌ `prm rollback` - 直前のput操作をロールバック（CLI構造のみ実装、機能は未実装）

### **移行完了済み**
- ✅ プロジェクト名変更（paramate）
- ✅ コマンド名変更（scm → prm）
- ✅ 主要コマンド名変更（sync → put）

---

## ✅ **検収条件**

### **必須機能**
- [x] CSVからParameter Storeへのパラメータ投入
- [ ] 投入前の状態自動保存（直前1つのみ）
- [ ] ロールバック機能（直前の状態に戻す）
- [x] CSVバリデーション機能
- [x] テンプレート生成機能

### **品質要件**
- [x] 既存のバリデーション機能を維持
- [x] エラーハンドリングの改善
- [x] ユーザーフレンドリーなメッセージ
- [ ] put操作の可逆性（直前の操作のロールバック可能）

### **パフォーマンス要件**
- [x] 500個以下のパラメータで1分以内の処理
- [ ] 状態保存ファイルサイズの最適化
- [x] メモリ使用量の制限

---

## 📈 **実装優先度**

### **Phase 1: コア機能**
1. **putコマンドの実装**: 現在の`sync`をベースに改名・簡略化
2. **自動状態保存機能**: put実行前の現在状態保存（1つのみ）
3. **ロールバック機能**: 直前の状態に復元する機能

### **Phase 2: 品質向上**
4. **エラーハンドリング強化**: より詳細なエラーメッセージ
5. **パフォーマンス最適化**: 大量パラメータ処理の改善
6. **バリデーション機能の強化**: より厳密なCSVチェック

### **Phase 3: 最適化とクリーンアップ**
7. **不要機能の削除**: diff, exportコマンドの削除
8. **CLI UIの改善**: より使いやすいコマンドオプション
9. **ドキュメント整備**: 使用例とトラブルシューティング

---

*要件定義作成日: 2025-09-05*
*対象バージョン: 1.0.0*