// AWS Parameter Store パラメータの基本定義
export interface Parameter {
  name: string; // パラメータ名（/で始まる階層形式）
  value: string; // パラメータ値
  type: 'String' | 'SecureString' | 'StringList'; // パラメータタイプ（String、SecureString、または StringList）
  description: string; // パラメータの説明
  kmsKeyId: string; // KMS暗号化キーID（SecureString使用時）
  tags: Array<{ key: string; value: string }>; // パラメータに関連付けるタグ
}

// Parameter Store から取得したパラメータ情報（メタデータ付き）
export interface ParameterFromStore extends Parameter {
  lastModifiedDate: Date; // 最終更新日時
  lastModifiedUser: string; // 最終更新ユーザー
  version: number; // パラメータバージョン番号
}

// パラメータ同期操作のオプション設定
export interface SyncOptions {
  dryRun: boolean; // ドライランモード（実際の変更を行わない）
  region?: string; // AWS リージョン
  profile?: string; // AWS プロファイル名
  pathPrefix?: string; // パラメータパスのプレフィックス（フィルタリング用）
  recursive?: boolean; // 再帰的検索を有効にするか
}

// パラメータエクスポート操作のオプション設定
export interface ExportOptions {
  region?: string; // AWS リージョン
  profile?: string; // AWS プロファイル名
  pathPrefix?: string; // エクスポート対象のパスプレフィックス
  recursive?: boolean; // 再帰的検索を有効にするか
  outputFile?: string; // 出力ファイル名
  includeSecureStrings?: boolean; // SecureStringパラメータを含めるか
  decryptSecureStrings?: boolean; // SecureStringの値を復号化するか
}

// 同期操作の実行結果統計
export interface SyncResult {
  success: number; // 成功したパラメータ数
  failed: number; // 失敗したパラメータ数
  updated: number; // 更新されたパラメータ数
  skipped: number; // スキップされたパラメータ数
  deleted: number; // 削除されたパラメータ数
  errors: string[]; // エラーメッセージリスト
}

// パラメータの変更操作情報
export interface ParameterChange {
  type: 'create' | 'update' | 'delete' | 'skip'; // 変更の種類
  parameter: Parameter; // 対象パラメータ
  existing: ParameterFromStore | null; // 既存のパラメータ（更新・削除時）
  reason: string; // 変更理由またはスキップ理由
}

/**
 * 差分比較の結果
 * パラメータの変更操作を詳細と統計の両方で管理
 */
export interface DiffResult {
  changes: ParameterChange[]; // 変更操作の詳細リスト
  summary: {
    create: number; // 作成予定数
    update: number; // 更新予定数
    delete: number; // 削除予定数
    skip: number; // スキップ予定数
  };
}

// CSV行データの標準レコード型
export interface CSVRecord {
  name: string; // パラメータ名
  value: string; // パラメータ値
  type: string; // パラメータタイプ
  description?: string; // パラメータ説明
  kmsKeyId?: string; // KMS Key ID
  tags?: string; // タグ文字列
  [key: string]: string | undefined; // その他の動的プロパティ
}

// ログレベルの定義
export type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'debug';

// CSVテンプレート生成のオプション設定
export interface TemplateOptions {
  outputPath?: string; // テンプレートファイルの出力パス
  includeExamples?: boolean; // サンプルデータを含めるか
}

// AWS設定オプション
export interface AWSConfigOptions {
  region?: string; // AWS リージョン
  profile?: string; // AWS プロファイル名
}

// AWS認証コンテキスト情報
export interface AWSContext {
  account: string; // AWSアカウントID
  region: string; // AWS リージョン
  arn: string; // ユーザーARN
  profile?: string; // プロファイル名
}

// KMS Key ID の種類
export type KmsKeyIdType = 'key-id' | 'alias' | 'arn';

// バリデーション結果
export interface ValidationResult {
  isValid: boolean; // バリデーション成功フラグ
  error: string; // エラーメッセージ
}