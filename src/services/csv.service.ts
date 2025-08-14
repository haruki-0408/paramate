import * as fs from 'fs';
import * as path from 'path';
import csvParser from 'csv-parser';
import { createObjectCsvWriter } from 'csv-writer';
import { CSVRecord, Parameter, ParameterFromStore, TemplateOptions } from '../types';
import { Logger } from '../utils/logger';

export class CSVService {
  async parseParametersFromCSV(filePath: string): Promise<Parameter[]> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`CSV file not found: ${filePath}`);
    }

    const parameters: Parameter[] = [];
    const records: CSVRecord[] = [];

    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csvParser())
        .on('data', (record: CSVRecord) => {
          records.push(record);
        })
        .on('end', () => {
          try {
            for (let i = 0; i < records.length; i++) {
              const record = records[i];
              const parameter = this.validateAndParseParameterRecord(record, i + 2); // +2 because line 1 is header
              if (parameter) {
                parameters.push(parameter);
              }
            }

            Logger.info(`Read ${parameters.length} parameters from CSV`);
            resolve(parameters);
          } catch (error) {
            reject(error);
          }
        })
        .on('error', (error: Error) => {
          reject(new Error(`CSV read error: ${error.message}`));
        });
    });
  }

  private validateAndParseParameterRecord(record: CSVRecord, lineNumber: number): Parameter | null {
    // 必須フィールドのチェック
    if (!record.name || record.name.trim() === '') {
      Logger.warning(`Line ${lineNumber}: Parameter name is empty - skipping`);
      return null;
    }

    if (!record.value && record.value !== '') {
      Logger.warning(`Line ${lineNumber}: Value is empty - skipping`);
      return null;
    }

    // パラメータ名のバリデーション
    const name = record.name.trim();
    if (!name.startsWith('/')) {
      throw new Error(`Line ${lineNumber}: Parameter name must start with '/': ${name}`);
    }

    if (!/^[a-zA-Z0-9_./-]*$/.test(name)) {
      throw new Error(`Line ${lineNumber}: Parameter name contains invalid characters: ${name}`);
    }

    // タイプのバリデーション
    const type = record.type?.trim() || 'String';
    if (type !== 'String' && type !== 'SecureString') {
      throw new Error(`Line ${lineNumber}: Invalid parameter type: ${type}. Must be 'String' or 'SecureString'`);
    }

    // タグの解析
    let tags: Array<{ key: string; value: string }> = [];
    if (record.tags && record.tags.trim() !== '') {
      tags = this.parseTags(record.tags, lineNumber);
    }

    return {
      name,
      value: record.value,
      type: type as 'String' | 'SecureString',
      description: record.description?.trim() || undefined,
      kmsKeyId: record.kmsKeyId?.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined
    };
  }

  private parseTags(tagsString: string, lineNumber: number): Array<{ key: string; value: string }> {
    try {
      return tagsString.split(',').map(tag => {
        const [key, value] = tag.split('=');
        if (!key || !value) {
          throw new Error(`Invalid tag format: ${tag}`);
        }
        return { key: key.trim(), value: value.trim() };
      });
    } catch (error) {
      Logger.warning(`Line ${lineNumber}: Failed to parse tags: ${tagsString} - ignoring tags`);
      return [];
    }
  }

  async exportParametersToCSV(parameters: ParameterFromStore[], outputFile: string): Promise<void> {
    const csvWriter = createObjectCsvWriter({
      path: outputFile,
      header: [
        { id: 'name', title: 'name' },
        { id: 'value', title: 'value' },
        { id: 'type', title: 'type' },
        { id: 'description', title: 'description' },
        { id: 'kmsKeyId', title: 'kmsKeyId' },
        { id: 'tags', title: 'tags' },
        { id: 'lastModifiedDate', title: 'lastModifiedDate' },
        { id: 'version', title: 'version' }
      ]
    });

    const records = parameters.map(param => ({
      name: param.name,
      value: param.value,
      type: param.type,
      description: param.description || '',
      kmsKeyId: param.kmsKeyId || '',
      tags: param.tags ? param.tags.map(t => `${t.key}=${t.value}`).join(',') : '',
      lastModifiedDate: param.lastModifiedDate ? param.lastModifiedDate.toISOString() : '',
      version: param.version?.toString() || ''
    }));

    await csvWriter.writeRecords(records);
    Logger.success(`Exported ${parameters.length} parameters to CSV file: ${outputFile}`);
  }

  async generateTemplate(outputPath: string, options: TemplateOptions = {}): Promise<void> {
    const templatePath = options.outputPath || outputPath;

    // ディレクトリが存在しない場合は作成
    const dir = path.dirname(templatePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const csvWriter = createObjectCsvWriter({
      path: templatePath,
      header: [
        { id: 'name', title: 'name' },
        { id: 'value', title: 'value' },
        { id: 'type', title: 'type' },
        { id: 'description', title: 'description' },
        { id: 'kmsKeyId', title: 'kmsKeyId' },
        { id: 'tags', title: 'tags' }
      ]
    });

    const sampleRecords = options.includeExamples ? [
      {
        name: '/myapp/database/host',
        value: 'localhost',
        type: 'String',
        description: 'Database host name',
        kmsKeyId: '',
        tags: 'Environment=dev,Project=myapp'
      },
      {
        name: '/myapp/database/password',
        value: 'secret123',
        type: 'SecureString',
        description: 'Database password',
        kmsKeyId: 'alias/parameter-store-key',
        tags: 'Environment=dev,Project=myapp'
      },
      {
        name: '/myapp/api/key',
        value: 'api-key-12345',
        type: 'SecureString',
        description: 'External API key',
        kmsKeyId: '',
        tags: 'Environment=dev,Project=myapp,Type=secret'
      }
    ] : [
      {
        name: '',
        value: '',
        type: 'String',
        description: '',
        kmsKeyId: '',
        tags: ''
      }
    ];

    await csvWriter.writeRecords(sampleRecords);
    Logger.success(`Generated CSV template: ${templatePath}`);
  }

  validateCSVFile(filePath: string): Promise<{ isValid: boolean; errors: string[] }> {
    return new Promise((resolve) => {
      const errors: string[] = [];
      const records: CSVRecord[] = [];
      let lineNumber = 1;

      if (!fs.existsSync(filePath)) {
        resolve({ isValid: false, errors: [`File does not exist: ${filePath}`] });
        return;
      }

      fs.createReadStream(filePath)
        .pipe(csvParser())
        .on('data', (record: CSVRecord) => {
          lineNumber++;
          records.push(record);

          // 基本バリデーション
          if (!record.name || record.name.trim() === '') {
            errors.push(`Line ${lineNumber}: Parameter name is empty`);
          } else if (!record.name.startsWith('/')) {
            errors.push(`Line ${lineNumber}: Parameter name must start with '/': ${record.name}`);
          }

          if (!record.value && record.value !== '') {
            errors.push(`Line ${lineNumber}: Value is empty`);
          }

          const type = record.type?.trim() || 'String';
          if (type !== 'String' && type !== 'SecureString') {
            errors.push(`Line ${lineNumber}: Invalid parameter type: ${type}`);
          }
        })
        .on('end', () => {
          resolve({ isValid: errors.length === 0, errors });
        })
        .on('error', (error: Error) => {
          resolve({ isValid: false, errors: [`CSV read error: ${error.message}`] });
        });
    });
  }
}
