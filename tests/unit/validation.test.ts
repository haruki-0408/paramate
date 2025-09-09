import { ValidationUtils } from '../../src/utils/validation';
import { CSVRecord } from '../../src/types';

/**
 * ValidationUtils 単体テスト
 * CSVデータのバリデーション機能をテスト：
 * - パラメータ名、値、タイプの形式検証
 * - 長さ制限（名前500文字、説明500文字、タグ128文字）のチェック
 * - 無効な文字、空値、パターンマッチングの検証
 * - CSV行数制限のチェック
 */
describe('ValidationUtils', () => {
  describe('validateCSVRecord', () => {
    it('正しいレコードを正常に検証すること', () => {
      const record: CSVRecord = {
        name: '/app/test',
        value: 'test-value',
        type: 'String',
        description: 'Test parameter',
        kmsKeyId: '',
        tags: 'Environment=dev,Project=myapp'
      };

      const result = ValidationUtils.validateCSVRecord(record, 2);

      expect(result.isValid).toBe(true);
      expect(result.parameter).toEqual({
        name: '/app/test',
        value: 'test-value',
        type: 'String',
        description: 'Test parameter',
        kmsKeyId: '',
        tags: [
          { key: 'Environment', value: 'dev' },
          { key: 'Project', value: 'myapp' }
        ]
      });
      expect(result.errors).toEqual([]);
    });

    it('空のパラメータ名を拒否すること', () => {
      const record: CSVRecord = {
        name: '',
        value: 'test-value',
        type: 'String'
      };

      const result = ValidationUtils.validateCSVRecord(record, 2);

      expect(result.isValid).toBe(false);
      expect(result.parameter).toBeNull();
      expect(result.errors).toContain('Line 2: Parameter name cannot be empty');
    });

    it('スラッシュで始まらないパラメータ名を拒否すること', () => {
      const record: CSVRecord = {
        name: 'invalid-name',
        value: 'test-value',
        type: 'String'
      };

      const result = ValidationUtils.validateCSVRecord(record, 2);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Line 2: Parameter name must start with '/'");
    });

    it('パラメータ名の長さ制限を強制すること', () => {
      const longName = '/' + 'a'.repeat(500); // 501 characters
      const record: CSVRecord = {
        name: longName,
        value: 'test-value',
        type: 'String'
      };

      const result = ValidationUtils.validateCSVRecord(record, 2);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Line 2: Parameter name exceeds maximum length of 500 characters: 501');
    });

    it('無効なパラメータ名文字を拒否すること', () => {
      const record: CSVRecord = {
        name: '/app/test@invalid',
        value: 'test-value',
        type: 'String'
      };

      const result = ValidationUtils.validateCSVRecord(record, 2);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Line 2: Parameter name contains invalid characters. Only alphanumeric, underscore, period, hyphen, and forward slash are allowed');
    });

    it('空の値を拒否すること', () => {
      const record: CSVRecord = {
        name: '/app/test',
        value: '',
        type: 'String'
      };

      const result = ValidationUtils.validateCSVRecord(record, 2);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Line 2: Value is empty');
    });

    it('無効なパラメータタイプを拒否すること', () => {
      const record: CSVRecord = {
        name: '/app/test',
        value: 'test-value',
        type: 'InvalidType'
      };

      const result = ValidationUtils.validateCSVRecord(record, 2);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Line 2: Invalid parameter type 'InvalidType'. Must be one of: String, SecureString, StringList");
    });

    it('すべてのパラメータタイプを検証すること', () => {
      ['String', 'SecureString', 'StringList'].forEach(type => {
        const record: CSVRecord = {
          name: '/app/test',
          value: 'test-value',
          type
        };

        const result = ValidationUtils.validateCSVRecord(record, 2);

        expect(result.isValid).toBe(true);
        expect(result.parameter?.type).toBe(type);
      });
    });

    it('説明文の長さ制限を強制すること', () => {
      const longDescription = 'a'.repeat(501);
      const record: CSVRecord = {
        name: '/app/test',
        value: 'test-value',
        type: 'String',
        description: longDescription
      };

      const result = ValidationUtils.validateCSVRecord(record, 2);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Line 2: Parameter description exceeds maximum length of 500 characters: 501');
    });

    it('タグキーの長さ制限を強制すること', () => {
      const longKey = 'a'.repeat(129);
      const record: CSVRecord = {
        name: '/app/test',
        value: 'test-value',
        type: 'String',
        tags: `${longKey}=value`
      };

      const result = ValidationUtils.validateCSVRecord(record, 2);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Line 2: Tag key exceeds maximum length: 129 characters (maximum allowed: 128)');
    });

    it('タグ値の長さ制限を強制すること', () => {
      const longValue = 'a'.repeat(129);
      const record: CSVRecord = {
        name: '/app/test',
        value: 'test-value',
        type: 'String',
        tags: `key=${longValue}`
      };

      const result = ValidationUtils.validateCSVRecord(record, 2);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Line 2: Tag value exceeds maximum length: 129 characters (maximum allowed: 128)');
    });

    it('無効なタグ形式を拒否すること', () => {
      const record: CSVRecord = {
        name: '/app/test',
        value: 'test-value',
        type: 'String',
        tags: 'invalid-tag-format'
      };

      const result = ValidationUtils.validateCSVRecord(record, 2);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Line 2: Invalid tag format 'invalid-tag-format'. Expected format: 'key=value'");
    });

    it('複数のバリデーションエラーを適切に処理すること', () => {
      const record: CSVRecord = {
        name: 'invalid-name',
        value: '',
        type: 'InvalidType'
      };

      const result = ValidationUtils.validateCSVRecord(record, 2);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
      expect(result.errors).toContain("Line 2: Parameter name must start with '/'");
      expect(result.errors).toContain('Line 2: Value is empty');
      expect(result.errors).toContain("Line 2: Invalid parameter type 'InvalidType'. Must be one of: String, SecureString, StringList");
    });

    it('空のオプションフィールドを適切に処理すること', () => {
      const record: CSVRecord = {
        name: '/app/test',
        value: 'test-value',
        type: 'String'
        // description, kmsKeyId, tags are undefined
      };

      const result = ValidationUtils.validateCSVRecord(record, 2);

      expect(result.isValid).toBe(true);
      expect(result.parameter).toEqual({
        name: '/app/test',
        value: 'test-value',
        type: 'String',
        description: '',
        kmsKeyId: '',
        tags: []
      });
    });
  });

  // CSV行数制限のバリデーションテスト
  describe('validateRowCount', () => {
    it('制限内の行数でバリデーションを通すこと', () => {
      const result = ValidationUtils.validateRowCount(500);

      expect(result.isValid).toBe(true);
      expect(result.error).toBe('');
    });

    it('制限を超える行数を拒否すること', () => {
      const result = ValidationUtils.validateRowCount(501);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('CSV file exceeds maximum row limit: 501 rows (maximum allowed: 500). Please split the file into smaller chunks.');
    });

    it('カスタム最大行数制限を受け入れること', () => {
      const result = ValidationUtils.validateRowCount(600, 1000);

      expect(result.isValid).toBe(true);
    });

    it('カスタム最大行数制限を超える場合に拒否すること', () => {
      const result = ValidationUtils.validateRowCount(1001, 1000);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('CSV file exceeds maximum row limit: 1001 rows (maximum allowed: 1000). Please split the file into smaller chunks.');
    });
  });
});