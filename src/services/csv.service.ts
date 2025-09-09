import * as fs from 'fs';
import * as path from 'path';
import csvParser from 'csv-parser';
import { createObjectCsvWriter } from 'csv-writer';
import { CSVRecord, Parameter, ParameterFromStore, TemplateOptions } from '../types';
import { Logger } from '../utils/logger';
import { ValidationUtils } from '../utils/validation';

/**
 * CSVファイルとAWS Parameter Store間のデータ変換を担当するサービスクラス
 * CSVファイルの読み込み、書き出し、バリデーション機能を提供
 */
export class CSVService {
  /**
   * CSVファイルからパラメータ一覧を読み込み、Parameterオブジェクトの配列として返す
   * ファイルパスのセキュリティ検証とデータバリデーションを実行
   */
  public async parseParametersFromCSV(filePath: string): Promise<Parameter[]> {
    // ファイルパスのセキュリティ検証（パストラバーサル攻撃対策）
    const pathValidation = ValidationUtils.validateFilePath(filePath);
    if (!pathValidation.isValid) {
      throw new Error(`Invalid file path: ${pathValidation.error}`);
    }

    // ファイルの存在チェック
    if (!fs.existsSync(filePath)) {
      throw new Error(`CSV file not found at path: ${filePath}`);
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
            // 行数制限チェック
            const rowCountValidation = ValidationUtils.validateRowCount(records.length);
            if (!rowCountValidation.isValid) {
              throw new Error(rowCountValidation.error);
            }

            for (let i = 0; i < records.length; i++) {
              const record = records[i];
              const validation = ValidationUtils.validateCSVRecord(record, i + 2); // +2 because line 1 is header

              if (!validation.isValid) {
                throw new Error(validation.errors.join('; '));
              }

              if (validation.parameter) {
                const param: Parameter = {
                  name: validation.parameter.name,
                  value: validation.parameter.value,
                  type: validation.parameter.type,
                  description: validation.parameter.description || '',
                  kmsKeyId: validation.parameter.kmsKeyId || '',
                  tags: validation.parameter.tags || []
                };
                parameters.push(param);
              }
            }

            Logger.info(`Successfully parsed ${parameters.length} parameters from CSV file`);
            resolve(parameters);
          } catch (error) {
            reject(error);
          }
        })
        .on('error', (error: Error) => {
          reject(new Error(`Failed to read CSV file: ${error.message}`));
        });
    });
  }


  public async exportParametersToCSV(parameters: ParameterFromStore[], outputFile: string): Promise<void> {
    // 出力ファイルパスのセキュリティ検証
    const pathValidation = ValidationUtils.validateFilePath(outputFile);
    if (!pathValidation.isValid) {
      throw new Error(`Invalid output file path: ${pathValidation.error}`);
    }
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
      description: param.description,
      kmsKeyId: param.kmsKeyId,
      tags: param.tags.map(t => `${t.key}=${t.value}`).join(','),
      lastModifiedDate: param.lastModifiedDate.toISOString(),
      version: param.version.toString()
    }));

    await csvWriter.writeRecords(records);
    Logger.success(`Successfully exported ${parameters.length} parameters to CSV file: ${outputFile}`);
  }

  public async generateTemplate(outputPath: string, options: TemplateOptions = {}): Promise<void> {
    const templatePath = options.outputPath || outputPath;

    // テンプレートファイルパスのセキュリティ検証
    const pathValidation = ValidationUtils.validateFilePath(templatePath);
    if (!pathValidation.isValid) {
      throw new Error(`Invalid template file path: ${pathValidation.error}`);
    }

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

    const sampleRecords = (options.includeExamples !== false) ? [
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
        name: '/myapp/api/endpoints',
        value: '"api1.example.com,api2.example.com,api3.example.com"',
        type: 'StringList',
        description: 'List of API endpoints',
        kmsKeyId: '',
        tags: 'Environment=dev,Project=myapp,Type=endpoints'
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
    Logger.success(`Successfully generated CSV template: ${templatePath}`);
  }

  public validateCSVFile(filePath: string): Promise<{ isValid: boolean; errors: string[]; warnings: string[] }> {
    return new Promise((resolve) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      const records: CSVRecord[] = [];
      let lineNumber = 1;

      // ファイルパスのセキュリティ検証
      const pathValidation = ValidationUtils.validateFilePath(filePath);
      if (!pathValidation.isValid) {
        resolve({ isValid: false, errors: [`Invalid file path: ${pathValidation.error}`], warnings: [] });
        return;
      }

      if (!fs.existsSync(filePath)) {
        resolve({ isValid: false, errors: [`CSV file not found at path: ${filePath}`], warnings: [] });
        return;
      }

      fs.createReadStream(filePath)
        .pipe(csvParser())
        .on('data', (record: CSVRecord) => {
          lineNumber++;
          records.push(record);

          // 共有バリデーションロジックを使用
          const validation = ValidationUtils.validateCSVRecord(record, lineNumber);
          if (!validation.isValid) {
            errors.push(...validation.errors);
          }
        })
        .on('end', () => {
          // 行数制限チェック
          const rowCountValidation = ValidationUtils.validateRowCount(records.length);
          if (!rowCountValidation.isValid) {
            errors.push(rowCountValidation.error);
          }


          resolve({ isValid: errors.length === 0, errors, warnings });
        })
        .on('error', (error: Error) => {
          resolve({ isValid: false, errors: [`Failed to read CSV file: ${error.message}`], warnings: [] });
        });
    });
  }
}
