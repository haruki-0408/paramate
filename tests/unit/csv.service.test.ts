import { CSVService } from '../../src/services/csv.service';
import { Parameter, ParameterFromStore } from '../../src/types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('CSVService', () => {
  let csvService: CSVService;
  let tempDir: string;

  beforeEach(() => {
    csvService = new CSVService();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-service-test-'));
  });

  afterEach(() => {
    // Clean up temp files
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('parseParametersFromCSV', () => {
    it('should parse valid CSV file successfully', async () => {
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
        kmsKeyId: undefined,
        tags: [{ key: 'Environment', value: 'dev' }, { key: 'Project', value: 'myapp' }]
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

    it('should throw error for missing file', async () => {
      await expect(csvService.parseParametersFromCSV('/nonexistent/file.csv'))
        .rejects.toThrow('CSVファイルが見つかりません');
    });

    it('should handle empty values gracefully', async () => {
      const csvContent = [
        'name,value,type,description,kmsKeyId,tags',
        '/app/empty,,String,,,',
        '/app/defaults,value,,,,'
      ].join('\n');

      const csvFilePath = path.join(tempDir, 'empty.csv');
      fs.writeFileSync(csvFilePath, csvContent);

      const parameters = await csvService.parseParametersFromCSV(csvFilePath);

      expect(parameters).toHaveLength(1); // Empty value should be skipped
      expect(parameters[0]).toEqual({
        name: '/app/defaults',
        value: 'value',
        type: 'String',
        description: undefined,
        kmsKeyId: undefined,
        tags: undefined
      });
    });

    it('should validate parameter names', async () => {
      const csvContent = [
        'name,value,type,description',
        'invalid-name,value,String,Description'
      ].join('\n');

      const csvFilePath = path.join(tempDir, 'invalid.csv');
      fs.writeFileSync(csvFilePath, csvContent);

      await expect(csvService.parseParametersFromCSV(csvFilePath))
        .rejects.toThrow("パラメータ名は '/' で始まる必要があります");
    });

    it('should validate parameter types', async () => {
      const csvContent = [
        'name,value,type,description',
        '/app/test,value,InvalidType,Description'
      ].join('\n');

      const csvFilePath = path.join(tempDir, 'invalid-type.csv');
      fs.writeFileSync(csvFilePath, csvContent);

      await expect(csvService.parseParametersFromCSV(csvFilePath))
        .rejects.toThrow("無効なパラメータタイプ: InvalidType");
    });
  });

  describe('exportParametersToCSV', () => {
    it('should export parameters to CSV successfully', async () => {
      const parameters: ParameterFromStore[] = [
        {
          name: '/app/database/host',
          value: 'localhost',
          type: 'String',
          description: 'Database host',
          lastModifiedDate: new Date('2023-01-01'),
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

  describe('generateTemplate', () => {
    it('should generate template with examples by default', async () => {
      const templatePath = path.join(tempDir, 'template.csv');
      await csvService.generateTemplate(templatePath);

      expect(fs.existsSync(templatePath)).toBe(true);

      const content = fs.readFileSync(templatePath, 'utf8');
      expect(content).toContain('name,value,type,description,kmsKeyId,tags');
      expect(content).toContain('/myapp/database/host');
      expect(content).toContain('localhost');
    });

    it('should generate template without examples when specified', async () => {
      const templatePath = path.join(tempDir, 'template-no-examples.csv');
      await csvService.generateTemplate(templatePath, { includeExamples: false });

      expect(fs.existsSync(templatePath)).toBe(true);

      const content = fs.readFileSync(templatePath, 'utf8');
      expect(content).toContain('name,value,type,description,kmsKeyId,tags');
      expect(content).not.toContain('localhost');
    });

    it('should create directory if it does not exist', async () => {
      const nestedPath = path.join(tempDir, 'nested', 'dir', 'template.csv');
      await csvService.generateTemplate(nestedPath);

      expect(fs.existsSync(nestedPath)).toBe(true);
    });
  });

  describe('validateCSVFile', () => {
    it('should validate correct CSV file', async () => {
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

    it('should detect validation errors', async () => {
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
      expect(result.errors.some(error => error.includes("パラメータ名は '/' で始まる必要があります"))).toBe(true);
      expect(result.errors.some(error => error.includes("値が空です"))).toBe(true);
      expect(result.errors.some(error => error.includes("無効なパラメータタイプ"))).toBe(true);
    });

    it('should handle non-existent file', async () => {
      const result = await csvService.validateCSVFile('/nonexistent/file.csv');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('ファイルが存在しません: /nonexistent/file.csv');
    });
  });
});