# SyncMate 設計上の矛盾点・問題点

## 概要
このドキュメントは、SyncMateプロジェクトの仕様調査で発見された設計上の矛盾点と問題点をまとめたものです。コードベースの修正履歴と共に、将来の改善に向けた課題を整理しています。

## 実装済み修正項目

### ✅ 修正完了項目
1. **テストコードの不具合**: `tests/unit/parameter-store.service.test.ts:528` - タグ取得テストの期待値を修正
2. **タグ区切り文字の不整合**: README.mdをセミコロン(`;`)からカンマ(`,`)区切りに修正
3. **型定義重複**: `ValidationResult`型の重複定義を解消

## 仕様上の深刻な矛盾点・設計問題

### 1. 状態管理の不整合（🔴 最重要）

#### 問題の詳細
```bash
scm diff -f parameters.csv  # 何との差分？どの時点のParameter Store？
```

#### 根本的な矛盾
- **Parameter Store**: ライブな状態（常時変化）
- **CSVファイル**: 静的なスナップショット
- **基準時点が不明確**: どの時点のParameter Storeとの差分か特定不可能

#### 問題シナリオ
```
時刻T1: 開発者AがCSVを編集
時刻T2: 開発者BがParameter Storeを直接変更（AWSコンソール経由）
時刻T3: 開発者Aが `scm diff -f config.csv` を実行
→ T1時点のCSV vs T3時点のParameter Store？
→ 開発者Bの変更との関係性が不明
```

#### 影響
- チーム開発での変更追跡不可能
- 予期しない上書きリスクの発生
- デバッグ時の原因特定困難

---

### 2. 同期操作の一方向性問題（🔴 重要）

#### 現状の制限
- **CSV → Parameter Store**: `scm sync` でサポート
- **Parameter Store → CSV**: 手動エクスポートのみ、自動同期なし

#### 問題シナリオ
```bash
# 1. CSVでパラメータを同期
scm sync -f team-config.csv

# 2. 運用チームがAWSコンソールでParameter Storeを直接変更
# 3. 再度同期すると手動変更が無警告で上書きされる
scm sync -f team-config.csv  # ← 危険：手動変更が消失
```

#### 影響
- 運用時の手動変更との衝突
- 緊急対応での変更が開発サイクルで消失
- Parameter Storeを「信頼できる情報源」として扱えない

---

### 3. 競合状態の未考慮（🔴 重要）

#### 問題の詳細
マルチユーザー環境での排他制御なし

#### Race Conditionの例
```bash
# 同時実行シナリオ
ユーザーA: scm sync -f backend-config.csv
ユーザーB: scm sync -f frontend-config.csv

# 両方が同じパラメータ（例：/shared/database/host）を含む場合
# → 最後に実行された方が勝つ（Last Write Wins）
# → 先に実行された変更が無警告で消失
```

#### 影響
- データロスのリスク
- チーム間での設定衝突
- 変更の予測不可能性

---

### 4. バージョン管理・履歴管理の欠如（🟡 中程度）

#### 不足している機能
- Parameter Storeの変更履歴管理
- ロールバック機能
- 変更者・変更時刻の記録
- 変更理由・コミットメッセージ

#### 問題シナリオ
```bash
# 問題のあるパラメータがデプロイされた場合
scm sync -f config.csv  # 問題のある設定をデプロイ
# システムに障害発生
# → どの変更が原因？
# → 前の正常な状態に戻す方法は？
# → 誰がいつ何を変更した？
```

#### 影響
- 障害時のロールバック不可
- 変更履歴の追跡不可
- 監査要件の未充足

---

### 5. 部分更新の概念的矛盾（🟡 中程度）

#### `--path-prefix`オプションの曖昧性
```bash
scm sync -f config.csv --path-prefix /myapp/
```

#### 不明確な動作パターン
1. **CSVにプレフィックス外のパラメータがある場合**
   - エラーにする？
   - 無視する？
   - 警告して続行？

2. **プレフィックス内の既存パラメータ削除**
   - CSVに記載されていないプレフィックス内パラメータをどう扱う？
   - 削除する？維持する？

#### 現在の実装での問題
```typescript
// src/services/parameter-store.service.ts:378-404
// calculateDiff()はCSVにあるパラメータのみチェック
// → Parameter Store上のCSV外パラメータは無視（削除もされない）
```

---

### 6. エクスポート・インポート機能の一貫性問題（🟡 中程度）

#### データ形式の不整合
```typescript
// エクスポート時（メタデータ付き）
interface ExportRecord {
  name: string;
  value: string;
  type: string;
  description: string;
  kmsKeyId: string;
  tags: string;
  lastModifiedDate: string; // ← メタデータ
  version: string;          // ← メタデータ
}

// インポート時（メタデータなし）
interface ImportRecord {
  name: string;
  value: string;
  type: string;
  description: string;
  kmsKeyId: string;
  tags: string;
  // lastModifiedDate, version は無視される
}
```

#### 問題の影響
- エクスポート→編集→インポートサイクルでメタデータ消失
- バージョン情報の活用不可
- ラウンドトリップ変換での情報欠損

---

## 推奨される設計改善案

### 1. 状態管理の導入
```typescript
interface SyncState {
  lastSyncTimestamp: Date;
  lastSyncHash: string;           // Parameter Store状態のハッシュ
  parameterSnapshots: ParameterFromStore[];
  syncedBy: string;               // 同期実行者
}

// .syncmate-state.json として保存
// diff計算時の基準点として使用
```

### 2. 双方向同期の実装
```bash
scm pull                    # Parameter Store → CSV
scm push                    # CSV → Parameter Store  
scm merge                   # 競合解決付きの双方向同期
scm status                  # 現在の状態差分表示
```

### 3. 変更履歴の管理
```bash
scm history                 # 変更履歴表示
scm rollback <version>      # 特定バージョンにロールバック
scm blame <parameter-name>  # パラメータの変更履歴
```

### 4. 競合検出・解決メカニズム
```bash
scm sync -f config.csv --conflict-resolution merge|overwrite|abort
scm lock <path-prefix>      # 排他制御
scm unlock <path-prefix>    # ロック解除
```

### 5. トランザクション的操作
```typescript
// 全てのパラメータが成功した場合のみコミット
// 途中でエラーが発生した場合は全体をロールバック
await parameterStore.syncWithTransaction(parameters);
```

### 6. 設定ファイルでの動作制御
```yaml
# .syncmate-config.yml
conflict_resolution: "abort"  # merge|overwrite|abort
history_retention_days: 30
auto_backup: true
path_restrictions:
  - "/production/*"  # 本番環境パスの制限
team_mode: true      # チーム開発モード
```

## 修正優先度

### 🔴 高優先度（即座に対応が必要）
1. **状態管理の導入** - diffコマンドの基準点明確化
2. **競合検出機能** - 同時実行での安全性確保
3. **双方向同期** - Parameter Store変更の取り込み

### 🟡 中優先度（段階的に対応）
4. **履歴管理機能** - 変更追跡とロールバック
5. **部分更新の仕様明確化** - path-prefixオプションの動作定義
6. **データ形式の統一** - エクスポート/インポートの一貫性

### 🟢 低優先度（将来的な改善）
7. **設定ファイル対応** - チーム開発向けの設定管理
8. **ロック機能** - 排他制御メカニズム

## 技術的実装の考慮点

### 状態管理の実装方針
- **ローカル状態ファイル**: `.syncmate-state.json`
- **リモート状態**: Parameter Store自体にメタデータタグとして埋め込み
- **ハッシュベース変更検出**: パラメータ内容のハッシュで変更検出

### 競合解決の実装方針
- **Three-way merge**: Base（前回同期時）、Local（CSV）、Remote（Parameter Store）
- **Conflict markers**: Gitスタイルの競合マーカー
- **Interactive resolution**: 対話的な競合解決UI

---

## 結論

SyncMateは基本的な同期機能は実装されているが、**実用的なチーム開発環境**で安全に使用するには、状態管理と競合制御の根本的な改善が必要です。特に本番環境での使用を想定する場合、現在の設計では**データロスや予期しない上書きのリスク**が高く、追加の安全機構の実装が不可欠です。

---

*最終更新: 2025-09-05*
*調査者: Claude Code*