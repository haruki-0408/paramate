/**
 * アプリケーション定数と設定値
 */

// AWS Parameter Store制限値定数
export const VALIDATION_LIMITS = {
  PARAMETER_NAME_MAX_LENGTH: 500, // パラメータ名の最大長（AWS Parameter Store制限）
  PARAMETER_DESCRIPTION_MAX_LENGTH: 500, // パラメータ説明の最大長
  TAG_KEY_MAX_LENGTH: 128, // タグキーの最大長
  TAG_VALUE_MAX_LENGTH: 128, // タグ値の最大長
  CSV_MAX_ROWS: 500 // CSVファイルで許可される最大行数
} as const;

// AWS API制限値定数
export const AWS_LIMITS = {
  PARAMETER_STORE_MAX_RESULTS: 10, // Parameter Store API呼び出しのページあたり最大結果数
  BATCH_OPERATION_MAX_SIZE: 10 // 単一バッチ操作での最大パラメータ数
} as const;

// ファイルパス関連の定数
export const FILE_PATHS = {
  DEFAULT_TEMPLATE_NAME: 'sample_template.csv', // デフォルトテンプレートファイル名
  ALLOWED_CSV_EXTENSIONS: ['.csv'] as const // CSVファイルで許可される拡張子
} as const;

// パラメータタイプ定数
export const PARAMETER_TYPES = {
  STRING: 'String',
  SECURE_STRING: 'SecureString',
  STRING_LIST: 'StringList'
} as const;

/**
 * KMS Key ID形式の検証パターン
 * AWS KMSでサポートされている3つの形式を定義
 */
export const KMS_KEY_PATTERNS = {
  KEY_ID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // UUID形式
  ALIAS: /^alias\/[a-zA-Z0-9\/_-]+$/, // エイリアス形式（例: alias/my-key）
  ARN: /^arn:aws:kms:[a-z0-9-]+:\d{12}:key\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i // ARN形式
} as const;

/**
 * セキュリティ関連の定数
 * パストラバーサル攻撃やその他のセキュリティ脆弱性を防ぐための設定
 */
export const SECURITY = {
  MAX_PATH_DEPTH: 20, // ファイル操作で許可される最大パス深度（テスト環境考慮）
  PARAMETER_NAME_PATTERN: /^[a-zA-Z0-9_./-]*$/, // パラメータ名で許可される文字（AWS Parameter Store要件）
  /**
   * 危険なパスパターンの検出用正規表現
   * 必要最小限のセキュリティチェックのみ実施
   */
  DANGEROUS_PATH_PATTERNS: [
    /\.\.\//, // パストラバーサル攻撃（../ パターン）
    /\0/, // NULバイト注入攻撃
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i // Windowsデバイス名
  ] as const
} as const;

/**
 * AWS APIのRate Limit対応設定
 */
export const RATE_LIMIT_CONFIG = {
  // パラメータ投入処理の設定（デフォルトでより保守的に）
  PUT_CONCURRENT_LIMIT: 1, // 並行処理数を1に減らす（完全シーケンシャル実行）
  PUT_BATCH_DELAY_MS: 1000, // バッチ間の待機時間を1秒に増加
  PUT_REQUEST_DELAY_MS: 250, // 個別リクエスト間の待機時間を250msに増加
  
  
  // リトライ設定
  MAX_RETRY_ATTEMPTS: 10, // 最大リトライ回数を10回に増加
  INITIAL_RETRY_DELAY_MS: 1500, // 初回リトライ待機時間を1.5秒に増加
  MAX_RETRY_DELAY_MS: 60000, // 最大リトライ待機時間を60秒に増加
  RETRY_BACKOFF_MULTIPLIER: 2, // 待機時間の倍率（指数バックオフ）
  
  // エクスポート処理の設定（より保守的に）
  EXPORT_CONCURRENT_LIMIT: 3, // エクスポート処理の並行数を3に減らす
  EXPORT_BATCH_DELAY_MS: 500, // エクスポート処理のバッチ間待機時間を500msに増加
} as const;