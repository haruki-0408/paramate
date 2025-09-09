import * as path from 'path';
import { CSVRecord } from '../types';
import { KMS_KEY_PATTERNS, PARAMETER_TYPES, SECURITY, VALIDATION_LIMITS } from '../config/constants';

// バリデーション結果の基本インターフェース
interface ValidationResult {
  isValid: boolean;
  error: string;
}

/**
 * CSVレコードのバリデーション結果を表すインターフェース
 * バリデーション成功時はParameterオブジェクト、失敗時はエラーメッセージを返す
 */
export interface ParameterValidationResult {
  isValid: boolean; // バリデーション成功フラグ
  parameter: { // バリデーション成功時のParameterオブジェクト
    name: string;
    value: string;
    type: 'String' | 'SecureString' | 'StringList';
    description: string;
    kmsKeyId: string;
    tags: Array<{ key: string; value: string }>;
  } | null; // バリデーション失敗時はnull
  errors: string[]; // エラーメッセージの配列
}

/**
 * パラメータデータのバリデーションを担当するユーティリティクラス
 * AWS Parameter Storeの制限やセキュリティ要件に基づいた検証を実行
 */
export class ValidationUtils {
  /**
   * CSVレコードの包括的バリデーションを実行
   * パラメータ名、値、タイプ、説明、KMSキー、タグの全てをチェック
   * AWS Parameter Storeの制限値を遵守しているか確認
   */
  public static validateCSVRecord(record: CSVRecord, lineNumber: number): ParameterValidationResult {
    const errors: string[] = [];

    // 必須フィールドのチェック
    if (!record.name || record.name.trim() === '') {
      errors.push(`Line ${lineNumber}: Parameter name cannot be empty`);
      return { isValid: false, parameter: null, errors };
    }

    if (record.value === undefined || record.value === null || record.value.trim() === '') {
      errors.push(`Line ${lineNumber}: Value is empty`);
    }

    // StringList型の値検証（空要素を含む場合は失敗）
    const type = record.type || PARAMETER_TYPES.STRING;
    if (type === PARAMETER_TYPES.STRING_LIST && record.value && record.value.trim() !== '') {
      const listItems = record.value.split(',');
      const hasEmptyElements = listItems.some(item => item.trim() === '');
      if (hasEmptyElements) {
        errors.push(`Line ${lineNumber}: StringList type cannot contain empty elements. Found in value: "${record.value}"`);
      }
    }

    // パラメータ名のバリデーション
    const name = record.name.trim();
    const nameValidation = this.validateParameterName(name);
    if (!nameValidation.isValid) {
      errors.push(`Line ${lineNumber}: ${nameValidation.error}`);
    }

    if (name.length > VALIDATION_LIMITS.PARAMETER_NAME_MAX_LENGTH) {
      errors.push(`Line ${lineNumber}: Parameter name exceeds maximum length of ${VALIDATION_LIMITS.PARAMETER_NAME_MAX_LENGTH} characters: ${name.length}`);
    }

    // タイプのバリデーション
    const validTypes: string[] = [PARAMETER_TYPES.STRING, PARAMETER_TYPES.SECURE_STRING, PARAMETER_TYPES.STRING_LIST];
    if (!validTypes.includes(type)) {
      errors.push(`Line ${lineNumber}: Invalid parameter type '${type}'. Must be one of: ${validTypes.join(', ')}`);
    }

    // 説明のバリデーション
    const description = record.description || '';
    if (description.length > VALIDATION_LIMITS.PARAMETER_DESCRIPTION_MAX_LENGTH) {
      errors.push(`Line ${lineNumber}: Parameter description exceeds maximum length of ${VALIDATION_LIMITS.PARAMETER_DESCRIPTION_MAX_LENGTH} characters: ${description.length}`);
    }

    // KMS Key IDのバリデーション
    const kmsKeyId = record.kmsKeyId || '';
    if (kmsKeyId && !this.validateKmsKeyId(kmsKeyId).isValid) {
      const kmsValidation = this.validateKmsKeyId(kmsKeyId);
      errors.push(`Line ${lineNumber}: ${kmsValidation.error}`);
    }

    // タグの解析とバリデーション
    let tags: Array<{ key: string; value: string }> = [];
    if (record.tags && record.tags.trim() !== '') {
      try {
        tags = this.parseTags(record.tags);
      } catch (error) {
        errors.push(`Line ${lineNumber}: ${error instanceof Error ? error.message : 'Failed to parse tags'}`);
      }
    }

    // エラーがある場合はパラメータオブジェクトなしで返す
    if (errors.length > 0) {
      return { isValid: false, parameter: null, errors };
    }

    // バリデーション成功時はパラメータオブジェクトを返す
    return {
      isValid: true,
      parameter: {
        name,
        value: record.value || '',
        type: type as 'String' | 'SecureString' | 'StringList',
        description,
        kmsKeyId,
        tags
      },
      errors: []
    };
  }

  // CSV行数制限のチェック
  public static validateRowCount(rowCount: number, maxRows: number = VALIDATION_LIMITS.CSV_MAX_ROWS): ValidationResult {
    if (rowCount > maxRows) {
      return {
        isValid: false,
        error: `CSV file exceeds maximum row limit: ${rowCount} rows (maximum allowed: ${maxRows}). Please split the file into smaller chunks.`
      };
    }
    return { isValid: true, error: '' };
  }

  // タグの解析とバリデーション
  private static parseTags(tagsString: string): Array<{ key: string; value: string }> {
    const tags = tagsString.split(',').map(tag => {
      const [key, value] = tag.split('=');
      if (!key || value === undefined) {
        throw new Error(`Invalid tag format '${tag}'. Expected format: 'key=value'`);
      }

      const trimmedKey = key.trim();
      const trimmedValue = value.trim();

      // タグキー・値の長さチェック
      if (trimmedKey.length > VALIDATION_LIMITS.TAG_KEY_MAX_LENGTH) {
        throw new Error(`Tag key exceeds maximum length: ${trimmedKey.length} characters (maximum allowed: ${VALIDATION_LIMITS.TAG_KEY_MAX_LENGTH})`);
      }
      if (trimmedValue.length > VALIDATION_LIMITS.TAG_VALUE_MAX_LENGTH) {
        throw new Error(`Tag value exceeds maximum length: ${trimmedValue.length} characters (maximum allowed: ${VALIDATION_LIMITS.TAG_VALUE_MAX_LENGTH})`);
      }

      return { key: trimmedKey, value: trimmedValue };
    });

    return tags;
  }

  /**
   * ファイルパスの安全性を検証する
   * パストラバーサル攻撃対策として危険なパスパターンをチェックし、
   * 正規化後も安全性を確認する
   */
  public static validateFilePath(filePath: string): ValidationResult {
    if (!filePath || typeof filePath !== 'string') {
      return { isValid: false, error: 'Invalid file path provided' };
    }

    // 危険なパスパターンをチェック
    for (const pattern of SECURITY.DANGEROUS_PATH_PATTERNS) {
      if (pattern.test(filePath)) {
        return {
          isValid: false,
          error: `File path contains dangerous pattern: ${filePath}`
        };
      }
    }

    try {
      // パスを正規化
      const normalizedPath = path.normalize(filePath);

      // 正規化後も危険なパターンをチェック
      for (const pattern of SECURITY.DANGEROUS_PATH_PATTERNS) {
        if (pattern.test(normalizedPath)) {
          return {
            isValid: false,
            error: `Normalized file path contains dangerous pattern: ${normalizedPath}`
          };
        }
      }

      // パス深度をチェック
      const pathParts = normalizedPath.split(path.sep);
      if (pathParts.length > SECURITY.MAX_PATH_DEPTH) {
        return {
          isValid: false,
          error: `File path exceeds maximum depth of ${SECURITY.MAX_PATH_DEPTH}: ${normalizedPath}`
        };
      }

      // 必要最小限のチェック：特定のシステムファイルへのアクセス制限のみ
      if (path.isAbsolute(normalizedPath)) {
        const restrictedPaths = ['/etc/passwd', '/etc/shadow', '/etc/hosts'];
        if (restrictedPaths.some(restricted => normalizedPath.startsWith(restricted))) {
          return {
            isValid: false,
            error: `Access to system files is not allowed: ${normalizedPath}`
          };
        }
      }

      return { isValid: true, error: '' };
    } catch (error) {
      return {
        isValid: false,
        error: `Error validating file path: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  // KMS Key IDの形式を検証する
  public static validateKmsKeyId(kmsKeyId: string): ValidationResult {
    if (!kmsKeyId || typeof kmsKeyId !== 'string') {
      return { isValid: false, error: 'KMS Key ID cannot be empty' };
    }

    const trimmedKeyId = kmsKeyId.trim();

    // 空文字チェック
    if (trimmedKeyId === '') {
      return { isValid: false, error: 'KMS Key ID cannot be empty' };
    }

    // パターンマッチング
    const { KEY_ID, ALIAS, ARN } = KMS_KEY_PATTERNS;

    if (KEY_ID.test(trimmedKeyId) || ALIAS.test(trimmedKeyId) || ARN.test(trimmedKeyId)) {
      return { isValid: true, error: '' };
    }

    return {
      isValid: false,
      error: 'KMS Key ID must be a valid UUID, alias (alias/name), or ARN format'
    };
  }

  // パラメータ名の安全性を検証する
  public static validateParameterName(name: string): ValidationResult {
    if (!name || typeof name !== 'string') {
      return { isValid: false, error: 'Parameter name cannot be empty' };
    }

    const trimmedName = name.trim();

    if (trimmedName === '') {
      return { isValid: false, error: 'Parameter name cannot be empty' };
    }

    if (!trimmedName.startsWith('/')) {
      return { isValid: false, error: 'Parameter name must start with \'/\'' };
    }

    if (!SECURITY.PARAMETER_NAME_PATTERN.test(trimmedName)) {
      return {
        isValid: false,
        error: 'Parameter name contains invalid characters. Only alphanumeric, underscore, period, hyphen, and forward slash are allowed'
      };
    }

    // 連続するスラッシュの検証
    if (trimmedName.includes('//')) {
      return {
        isValid: false,
        error: 'Parameter name cannot contain consecutive forward slashes (//)'
      };
    }

    // 末尾のスラッシュの検証（ルートパス以外）
    if (trimmedName.length > 1 && trimmedName.endsWith('/')) {
      return {
        isValid: false,
        error: 'Parameter name cannot end with a forward slash (/)'
      };
    }

    return { isValid: true, error: '' };
  }
}
