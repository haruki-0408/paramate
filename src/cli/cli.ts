#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import { ParameterStoreService } from '../services/parameter-store.service';
import { CSVService } from '../services/csv.service';
import { Logger } from '../utils/logger';
import { AWSCredentials } from '../config/awsCredentials';
import { ExportOptions, SyncOptions } from '../types';
import { FILE_PATHS } from '../config/constants';

interface CliSyncOptions {
  file: string;
  region?: string;
  profile?: string;
  pathPrefix?: string;
  dryRun: boolean;
}

interface CliExportOptions {
  region?: string;
  profile?: string;
  pathPrefix: string;
  output: string;
  recursive: boolean;
  secureStrings: boolean;
  decrypt: boolean;
}

interface CliGenerateOptions {
  output: string;
  examples: boolean;
}

interface CliValidateOptions {
  file: string;
}

interface CliDiffOptions {
  file: string;
  region?: string;
  profile?: string;
}

const program = new Command();

program
  .name('prm')
  .description('Tool to put parameters from CSV to AWS Parameter Store with rollback support')
  .version('1.0.0');

// Put コマンド（旧 sync から名前変更）
program
  .command('put')
  .description('Put parameters from CSV file to AWS Parameter Store')
  .requiredOption('-f, --file <path>', 'Path to CSV file')
  .option('-r, --region <region>', 'AWS region')
  .option('-p, --profile <profile>', 'AWS profile')
  .option('--path-prefix <prefix>', 'Parameter path prefix for filtering')
  .option('--dry-run', 'Run in dry-run mode without making changes', false)
  .action(async (options: CliSyncOptions) => {
    try {
      const syncOptions: SyncOptions = {
        dryRun: options.dryRun,
        region: options.region,
        profile: options.profile,
        pathPrefix: options.pathPrefix,
        recursive: true
      };

      // AWS認証情報・リージョン表示（設定とコンテキストを一度で取得）
      const { config, context } = await AWSCredentials.createConfigWithContext({ region: options.region, profile: options.profile });

      Logger.info('AWS Context:');
      Logger.info(`  Account: ${context.account}`);
      Logger.info(`  Region:  ${context.region}`);
      Logger.info(`  User:    ${context.arn}`);
      if (context.profile) {
        Logger.info(`  Profile: ${context.profile}`);
      }

      Logger.info(`Starting parameter put from ${options.file}`);
      if (syncOptions.dryRun) {
        Logger.warning('DRY-RUN mode - no changes will be made');
      }

      // CSVファイルのバリデーション
      const csvService = new CSVService();
      const validation = await csvService.validateCSVFile(options.file);
      if (!validation.isValid) {
        Logger.error('CSV file has errors:');
        validation.errors.forEach(error => Logger.error(`  - ${error}`));
        process.exit(1);
      }

      // CSVからパラメータを読み込み
      const parameters = await csvService.parseParametersFromCSV(options.file);
      if (parameters.length === 0) {
        Logger.warning('No parameters to sync');
        return;
      }

      Logger.info(`Found ${parameters.length} parameters`);

      // Parameter Storeサービスで同期実行（認証済み設定を渡す）
      const parameterStore = new ParameterStoreService(context.region, syncOptions.profile, config);
      const result = await parameterStore.syncParameters(parameters, syncOptions);

      // 結果の表示
      if (result.errors.length > 0) {
        Logger.error('Errors occurred during sync:');
        result.errors.forEach(error => Logger.error(`  - ${error}`));
        Logger.summary(result);
        process.exit(1);
      }

      const totalProcessed = result.success + result.updated + result.skipped;
      if (totalProcessed > 0) {
        if (syncOptions.dryRun) {
          Logger.success('Dry-run completed - above changes would be executed');
        } else {
          Logger.success('Parameter put completed successfully');
        }
        Logger.summary(result);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`Parameter put failed: ${errorMessage}`);
      process.exit(1);
    }
  });

// Export コマンド
program
  .command('export')
  .description('Export parameters from AWS Parameter Store to CSV file')
  .option('-r, --region <region>', 'AWS region')
  .option('-p, --profile <profile>', 'AWS profile')
  .option('--path-prefix <prefix>', 'Path prefix for parameters to export', '/')
  .option('--output <file>', 'Output CSV file name')
  .option('--no-recursive', 'Disable recursive search')
  .option('--no-secure-strings', 'Exclude SecureString parameters')
  .option('--no-decrypt', 'Do not decrypt SecureString values')
  .action(async (options: CliExportOptions) => {
    try {
      // タイムスタンプ付きファイル名の生成
      const now = new Date();
      const timestamp = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}-${String(now.getUTCHours()).padStart(2, '0')}-${String(now.getUTCMinutes()).padStart(2, '0')}-${String(now.getUTCSeconds()).padStart(2, '0')}-UTC`;
      const defaultOutput = `exported-parameters-${timestamp}.csv`;

      const exportOptions: ExportOptions = {
        region: options.region,
        profile: options.profile,
        pathPrefix: options.pathPrefix,
        recursive: options.recursive !== false,
        outputFile: options.output || defaultOutput,
        includeSecureStrings: options.secureStrings !== false,
        decryptSecureStrings: options.decrypt !== false
      };

      // AWS認証情報・リージョン表示（設定とコンテキストを一度で取得）
      const { config, context } = await AWSCredentials.createConfigWithContext({ region: options.region, profile: options.profile });

      Logger.info('AWS Context:');
      Logger.info(`  Account: ${context.account}`);
      Logger.info(`  Region:  ${context.region}`);
      Logger.info(`  User:    ${context.arn}`);
      if (context.profile) {
        Logger.info(`  Profile: ${context.profile}`);
      }

      Logger.info('Exporting parameters from AWS Parameter Store...');
      Logger.info(`Path prefix: ${exportOptions.pathPrefix}`);
      Logger.info(`Recursive search: ${exportOptions.recursive ? 'Yes' : 'No'}`);
      Logger.info(`Include SecureString: ${exportOptions.includeSecureStrings ? 'Yes' : 'No'}`);

      const parameterStore = new ParameterStoreService(context.region, exportOptions.profile, config);
      const parameters = await parameterStore.exportParameters(exportOptions);

      if (parameters.length === 0) {
        Logger.warning('No parameters found to export');
        return;
      }

      const csvService = new CSVService();
      const outputFile = exportOptions.outputFile;
      if (!outputFile) {
        throw new Error('Output file is required');
      }
      await csvService.exportParametersToCSV(parameters, outputFile);

      Logger.success(`Export completed: ${parameters.length} parameters`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`Export failed: ${errorMessage}`);
      process.exit(1);
    }
  });

// Generate Template コマンド
program
  .command('generate-template')
  .description('Generate CSV template file')
  .option('-o, --output <path>', 'Output path for template file', `./${FILE_PATHS.DEFAULT_TEMPLATE_NAME}`)
  .option('--no-examples', 'Do not include sample data')
  .action(async (options: CliGenerateOptions) => {
    try {
      const outputPath = path.resolve(options.output);
      Logger.info(`Generating CSV template: ${outputPath}`);

      const csvService = new CSVService();
      await csvService.generateTemplate(outputPath, {
        includeExamples: options.examples !== false
      });

      Logger.success('Template generation completed');
      Logger.info('\nUsage:');
      Logger.info(`1. Edit ${outputPath} to define parameters`);
      Logger.info(`2. prm put -f ${outputPath} --dry-run to preview`);
      Logger.info(`3. prm put -f ${outputPath} to execute`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`Template generation failed: ${errorMessage}`);
      process.exit(1);
    }
  });

// Validate コマンド
program
  .command('validate')
  .description('Validate CSV file format')
  .requiredOption('-f, --file <path>', 'Path to CSV file to validate')
  .action(async (options: CliValidateOptions) => {
    try {
      Logger.info(`Validating CSV file: ${options.file}`);

      const csvService = new CSVService();
      const validation = await csvService.validateCSVFile(options.file);

      if (validation.isValid) {
        Logger.success('CSV file is valid');

        // 警告がある場合は表示
        if (validation.warnings && validation.warnings.length > 0) {
          Logger.warning('Recommendations:');
          validation.warnings.forEach((warning, index) => {
            Logger.warning(`  ${index + 1}. ${warning}`);
          });
        }
      } else {
        Logger.error('Errors found in CSV file:');
        validation.errors.forEach((error, index) => {
          Logger.error(`  ${index + 1}. ${error}`);
        });
        process.exit(1);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`Validation failed: ${errorMessage}`);
      process.exit(1);
    }
  });

// Diff コマンド
program
  .command('diff')
  .description('Show differences between CSV file and current Parameter Store')
  .requiredOption('-f, --file <path>', 'CSVファイルのパス')
  .option('-r, --region <region>', 'AWS region')
  .option('-p, --profile <profile>', 'AWS profile')
  .action(async (options: CliDiffOptions) => {
    try {
      // AWS認証情報・リージョン表示（設定とコンテキストを一度で取得）
      const { config, context } = await AWSCredentials.createConfigWithContext({ region: options.region, profile: options.profile });

      Logger.info('AWS Context:');
      Logger.info(`  Account: ${context.account}`);
      Logger.info(`  Region:  ${context.region}`);
      Logger.info(`  User:    ${context.arn}`);
      if (context.profile) {
        Logger.info(`  Profile: ${context.profile}`);
      }

      Logger.info(`Calculating differences: ${options.file}`);

      // CSVファイルのバリデーション
      const csvService = new CSVService();
      const validation = await csvService.validateCSVFile(options.file);
      if (!validation.isValid) {
        Logger.error('CSV file has errors:');
        validation.errors.forEach(error => Logger.error(`  - ${error}`));
        process.exit(1);
      }

      const parameters = await csvService.parseParametersFromCSV(options.file);

      if (parameters.length === 0) {
        Logger.warning('No parameters to compare');
        return;
      }

      const parameterStore = new ParameterStoreService(context.region, options.profile, config);
      const diffResult = await parameterStore.calculateDiff(parameters);

      parameterStore.displayDiffSummary(diffResult);

      if (diffResult.summary.create === 0 && diffResult.summary.update === 0) {
        Logger.success('No changes detected');
      } else {
        const regionArg = options.region ? `-r ${options.region}` : '';
        const profileArg = options.profile ? `-p ${options.profile}` : '';
        const cmd = `prm put -f ${options.file} ${regionArg} ${profileArg}`.replace(/\s+/g, ' ').trim();
        Logger.info(`\nPut command: ${cmd}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`Diff calculation failed: ${errorMessage}`);
      process.exit(1);
    }
  });

// Rollback コマンド
program
  .command('rollback')
  .description('Rollback to the previous put operation state')
  .option('-r, --region <region>', 'AWS region')
  .option('-p, --profile <profile>', 'AWS profile')
  .action(async (options: { region?: string; profile?: string }) => {
    try {
      // AWS認証情報・リージョン表示（設定とコンテキストを一度で取得）
      const { config, context } = await AWSCredentials.createConfigWithContext({ region: options.region, profile: options.profile });

      Logger.info('AWS Context:');
      Logger.info(`  Account: ${context.account}`);
      Logger.info(`  Region:  ${context.region}`);
      Logger.info(`  User:    ${context.arn}`);
      if (context.profile) {
        Logger.info(`  Profile: ${context.profile}`);
      }

      Logger.info('Starting rollback operation...');

      // Parameter Storeサービスでrollback実行（同じ認証済み設定を再利用）
      const parameterStore = new ParameterStoreService(context.region, options.profile, config);
      const result = await parameterStore.rollbackParameters();

      // 結果の表示
      if (result.errors.length > 0) {
        Logger.error('Errors occurred during rollback:');
        result.errors.forEach(error => Logger.error(`  - ${error}`));
        Logger.info(`Rollback completed with errors: ${result.success} successful, ${result.failed} failed`);
        process.exit(1);
      } else {
        Logger.success(`Rollback completed successfully: ${result.success} parameters restored`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`Rollback failed: ${errorMessage}`);
      process.exit(1);
    }
  });

program.parse();
