import {
  Parameter as AWSParameter,
  AddTagsToResourceCommand,
  GetParameterCommand,
  GetParametersByPathCommand,
  ParameterType,
  PutParameterCommand,
  SSMClient
} from '@aws-sdk/client-ssm';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { DiffResult, ExportOptions, Parameter, ParameterChange, ParameterFromStore, SyncOptions, SyncResult } from '../types';
import { Logger } from '../utils/logger';

interface ExtendedAWSParameter extends AWSParameter {
  Description?: string;
  LastModifiedUser?: string;
}

export class ParameterStoreService {
  private ssmClient: SSMClient;

  constructor(region?: string, profile?: string) {
    const config = {
      region: region || process.env.AWS_REGION || 'us-east-1',
      credentials: fromNodeProviderChain({
        profile
      })
    };

    this.ssmClient = new SSMClient(config);
  }

  async exportParameters(options: ExportOptions): Promise<ParameterFromStore[]> {
    Logger.info('Fetching parameters from Parameter Store...');

    const parameters: ParameterFromStore[] = [];
    let nextToken: string | undefined;

    do {
      try {
        const command = new GetParametersByPathCommand({
          Path: options.pathPrefix || '/',
          Recursive: options.recursive !== false,
          WithDecryption: options.decryptSecureStrings !== false,
          NextToken: nextToken,
          MaxResults: 10
        });

        const response = await this.ssmClient.send(command);

        if (response.Parameters) {
          for (const param of response.Parameters) {
            if (!param.Name || param.Value === undefined) continue;

            // SecureStringを除外するオプション
            if (!options.includeSecureStrings && param.Type === 'SecureString') {
              continue;
            }

            const extendedParam = param as ExtendedAWSParameter;
            const parameter: ParameterFromStore = {
              name: param.Name,
              value: param.Value,
              type: (param.Type as 'String' | 'SecureString') || 'String',
              description: extendedParam.Description,
              lastModifiedDate: param.LastModifiedDate,
              lastModifiedUser: extendedParam.LastModifiedUser,
              version: param.Version,
              tags: [] // タグは別途取得が必要
            };

            parameters.push(parameter);
          }
        }

        nextToken = response.NextToken;
      } catch (error) {
        Logger.error(`Error fetching parameters: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error;
      }
    } while (nextToken);

    Logger.success(`Retrieved ${parameters.length} parameters`);
    return parameters;
  }

  async getParameter(name: string, withDecryption: boolean = true): Promise<ParameterFromStore | null> {
    try {
      const command = new GetParameterCommand({
        Name: name,
        WithDecryption: withDecryption
      });

      const response = await this.ssmClient.send(command);

      if (response.Parameter) {
        const extendedParam = response.Parameter as ExtendedAWSParameter;
        return {
          name: response.Parameter.Name || '',
          value: response.Parameter.Value || '',
          type: (response.Parameter.Type as 'String' | 'SecureString') || 'String',
          description: extendedParam.Description,
          lastModifiedDate: response.Parameter.LastModifiedDate,
          lastModifiedUser: extendedParam.LastModifiedUser,
          version: response.Parameter.Version,
          tags: []
        };
      }

      return null;
    } catch (error) {
      if (error instanceof Error && error.name === 'ParameterNotFound') {
        return null;
      }
      throw error;
    }
  }

  async putParameter(parameter: Parameter, overwrite: boolean = false): Promise<void> {
    try {
      const command = new PutParameterCommand({
        Name: parameter.name,
        Value: parameter.value,
        Type: parameter.type as ParameterType,
        Description: parameter.description,
        Overwrite: overwrite,
        ...(parameter.kmsKeyId && { KeyId: parameter.kmsKeyId }),
        // 新規作成時のみTagsを含める
        ...(!overwrite && parameter.tags && parameter.tags.length > 0 && {
          Tags: parameter.tags.map(tag => ({ Key: tag.key, Value: tag.value }))
        })
      });

      await this.ssmClient.send(command);

      // 既存パラメータの場合、別途タグを追加
      if (overwrite && parameter.tags && parameter.tags.length > 0) {
        await this.addTagsToParameter(parameter.name, parameter.tags);
      }
    } catch (error) {
      Logger.error(`Error updating parameter ${parameter.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  private async addTagsToParameter(parameterName: string, tags: Array<{ key: string; value: string }>): Promise<void> {
    try {
      const command = new AddTagsToResourceCommand({
        ResourceType: 'Parameter',
        ResourceId: parameterName,
        Tags: tags.map(tag => ({ Key: tag.key, Value: tag.value }))
      });

      await this.ssmClient.send(command);
    } catch (error) {
      Logger.warning(`Failed to add tags to ${parameterName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async syncParameters(parameters: Parameter[], options: SyncOptions): Promise<SyncResult> {
    const result: SyncResult = {
      success: 0,
      failed: 0,
      updated: 0,
      skipped: 0,
      deleted: 0,
      errors: []
    };

    // 差分計算と変更プレビュー表示
    const diffResult = await this.calculateDiff(parameters);

    if (!options.dryRun) {
      const shouldProceed = await this.getUserConfirmation(diffResult);
      if (!shouldProceed) {
        Logger.info('Operation cancelled');
        return result;
      }
    }

    Logger.header('Syncing parameters to AWS Parameter Store');

    // 実際の同期処理
    for (const change of diffResult.changes) {
      if (change.type === 'skip') {
        result.skipped++;
        Logger.skipped(`Skipping parameter (no changes): ${change.parameter.name}`);
        continue;
      }

      try {
        if (!options.dryRun) {
          switch (change.type) {
            case 'create':
              await this.putParameter(change.parameter, false);
              break;
            case 'update':
              await this.putParameter(change.parameter, true);
              break;
          }
        }

        switch (change.type) {
          case 'create':
            result.success++;
            if (options.dryRun) {
              Logger.dryRun(`Would create parameter: ${change.parameter.name}`);
            } else {
              Logger.success(`Created parameter: ${change.parameter.name}`);
            }
            break;
          case 'update':
            result.updated++;
            if (options.dryRun) {
              Logger.dryRun(`Would update parameter: ${change.parameter.name}`);
            } else {
              Logger.updated(`Updated parameter: ${change.parameter.name}`);
            }
            break;
        }
      } catch (error) {
        result.failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`${change.parameter.name}: ${errorMessage}`);
        Logger.error(`Failed to sync parameter ${change.parameter.name}: ${errorMessage}`);
      }
    }

    return result;
  }

  async calculateDiff(parameters: Parameter[]): Promise<DiffResult> {
    const changes: ParameterChange[] = [];
    const summary = { create: 0, update: 0, delete: 0, skip: 0 };

    for (const parameter of parameters) {
      try {
        const existing = await this.getParameter(parameter.name);

        if (!existing) {
          changes.push({ type: 'create', parameter });
          summary.create++;
        } else if (this.isParameterIdentical(existing, parameter)) {
          changes.push({ type: 'skip', parameter, existing, reason: 'No changes' });
          summary.skip++;
        } else {
          changes.push({ type: 'update', parameter, existing });
          summary.update++;
        }
      } catch (error) {
        changes.push({ type: 'create', parameter });
        summary.create++;
      }
    }

    return { changes, summary };
  }

  private isParameterIdentical(existing: ParameterFromStore, parameter: Parameter): boolean {
    // 値の比較
    if (existing.value !== parameter.value) {
      return false;
    }

    // タイプの比較
    if (existing.type !== parameter.type) {
      return false;
    }

    // 説明の比較（undefined と空文字列は同じとみなす）
    const existingDesc = existing.description || '';
    const newDesc = parameter.description || '';
    if (existingDesc !== newDesc) {
      return false;
    }

    // KMSKeyIdとTagsが指定されている場合は更新が必要とみなす
    if (parameter.kmsKeyId && parameter.kmsKeyId.trim() !== '') {
      return false;
    }

    if (parameter.tags && parameter.tags.length > 0) {
      return false;
    }

    return true;
  }

  private async getUserConfirmation(diffResult: DiffResult): Promise<boolean> {
    this.displayDiffSummary(diffResult);

    if (diffResult.summary.create === 0 && diffResult.summary.update === 0) {
      return true;
    }

    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question('Do you want to proceed with the above changes? (y/n): ', (answer: string) => {
        rl.close();
        const response = answer.toLowerCase().trim();
        resolve(response === 'y' || response === 'yes');
      });
    });
  }

  displayDiffSummary(diffResult: DiffResult): void {
    Logger.header('Change Preview');

    const createChanges = diffResult.changes.filter(c => c.type === 'create');
    const updateChanges = diffResult.changes.filter(c => c.type === 'update');
    const skipChanges = diffResult.changes.filter(c => c.type === 'skip');

    if (createChanges.length > 0) {
      Logger.diffSection('Create', createChanges.length, 'create');
      createChanges.forEach(change => {
        this.logParameterDetails(change.parameter, '+');
      });
    }

    if (updateChanges.length > 0) {
      Logger.diffSection('Update', updateChanges.length, 'update');
      updateChanges.forEach(change => {
        if (change.existing) {
          this.logParameterChanges(change.parameter, change.existing);
        }
      });
    }

    if (skipChanges.length > 0) {
      Logger.diffSection('Skip', skipChanges.length, 'skip');
      skipChanges.forEach(change => {
        Logger.info(`  = ${change.parameter.name} (no changes)`);
      });
    }

    const total = diffResult.summary.create + diffResult.summary.update + diffResult.summary.skip;
    Logger.totalSummary(total, diffResult.summary.create, diffResult.summary.update, diffResult.summary.skip);
    Logger.info('');
  }

  private maskValue(value: string): string {
    if (value.length <= 8) {
      return '*'.repeat(value.length);
    }
    return value.substring(0, 3) + '*'.repeat(value.length - 6) + value.substring(value.length - 3);
  }

  private logParameterDetails(param: Parameter, prefix: string): void {
    Logger.info(`  ${prefix} ${param.name}`);
    Logger.info(`    Value: ${this.maskValue(param.value)}`);
    Logger.info(`    Type: ${param.type}`);
    if (param.description) Logger.info(`    Description: ${param.description}`);
    if (param.kmsKeyId) Logger.info(`    KMS: ${param.kmsKeyId}`);
    if (param.tags && param.tags.length > 0) {
      const tagStr = param.tags.map(t => `${t.key}=${t.value}`).join(', ');
      Logger.info(`    Tags: ${tagStr}`);
    }
  }

  private logParameterChanges(parameter: Parameter, existing: ParameterFromStore): void {
    Logger.info(`  ~ ${parameter.name}`);

    const arrow = Logger.getArrow();
    if (existing.value !== parameter.value) {
      Logger.info(`    Value: ${this.maskValue(existing.value)} ${arrow} ${this.maskValue(parameter.value)}`);
    }
    if (existing.type !== parameter.type) {
      Logger.info(`    Type: ${existing.type} ${arrow} ${parameter.type}`);
    }

    const existingDesc = existing.description || '';
    const newDesc = parameter.description || '';
    if (existingDesc !== newDesc) {
      Logger.info(`    Description: ${existingDesc || '(not set)'} ${arrow} ${newDesc || '(not set)'}`);
    }

    if (parameter.kmsKeyId) {
      Logger.info(`    KMS: ${parameter.kmsKeyId} (will be set)`);
    }
    if (parameter.tags && parameter.tags.length > 0) {
      const tagStr = parameter.tags.map(t => `${t.key}=${t.value}`).join(', ');
      Logger.info(`    Tags: ${tagStr} (will be set)`);
    }
  }
}
