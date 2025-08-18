import { CSVService } from '../../src/services/csv.service';
import { ParameterFromStore } from '../../src/types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * CSVService 単体テスト
 * AWS Parameter StoreとCSVファイル間の変換・検証機能をテスト
 * - CSVパース：ファイル読み取りとパラメータオブジェクト変換
 * - CSVエクスポート：パラメータオブジェクトからCSVファイル生成
 * - テンプレート生成：サンプルCSVファイル作成
 * - バリデーション：CSVファイル内容の妥当性チェック
 */
describe('CSVService', () => {
  let csvService: CSVService;
  let tempDir: string;

  beforeEach(() => {
    csvService = new CSVService();
    // テスト用一時ディレクトリを作成
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-service-test-'));
  });

  afterEach(() => {
    // テスト後のクリーンアップ
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // CSVファイル読み込みとパラメータ変換のテスト
  describe('parseParametersFromCSV', () => {
    it('正常なCSVファイルを正しく解析できること', async () => {
      const csvContent = [
        'name,value,type,description,kmsKeyId,tags',
        '/app/database/host,localhost,String,Database host,,Environment=dev,Project=myapp',
        '/app/database/password,secret123,SecureString,Database password,alias/key,Environment=dev'
      ].join('\n');

      const csvFilePath = path.join(tempDir, 'valid.csv');
      fs.writeFileSync(csvFilePath, csvContent);

      const parameters = await csvService.parseParametersFromCSV(csvFilePath);

      expect(parameters).toHaveLength(2);
      expect(parameters[0]).toEqual({
        name: '/app/database/host',
        value: 'localhost',
        type: 'String',
        description: 'Database host',
        kmsKeyId: '',
        tags: [{ key: 'Environment', value: 'dev' }]
      });
      expect(parameters[1]).toEqual({
        name: '/app/database/password',
        value: 'secret123',
        type: 'SecureString',
        description: 'Database password',
        kmsKeyId: 'alias/key',
        tags: [{ key: 'Environment', value: 'dev' }]
      });
    });

    it('存在しないファイルでエラーを投げること', async () => {
      await expect(csvService.parseParametersFromCSV('/nonexistent/file.csv'))
        .rejects.toThrow('CSV file not found');
    });

    it('空の値を適切に拒否すること', async () => {
      const csvContent = [
        'name,value,type,description,kmsKeyId,tags',
        '/app/empty,,String,,,',
      ].join('\n');

      const csvFilePath = path.join(tempDir, 'empty.csv');
      fs.writeFileSync(csvFilePath, csvContent);

      await expect(csvService.parseParametersFromCSV(csvFilePath))
        .rejects.toThrow('Value is empty');
    });

    it('パラメータ名の形式を検証すること', async () => {
      const csvContent = [
        'name,value,type,description',
        'invalid-name,value,String,Description'
      ].join('\n');

      const csvFilePath = path.join(tempDir, 'invalid.csv');
      fs.writeFileSync(csvFilePath, csvContent);

      await expect(csvService.parseParametersFromCSV(csvFilePath))
        .rejects.toThrow("Parameter name must start with '/'");
    });

    it('パラメータタイプの妥当性を検証すること', async () => {
      const csvContent = [
        'name,value,type,description',
        '/app/test,value,InvalidType,Description'
      ].join('\n');

      const csvFilePath = path.join(tempDir, 'invalid-type.csv');
      fs.writeFileSync(csvFilePath, csvContent);

      await expect(csvService.parseParametersFromCSV(csvFilePath))
        .rejects.toThrow("Invalid parameter type 'InvalidType'. Must be one of: String, SecureString, StringList");
    });

    it('パラメータ名の長さ制限（500文字）を強制すること', async () => {
      const longName = '/' + 'a'.repeat(500); // 501 characters total
      const csvContent = [
        'name,value,type,description',
        `${longName},value,String,Description`
      ].join('\n');

      const csvFilePath = path.join(tempDir, 'long-name.csv');
      fs.writeFileSync(csvFilePath, csvContent);

      await expect(csvService.parseParametersFromCSV(csvFilePath))
        .rejects.toThrow("Parameter name exceeds maximum length of 500 characters: 501");
    });

    it('説明文の長さ制限（500文字）を強制すること', async () => {
      const longDescription = 'a'.repeat(501);
      const csvContent = [
        'name,value,type,description',
        `/app/test,value,String,${longDescription}`
      ].join('\n');

      const csvFilePath = path.join(tempDir, 'long-description.csv');
      fs.writeFileSync(csvFilePath, csvContent);

      await expect(csvService.parseParametersFromCSV(csvFilePath))
        .rejects.toThrow("Parameter description exceeds maximum length of 500 characters: 501");
    });

    it('タグキー・値の長さ制限（128文字）を強制すること', async () => {
      const longKey = 'a'.repeat(129);
      const csvContent = [
        'name,value,type,description,kmsKeyId,tags',
        `/app/test,value,String,Description,,${longKey}=value`
      ].join('\n');

      const csvFilePath = path.join(tempDir, 'long-tag-key.csv');
      fs.writeFileSync(csvFilePath, csvContent);

      await expect(csvService.parseParametersFromCSV(csvFilePath))
        .rejects.toThrow("Tag key exceeds maximum length: 129 characters (maximum allowed: 128)");
    });

    it('CSV行数制限（500行）を強制すること', async () => {
      const headers = 'name,value,type,description';
      const rows = Array.from({ length: 501 }, (_, i) => 
        `/app/test${i + 1},value${i + 1},String,Description ${i + 1}`
      );
      const csvContent = [headers, ...rows].join('\n');

      const csvFilePath = path.join(tempDir, 'too-many-rows.csv');
      fs.writeFileSync(csvFilePath, csvContent);

      await expect(csvService.parseParametersFromCSV(csvFilePath))
        .rejects.toThrow("CSV file exceeds maximum row limit: 501 rows (maximum allowed: 500). Please split the file into smaller chunks.");
    });

    it('StringListパラメータタイプをサポートすること', async () => {
      const csvContent = [
        'name,value,type,description',
        '/app/list,item1;item2;item3,StringList,List of items'
      ].join('\n');

      const csvFilePath = path.join(tempDir, 'stringlist.csv');
      fs.writeFileSync(csvFilePath, csvContent);

      const parameters = await csvService.parseParametersFromCSV(csvFilePath);

      expect(parameters).toHaveLength(1);
      expect(parameters[0]).toEqual({
        name: '/app/list',
        value: 'item1;item2;item3',
        type: 'StringList',
        description: 'List of items',
        kmsKeyId: '',
        tags: []
      });
    });
  });

  // Parameter StoreデータをCSVファイルにエクスポートするテスト
  describe('exportParametersToCSV', () => {
    it('パラメータをCSVファイルに正しくエクスポートできること', async () => {
      const parameters: ParameterFromStore[] = [
        {
          name: '/app/database/host',
          value: 'localhost',
          type: 'String',
          description: 'Database host',
          kmsKeyId: '',
          lastModifiedDate: new Date('2023-01-01'),
          lastModifiedUser: 'test-user',
          version: 1,
          tags: [{ key: 'Environment', value: 'dev' }]
        },
        {
          name: '/app/database/password',
          value: 'secret123',
          type: 'SecureString',
          description: 'Database password',
          kmsKeyId: 'alias/key',
          lastModifiedDate: new Date('2023-01-02'),
          lastModifiedUser: 'test-user',
          version: 2,
          tags: [{ key: 'Environment', value: 'prod' }, { key: 'Sensitive', value: 'true' }]
        }
      ];

      const outputFile = path.join(tempDir, 'export.csv');
      await csvService.exportParametersToCSV(parameters, outputFile);

      expect(fs.existsSync(outputFile)).toBe(true);

      const content = fs.readFileSync(outputFile, 'utf8');
      expect(content).toContain('/app/database/host');
      expect(content).toContain('localhost');
      expect(content).toContain('Environment=dev');
      expect(content).toContain('Environment=prod,Sensitive=true');
    });
  });

  // CSVテンプレートファイルの生成テスト
  describe('generateTemplate', () => {
    it('デフォルトでサンプル付きテンプレートを生成すること', async () => {
      const templatePath = path.join(tempDir, 'template.csv');
      await csvService.generateTemplate(templatePath);

      expect(fs.existsSync(templatePath)).toBe(true);

      const content = fs.readFileSync(templatePath, 'utf8');
      expect(content).toContain('name,value,type,description,kmsKeyId,tags');
      expect(content).toContain('/myapp/database/host');
      expect(content).toContain('localhost');
    });

    it('指定時にサンプルなしテンプレートを生成すること', async () => {
      const templatePath = path.join(tempDir, 'template-no-examples.csv');
      await csvService.generateTemplate(templatePath, { includeExamples: false });

      expect(fs.existsSync(templatePath)).toBe(true);

      const content = fs.readFileSync(templatePath, 'utf8');
      expect(content).toContain('name,value,type,description,kmsKeyId,tags');
      expect(content).not.toContain('localhost');
    });

    it('ディレクトリが存在しない場合に作成すること', async () => {
      const nestedPath = path.join(tempDir, 'nested', 'dir', 'template.csv');
      await csvService.generateTemplate(nestedPath);

      expect(fs.existsSync(nestedPath)).toBe(true);
    });
  });

  // CSVファイルのバリデーションテスト
  describe('validateCSVFile', () => {
    it('正しいCSVファイルを検証すること', async () => {
      const csvContent = [
        'name,value,type,description',
        '/app/test,value,String,Test parameter'
      ].join('\n');

      const csvFilePath = path.join(tempDir, 'valid.csv');
      fs.writeFileSync(csvFilePath, csvContent);

      const result = await csvService.validateCSVFile(csvFilePath);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('バリデーションエラーを検出すること', async () => {
      const csvContent = [
        'name,value,type,description',
        'invalid-name,value,String,Test parameter',
        '/app/empty,,String,Test parameter',
        '/app/invalid-type,value,InvalidType,Test parameter'
      ].join('\n');

      const csvFilePath = path.join(tempDir, 'invalid.csv');
      fs.writeFileSync(csvFilePath, csvContent);

      const result = await csvService.validateCSVFile(csvFilePath);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(error => error.includes("Parameter name must start with '/'"))).toBe(true);
      expect(result.errors.some(error => error.includes("Value is empty"))).toBe(true);
      expect(result.errors.some(error => error.includes("Invalid parameter type"))).toBe(true);
    });

    it('存在しないファイルを適切に処理すること', async () => {
      const result = await csvService.validateCSVFile('nonexistent-file.csv');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('CSV file not found at path: nonexistent-file.csv');
    });
  });
});