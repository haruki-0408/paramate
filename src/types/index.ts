/**
 * AWS Parameter Store パラメータの基本定義
 */
export interface Parameter {
  /** パラメータ名（/で始まる階層形式） */
  name: string;
  /** パラメータ値 */
  value: string;
  /** パラメータタイプ（String または SecureString） */
  type: 'String' | 'SecureString';
  /** パラメータの説明（オプション） */
  description?: string;
  /** KMS暗号化キーID（SecureString使用時） */
  kmsKeyId?: string;
  /** パラメータに関連付けるタグ */
  tags?: Array<{ key: string; value: string }>;
}

/**
 * Parameter Store から取得したパラメータ情報（メタデータ付き）
 */
export interface ParameterFromStore extends Parameter {
  /** 最終更新日時 */
  lastModifiedDate?: Date;
  /** 最終更新ユーザー */
  lastModifiedUser?: string;
  /** パラメータバージョン番号 */
  version?: number;
}

/**
 * パラメータ同期操作のオプション設定
 */
export interface SyncOptions {
  /** ドライランモード（実際の変更を行わない） */
  dryRun: boolean;
  /** AWS リージョン */
  region?: string;
  /** AWS プロファイル名 */
  profile?: string;
  /** パラメータパスのプレフィックス（フィルタリング用） */
  pathPrefix?: string;
  /** 再帰的検索を有効にするか */
  recursive?: boolean;
}

/**
 * パラメータエクスポート操作のオプション設定
 */
export interface ExportOptions {
  /** AWS リージョン */
  region?: string;
  /** AWS プロファイル名 */
  profile?: string;
  /** エクスポート対象のパスプレフィックス */
  pathPrefix?: string;
  /** 再帰的検索を有効にするか */
  recursive?: boolean;
  /** 出力ファイル名 */
  outputFile?: string;
  /** SecureStringパラメータを含めるか */
  includeSecureStrings?: boolean;
  /** SecureStringの値を復号化するか */
  decryptSecureStrings?: boolean;
}

/**
 * 同期操作の実行結果統計
 */
export interface SyncResult {
  /** 成功したパラメータ数 */
  success: number;
  /** 失敗したパラメータ数 */
  failed: number;
  /** 更新されたパラメータ数 */
  updated: number;
  /** スキップされたパラメータ数 */
  skipped: number;
  /** 削除されたパラメータ数 */
  deleted: number;
  /** エラーメッセージリスト */
  errors: string[];
}

/**
 * パラメータの変更操作情報
 */
export interface ParameterChange {
  /** 変更の種類 */
  type: 'create' | 'update' | 'delete' | 'skip';
  /** 対象パラメータ */
  parameter: Parameter;
  /** 既存のパラメータ（更新・削除時） */
  existing?: ParameterFromStore;
  /** 変更理由またはスキップ理由 */
  reason?: string;
}

/**
 * 差分比較の結果
 */
export interface DiffResult {
  /** 変更操作の詳細リスト */
  changes: ParameterChange[];
  /** 変更操作の統計サマリー */
  summary: {
    /** 作成予定数 */
    create: number;
    /** 更新予定数 */
    update: number;
    /** 削除予定数 */
    delete: number;
    /** スキップ予定数 */
    skip: number;
  };
}

/**
 * CSV行データの汎用レコード型
 */
export interface CSVRecord {
  /** CSVのカラム名をキーとした動的プロパティ */
  [key: string]: string;
}

/**
 * ログレベルの定義
 */
export type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'debug';

/**
 * CSVテンプレート生成のオプション設定
 */
export interface TemplateOptions {
  /** テンプレートファイルの出力パス */
  outputPath?: string;
  /** サンプルデータを含めるか */
  includeExamples?: boolean;
}
