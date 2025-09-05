import {
  AddTagsToResourceCommand,
  DescribeParametersCommand,
  GetParameterCommand,
  GetParametersByPathCommand,
  ListTagsForResourceCommand,
  ParameterType,
  PutParameterCommand,
  SSMClient
} from '@aws-sdk/client-ssm';
import { DiffResult, ExportOptions, Parameter, ParameterChange, ParameterFromStore, SyncOptions, SyncResult } from '../types';
import { Logger } from '../utils/logger';
import { AWS_LIMITS } from '../config/constants';
import chalk from 'chalk';

/**
 * AWS Parameter Storeとの連携を担当するサービスクラス
 * パラメータの取得、更新、同期、差分計算機能を提供
 * AWS SDK v3を使用してSSMサービスと通信
 */
export class ParameterStoreService {
  private ssmClient: SSMClient; // AWS SSMクライアントのインスタンス

  /**
   * Parameter Store サービスのコンストラクタ
   * AWS SSM クライアントを初期化し、認証情報を設定する
   * @param region - AWS リージョン（オプション）
   * @param profile - AWS プロファイル名（オプション）
   * @param config - 事前設定済みのAWS設定オブジェクト（MFA認証済み等）
   */
  constructor(_region?: string, _profile?: string, config?: any) {
    if (config) {
      // 事前に認証済みの設定オブジェクトを使用（MFA認証済み）
      this.ssmClient = new SSMClient(config);
    } else {
      // リージョンとプロファイルから新規に認証設定を作成（非推奨パス）
      // 本来はcreateConfigWithContextを使用して事前に設定オブジェクトを作成することを推奨
      throw new Error('ParameterStoreService requires pre-configured AWS config. Use AWSCredentials.createConfigWithContext() first.');
    }
  }

  /**
   * Parameter Storeからパラメータを一括取得する
   * 指定されたパスプレフィックス配下のパラメータを再帰的に取得し、
   * 必要に応じて暗号化されたSecureStringも復号化して取得
   * @param options - エクスポートオプション（パスプレフィックス、再帰取得、復号化等）
   * @returns Parameter Storeから取得したパラメータ配列
   */
  public async exportParameters(options: ExportOptions): Promise<ParameterFromStore[]> {
    Logger.info('Fetching parameters from Parameter Store...');

    const parameters: ParameterFromStore[] = [];
    let nextToken: string | undefined; // ページネーション用のトークン

    // AWS APIの制限によりページ分割で取得
    do {
      try {
        const command = new GetParametersByPathCommand({
          Path: options.pathPrefix || '/', // 取得対象のパスプレフィックス
          Recursive: options.recursive !== false, // 子パスも含めて再帰取得
          WithDecryption: options.decryptSecureStrings !== false, // SecureStringの復号化
          NextToken: nextToken, // 次ページ取得用のトークン
          MaxResults: AWS_LIMITS.PARAMETER_STORE_MAX_RESULTS // 1回のAPIコールで取得する最大件数
        });

        const response = await this.ssmClient.send(command);

        if (response.Parameters) {
          for (const param of response.Parameters) {
            // パラメータ名または値が空の場合はスキップ
            if (!param.Name || param.Value === undefined) continue;

            // SecureStringパラメータを除外するオプションが有効な場合
            if (!options.includeSecureStrings && param.Type === 'SecureString') {
              continue;
            }

            // DescribeParametersCommandで説明文を別途取得
            const description = await this.getParameterDescription(param.Name);
            const parameter: ParameterFromStore = {
              name: param.Name,
              value: param.Value || '',
              type: (param.Type as 'String' | 'SecureString' | 'StringList') || 'String',
              description: description,
              kmsKeyId: '', // GetParametersByPathCommandでは取得できないため空文字
              lastModifiedDate: param.LastModifiedDate || new Date(),
              lastModifiedUser: '', // GetParametersByPathCommandでは取得できない
              version: param.Version || 1,
              tags: await this.getParameterTags(param.Name) // 別APIでタグ情報を取得
            };

            parameters.push(parameter);
          }
        }

        nextToken = response.NextToken; // 次ページがある場合のトークンを保存
      } catch (error) {
        Logger.error(`Error fetching parameters: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error;
      }
    } while (nextToken); // 次ページがある限り継続

    Logger.success(`Retrieved ${parameters.length} parameters`);
    return parameters;
  }

  public async getParameter(name: string, withDecryption: boolean = true): Promise<ParameterFromStore | null> {
    try {
      const command = new GetParameterCommand({
        Name: name,
        WithDecryption: withDecryption
      });

      const response = await this.ssmClient.send(command);

      if (response.Parameter) {
        const description = await this.getParameterDescription(response.Parameter.Name!);
        return {
          name: response.Parameter.Name || '',
          value: response.Parameter.Value || '',
          type: (response.Parameter.Type as 'String' | 'SecureString' | 'StringList') || 'String',
          description: description,
          kmsKeyId: '',
          lastModifiedDate: response.Parameter.LastModifiedDate || new Date(),
          lastModifiedUser: '', // GetParameterCommandでは取得できない
          version: response.Parameter.Version || 1,
          tags: await this.getParameterTags(response.Parameter.Name!)
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

  public async putParameter(parameter: Parameter, overwrite: boolean = false, dryRun: boolean = false): Promise<void> {
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

      if (dryRun) {
        // dry-runモードでは権限チェックのみ実行（実際のリソース変更は行わない）
        Logger.debug(`[DRY-RUN] Checking permissions for: ${parameter.name}`);
        
        try {
          if (overwrite) {
            // 更新の場合：既存パラメータの取得で権限チェック
            const existingParam = await this.getParameter(parameter.name);
            if (!existingParam) {
              throw new Error('Parameter does not exist for update');
            }
            Logger.debug(`[DRY-RUN] Parameter exists and can be read: ${parameter.name}`);
          } else {
            // 新規作成の場合：GetParameterで存在しないことを確認（権限チェック含む）
            try {
              await this.getParameter(parameter.name);
              // パラメータが存在する場合はエラー
              throw new Error(`Parameter ${parameter.name} already exists. Use overwrite option to update.`);
            } catch (error) {
              if (error instanceof Error && error.name === 'ParameterNotFound') {
                // ParameterNotFoundは正常（新規作成可能）
                Logger.debug(`[DRY-RUN] Parameter does not exist, creation would be possible: ${parameter.name}`);
              } else {
                // その他のエラー（権限エラー等）はそのまま伝播
                throw error;
              }
            }
          }

          // KMSキーIDが指定されている場合の権限チェック（簡易）
          if (parameter.kmsKeyId) {
            Logger.debug(`[DRY-RUN] KMS key specified: ${parameter.kmsKeyId}`);
            // 実際のKMS権限チェックは複雑なため、ここでは警告のみ
            Logger.info(`[DRY-RUN] Note: KMS key permissions for '${parameter.kmsKeyId}' cannot be validated in dry-run mode`);
          }

          // タグ形式の基本バリデーション
          if (parameter.tags && parameter.tags.length > 0) {
            for (const tag of parameter.tags) {
              if (!tag.key || !tag.value) {
                throw new Error(`Invalid tag format: key="${tag.key}", value="${tag.value}"`);
              }
              // AWS Parameter Store tag validation regex pattern
              const tagValuePattern = /^([\p{L}\p{Z}\p{N}_.:/=+\-@]*)$/u;
              if (!tagValuePattern.test(tag.value)) {
                throw new Error(`Tag value '${tag.value}' contains invalid characters. Only letters, numbers, spaces, and the following characters are allowed: . : / = + - @`);
              }
            }
            Logger.debug(`[DRY-RUN] Tag format validation passed: ${parameter.name}`);
          }

        } catch (error) {
          // 権限エラーやその他のエラーをそのまま伝播
          throw error;
        }
      } else {
        await this.ssmClient.send(command);

        // 既存パラメータの場合、別途タグを追加
        if (overwrite && parameter.tags && parameter.tags.length > 0) {
          await this.addTagsToParameter(parameter.name, parameter.tags);
        }
      }
    } catch (error) {
      Logger.error(`Error ${dryRun ? 'validating' : 'updating'} parameter ${parameter.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  private async getParameterTags(parameterName: string): Promise<Array<{ key: string; value: string }>> {
    try {
      const command = new ListTagsForResourceCommand({
        ResourceType: 'Parameter',
        ResourceId: parameterName
      });

      const response = await this.ssmClient.send(command);
      
      if (response.TagList) {
        return response.TagList.map(tag => ({
          key: tag.Key || '',
          value: tag.Value || ''
        }));
      }
      
      return [];
    } catch (error) {
      // タグ取得に失敗してもエラーとしない（権限問題等）
      return [];
    }
  }

  private async getParameterDescription(parameterName: string): Promise<string> {
    try {
      const command = new DescribeParametersCommand({
        Filters: [
          {
            Key: 'Name',
            Values: [parameterName]
          }
        ]
      });

      const response = await this.ssmClient.send(command);
      
      if (response.Parameters && response.Parameters.length > 0) {
        return response.Parameters[0].Description || '';
      }
      
      return '';
    } catch (error) {
      // Description取得に失敗してもエラーとしない（権限問題等）
      Logger.debug(`Failed to get description for ${parameterName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return '';
    }
  }

  private async addTagsToParameter(parameterName: string, tags: Array<{ key: string; value: string }>, dryRun: boolean = false): Promise<void> {
    try {
      if (dryRun) {
        // dry-runモードでは権限チェックのみ実行（実際のタグ変更は行わない）
        Logger.debug(`[DRY-RUN] Checking tag permissions for: ${parameterName}`);
        
        // 既存タグの取得で権限チェック
        try {
          const existingTags = await this.getParameterTags(parameterName);
          Logger.debug(`[DRY-RUN] Tag read permissions confirmed for: ${parameterName} (${existingTags.length} existing tags)`);
        } catch (error) {
          // タグ取得権限がない場合の警告（Parameter自体のアクセスは可能でもタグアクセス権限は別）
          Logger.warning(`[DRY-RUN] Cannot read existing tags for ${parameterName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // タグ形式バリデーション
        for (const tag of tags) {
          if (!tag.key || !tag.value) {
            throw new Error(`Invalid tag format: key="${tag.key}", value="${tag.value}"`);
          }
          const tagValuePattern = /^([\p{L}\p{Z}\p{N}_.:/=+\-@]*)$/u;
          if (!tagValuePattern.test(tag.value)) {
            throw new Error(`Tag value '${tag.value}' contains invalid characters`);
          }
        }

        Logger.debug(`[DRY-RUN] Tag format validation passed for: ${parameterName}`);
        Logger.info(`[DRY-RUN] Note: Actual tag write permissions cannot be validated without making changes`);
      } else {
        const command = new AddTagsToResourceCommand({
          ResourceType: 'Parameter',
          ResourceId: parameterName,
          Tags: tags.map(tag => ({ Key: tag.key, Value: tag.value }))
        });
        await this.ssmClient.send(command);
      }
    } catch (error) {
      const action = dryRun ? 'validate tags for' : 'add tags to';
      Logger.warning(`Failed to ${action} ${parameterName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  public async syncParameters(parameters: Parameter[], options: SyncOptions): Promise<SyncResult> {
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
        switch (change.type) {
          case 'create':
            await this.putParameter(change.parameter, false, options.dryRun);
            result.success++;
            if (options.dryRun) {
              Logger.dryRun(`Would create parameter: ${change.parameter.name}`);
            } else {
              Logger.success(`Created parameter: ${change.parameter.name}`);
            }
            break;
          case 'update':
            await this.putParameter(change.parameter, true, options.dryRun);
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
        const action = options.dryRun ? 'validate' : 'sync';
        Logger.error(`Failed to ${action} parameter ${change.parameter.name}: ${errorMessage}`);
      }
    }

    return result;
  }

  public async calculateDiff(parameters: Parameter[]): Promise<DiffResult> {
    const changes: ParameterChange[] = [];
    const summary = { create: 0, update: 0, delete: 0, skip: 0 };

    for (const parameter of parameters) {
      try {
        const existing = await this.getParameter(parameter.name);

        if (!existing) {
          changes.push({ type: 'create', parameter, existing: null, reason: 'Parameter does not exist' });
          summary.create++;
        } else if (this.isParameterIdentical(existing, parameter)) {
          changes.push({ type: 'skip', parameter, existing, reason: 'No changes' });
          summary.skip++;
        } else {
          changes.push({ type: 'update', parameter, existing, reason: 'Parameter values differ' });
          summary.update++;
        }
      } catch (error) {
        changes.push({ type: 'create', parameter, existing: null, reason: 'Error retrieving existing parameter' });
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

  public displayDiffSummary(diffResult: DiffResult): void {
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
        console.log(chalk.gray(`  = ${change.parameter.name} (no changes)`));
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
    if (prefix === '+') {
      Logger.diffCreate(param.name);
    } else if (prefix === '-') {
      Logger.diffDelete(param.name);
    } else {
      Logger.diffUpdate(param.name);
    }
    Logger.diffInfo(`Value: ${this.maskValue(param.value)}`);
    Logger.diffInfo(`Type: ${param.type}`);
    if (param.description) Logger.diffInfo(`Description: ${param.description}`);
    if (param.kmsKeyId) Logger.diffInfo(`KMS: ${param.kmsKeyId}`);
    if (param.tags && param.tags.length > 0) {
      const tagStr = param.tags.map(t => `${t.key}=${t.value}`).join(', ');
      Logger.diffInfo(`Tags: ${tagStr}`);
    }
  }

  private logParameterChanges(parameter: Parameter, existing: ParameterFromStore): void {
    Logger.diffUpdate(parameter.name);

    if (existing.value !== parameter.value) {
      Logger.diffInfo(`Value: ${this.maskValue(existing.value)} -> ${this.maskValue(parameter.value)}`);
    }
    if (existing.type !== parameter.type) {
      Logger.diffInfo(`Type: ${existing.type} -> ${parameter.type}`);
    }

    const existingDesc = existing.description || '';
    const newDesc = parameter.description || '';
    if (existingDesc !== newDesc) {
      Logger.diffInfo(`Description: ${existingDesc || '(not set)'} -> ${newDesc || '(not set)'}`);
    }

    if (parameter.kmsKeyId) {
      Logger.diffInfo(`KMS: ${parameter.kmsKeyId} (will be set)`);
    }
    if (parameter.tags && parameter.tags.length > 0) {
      const tagStr = parameter.tags.map(t => `${t.key}=${t.value}`).join(', ');
      Logger.diffInfo(`Tags: ${tagStr} (will be set)`);
    }
  }
}
