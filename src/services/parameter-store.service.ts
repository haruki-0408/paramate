import {
  AddTagsToResourceCommand,
  DeleteParameterCommand,
  DescribeParametersCommand,
  GetParameterCommand,
  GetParametersByPathCommand,
  ListTagsForResourceCommand,
  ParameterType,
  PutParameterCommand,
  SSMClient
} from '@aws-sdk/client-ssm';
import { KMSClient, DescribeKeyCommand } from '@aws-sdk/client-kms';
import { DiffResult, ExportOptions, Parameter, ParameterChange, ParameterFromStore, SyncOptions, SyncResult } from '../types';
import { Logger } from '../utils/logger';
import { AWS_LIMITS, RATE_LIMIT_CONFIG } from '../config/constants';
import { RollbackService, RollbackState } from './rollback.service';
import chalk from 'chalk';

/**
 * AWS Parameter Storeとの連携を担当するサービスクラス
 * パラメータの取得、更新、同期、差分計算機能を提供
 * AWS SDK v3を使用してSSMサービスと通信
 */
export class ParameterStoreService {
  private ssmClient: SSMClient; // AWS SSMクライアントのインスタンス
  private kmsClient: KMSClient; // AWS KMSクライアントのインスタンス
  private region: string; // AWSリージョン

  /**
   * Parameter Store サービスのコンストラクタ
   * AWS SSM クライアントを初期化し、認証情報を設定する
   * @param region - AWS リージョン（オプション）
   * @param profile - AWS プロファイル名（オプション）
   * @param config - 事前設定済みのAWS設定オブジェクト（MFA認証済み等）
   */
  constructor(region?: string, _profile?: string, config?: any) {
    if (!region) {
      throw new Error('AWS region is required. Please specify region via -r option or AWS_REGION environment variable.');
    }
    this.region = region;
    if (config) {
      // 事前に認証済みの設定オブジェクトを使用（MFA認証済み）
      this.ssmClient = new SSMClient(config);
      this.kmsClient = new KMSClient(config);
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
          // フィルタリング済みパラメータリストを作成
          const filteredParams = response.Parameters.filter(param => {
            if (!param.Name || param.Value === undefined) return false;
            if (!options.includeSecureStrings && param.Type === 'SecureString') return false;
            return true;
          });

          // パラメータの詳細情報を並行処理制限付きで取得
          const processedParams = await this.processParametersBatch(filteredParams);
          parameters.push(...processedParams);
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
            const existingParam = await this.getParameter(parameter.name);
            if (existingParam) {
              // パラメータが存在する場合はエラー
              throw new Error(`Parameter ${parameter.name} already exists. Use overwrite option to update.`);
            } else {
              // パラメータが存在しない場合は正常（新規作成可能）
              Logger.debug(`[DRY-RUN] Parameter does not exist, creation would be possible: ${parameter.name}`);
            }
          }

          // KMSキーIDが指定されている場合の存在確認
          if (parameter.kmsKeyId) {
            Logger.debug(`[DRY-RUN] Validating KMS key: ${parameter.kmsKeyId}`);
            const kmsValidation = await this.validateKmsKeyExists(parameter.kmsKeyId);
            if (!kmsValidation.exists) {
              throw new Error(`[DRY-RUN] ${kmsValidation.error}`);
            }
            Logger.debug(`[DRY-RUN] KMS key validation passed: ${parameter.kmsKeyId}`);
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
        // リトライ機能付きでPutParameterを実行
        await this.putParameterWithRetry(command, parameter.name);

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

  /**
   * KMSキーの存在確認を行う
   * @param kmsKeyId - KMSキーID（キーID、エイリアス、ARNのいずれか）
   * @returns KMSキーが存在し、アクセス可能な場合はtrue
   */
  private async validateKmsKeyExists(kmsKeyId: string): Promise<{ exists: boolean; error?: string }> {
    try {
      const command = new DescribeKeyCommand({
        KeyId: kmsKeyId
      });
      
      const response = await this.kmsClient.send(command);
      
      // キーが削除済みまたは削除スケジュール済みの場合はエラーとする
      if (response.KeyMetadata?.KeyState === 'PendingDeletion' || response.KeyMetadata?.KeyState === 'Disabled') {
        return { 
          exists: false, 
          error: `KMS key '${kmsKeyId}' is ${response.KeyMetadata.KeyState}` 
        };
      }
      
      return { exists: true };
    } catch (error: any) {
      // アクセス権限がない、キーが存在しない等のエラーをキャッチ
      const errorMessage = error.name === 'NotFoundException' 
        ? `KMS key '${kmsKeyId}' does not exist`
        : error.name === 'AccessDeniedException'
        ? `Access denied to KMS key '${kmsKeyId}'. Check IAM permissions`
        : `Failed to validate KMS key '${kmsKeyId}': ${error.message}`;
        
      return { exists: false, error: errorMessage };
    }
  }

  /**
   * Rate Limit対応のリトライ機能付きPutParameter実行
   * 指数バックオフでリトライを行い、Rate Limitエラーを回避する
   */
  private async putParameterWithRetry(command: PutParameterCommand, parameterName: string, attempt: number = 1): Promise<void> {
    try {
      await this.ssmClient.send(command);
    } catch (error: any) {
      // Rate Limitエラーの判定
      const isRateLimitError = error.name === 'Throttling' || 
                               error.name === 'ThrottlingException' ||
                               error.name === 'TooManyRequestsException' ||
                               error.message?.includes('Rate exceeded') ||
                               error.message?.includes('too many requests');

      if (isRateLimitError && attempt <= RATE_LIMIT_CONFIG.MAX_RETRY_ATTEMPTS) {
        // 指数バックオフによる待機時間計算
        const baseDelay = RATE_LIMIT_CONFIG.INITIAL_RETRY_DELAY_MS;
        const backoffDelay = baseDelay * Math.pow(RATE_LIMIT_CONFIG.RETRY_BACKOFF_MULTIPLIER, attempt - 1);
        const finalDelay = Math.min(backoffDelay, RATE_LIMIT_CONFIG.MAX_RETRY_DELAY_MS);
        
        // ジッターを追加（同時リトライの分散）
        const jitter = Math.random() * 200; // 0-200msのランダム待機
        const totalDelay = finalDelay + jitter;
        
        Logger.warning(`Rate limit hit for ${parameterName}. Retrying in ${Math.round(totalDelay)}ms (attempt ${attempt}/${RATE_LIMIT_CONFIG.MAX_RETRY_ATTEMPTS})`);
        
        await new Promise(resolve => setTimeout(resolve, totalDelay));
        
        // 再帰的にリトライ実行
        return this.putParameterWithRetry(command, parameterName, attempt + 1);
      }
      
      // Rate Limitエラー以外、またはリトライ回数超過の場合は例外を再スロー
      throw error;
    }
  }

  /**
   * Rate Limit対応のリトライ機能付きDeleteParameter実行
   * 指数バックオフでリトライを行い、Rate Limitエラーを回避する
   */
  private async deleteParameterWithRetry(command: DeleteParameterCommand, parameterName: string, attempt: number = 1): Promise<void> {
    try {
      await this.ssmClient.send(command);
    } catch (error: any) {
      // Rate Limitエラーの判定
      const isRateLimitError = error.name === 'Throttling' || 
                               error.name === 'ThrottlingException' ||
                               error.name === 'TooManyRequestsException' ||
                               error.message?.includes('Rate exceeded') ||
                               error.message?.includes('too many requests');

      if (isRateLimitError && attempt <= RATE_LIMIT_CONFIG.MAX_RETRY_ATTEMPTS) {
        // 指数バックオフによる待機時間計算
        const baseDelay = RATE_LIMIT_CONFIG.INITIAL_RETRY_DELAY_MS;
        const backoffDelay = baseDelay * Math.pow(RATE_LIMIT_CONFIG.RETRY_BACKOFF_MULTIPLIER, attempt - 1);
        const finalDelay = Math.min(backoffDelay, RATE_LIMIT_CONFIG.MAX_RETRY_DELAY_MS);
        
        // ジッターを追加（同時リトライの分散）
        const jitter = Math.random() * 200; // 0-200msのランダム待機
        const totalDelay = finalDelay + jitter;
        
        Logger.warning(`Rate limit hit for ${parameterName}. Retrying delete in ${Math.round(totalDelay)}ms (attempt ${attempt}/${RATE_LIMIT_CONFIG.MAX_RETRY_ATTEMPTS})`);
        
        await new Promise(resolve => setTimeout(resolve, totalDelay));
        
        // 再帰的にリトライ実行
        return this.deleteParameterWithRetry(command, parameterName, attempt + 1);
      }
      
      // Rate Limitエラー以外、またはリトライ回数超過の場合は例外を再スロー
      throw error;
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

    // rollback状態を保存（dry-runでない場合のみ）
    if (!options.dryRun && (diffResult.summary.create > 0 || diffResult.summary.update > 0)) {
      try {
        const existingParameters: ParameterFromStore[] = [];
        const newParameterNames: string[] = [];

        for (const change of diffResult.changes) {
          if (change.type === 'update' && change.existing) {
            existingParameters.push(change.existing);
          } else if (change.type === 'create') {
            newParameterNames.push(change.parameter.name);
          }
        }

        await RollbackService.saveRollbackState(
          existingParameters,
          newParameterNames,
          this.region,
          options.profile
        );
        Logger.debug(`Rollback state saved for ${existingParameters.length + newParameterNames.length} parameters`);
      } catch (error) {
        Logger.warning(`Failed to save rollback state: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    if (!options.dryRun) {
      const shouldProceed = await this.getUserConfirmation(diffResult);
      if (!shouldProceed) {
        Logger.info('Operation cancelled');
        return result;
      }
    }

    Logger.header('Syncing parameters to AWS Parameter Store');

    // 実際の同期処理（Rate Limit対応のバッチ処理）
    const actionableChanges = diffResult.changes.filter(change => change.type !== 'skip');
    const skipCount = diffResult.changes.filter(change => change.type === 'skip').length;
    
    // スキップしたパラメータのログ出力
    result.skipped += skipCount;
    if (skipCount > 0) {
      Logger.info(`Skipped ${skipCount} parameters (no changes needed)`);
    }

    // バッチサイズでの処理
    const batchSize = RATE_LIMIT_CONFIG.PUT_CONCURRENT_LIMIT;
    for (let i = 0; i < actionableChanges.length; i += batchSize) {
      const batch = actionableChanges.slice(i, i + batchSize);
      
      // バッチ内の処理を並行実行
      const batchPromises = batch.map(async (change) => {
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
      });
      
      // バッチ内の処理を並行実行し、すべて完了を待機
      await Promise.all(batchPromises);
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

    // KMSKeyIdの比較（undefined と空文字列は同じとみなす）
    const existingKmsKeyId = existing.kmsKeyId || '';
    const newKmsKeyId = parameter.kmsKeyId || '';
    if (existingKmsKeyId !== newKmsKeyId) {
      return false;
    }

    // タグの比較
    if (!this.areTagsIdentical(existing.tags || [], parameter.tags || [])) {
      return false;
    }

    return true;
  }

  private areTagsIdentical(existingTags: Array<{ key: string; value: string }>, newTags: Array<{ key: string; value: string }>): boolean {
    // タグ数が異なる場合は差分あり
    if (existingTags.length !== newTags.length) {
      return false;
    }

    // 既存タグをキーでソートして比較
    const sortedExisting = [...existingTags].sort((a, b) => a.key.localeCompare(b.key));
    const sortedNew = [...newTags].sort((a, b) => a.key.localeCompare(b.key));

    for (let i = 0; i < sortedExisting.length; i++) {
      if (sortedExisting[i].key !== sortedNew[i].key || 
          sortedExisting[i].value !== sortedNew[i].value) {
        return false;
      }
    }

    return true;
  }

  /**
   * パラメータの詳細情報を並行処理数制限付きで取得
   * AWS Parameter Store APIのレート制限（40req/s）を考慮して並行処理数を制限
   */
  private async processParametersBatch(params: any[]): Promise<ParameterFromStore[]> {
    const CONCURRENT_LIMIT = RATE_LIMIT_CONFIG.EXPORT_CONCURRENT_LIMIT; // 並行処理数の制限
    const results: ParameterFromStore[] = [];

    // パラメータを並行処理制限付きで処理
    for (let i = 0; i < params.length; i += CONCURRENT_LIMIT) {
      const batch = params.slice(i, i + CONCURRENT_LIMIT);
      const batchPromises = batch.map(async (param) => {
        const description = await this.getParameterDescription(param.Name);
        const tags = await this.getParameterTags(param.Name);
        
        return {
          name: param.Name,
          value: param.Value || '',
          type: (param.Type as 'String' | 'SecureString' | 'StringList') || 'String',
          description: description,
          kmsKeyId: '', // GetParametersByPathCommandでは取得できないため空文字
          lastModifiedDate: param.LastModifiedDate || new Date(),
          lastModifiedUser: '', // GetParametersByPathCommandでは取得できない
          version: param.Version || 1,
          tags: tags
        } as ParameterFromStore;
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // バッチ間に短い待機時間を挿入（レート制限対策）
      if (i + CONCURRENT_LIMIT < params.length) {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_CONFIG.EXPORT_BATCH_DELAY_MS));
      }
    }

    return results;
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
      // Ctrl+Cなどのシグナルハンドリング
      const cleanup = () => {
        rl.close();
        Logger.warning('Operation cancelled by user');
        resolve(false);
      };

      // SIGINT (Ctrl+C) ハンドラー
      const sigintHandler = () => {
        cleanup();
      };

      process.on('SIGINT', sigintHandler);

      // 入力タイムアウト（5分）
      const timeout = setTimeout(() => {
        cleanup();
        Logger.warning('Input timeout reached. Operation cancelled.');
      }, 300000); // 5分

      const askQuestion = () => {
        rl.question('Do you want to proceed with the above changes? (y/n): ', (answer: string) => {
          clearTimeout(timeout);
          process.removeListener('SIGINT', sigintHandler);
          rl.close();

          if (!answer || answer.trim() === '') {
            Logger.warning('Empty input received. Operation cancelled.');
            resolve(false);
            return;
          }

          const response = answer.toLowerCase().trim();
          
          if (response === 'y' || response === 'yes') {
            resolve(true);
          } else if (response === 'n' || response === 'no') {
            resolve(false);
          } else {
            // 無効な入力の場合は再度質問
            Logger.warning(`Invalid input: "${answer}". Please enter 'y' for yes or 'n' for no.`);
            askQuestion();
          }
        });
      };

      askQuestion();
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

  /**
   * 前回のput操作をロールバックする
   * 保存されたrollback状態を基に、パラメータを元の状態に復元
   */
  public async rollbackParameters(): Promise<{ success: number; failed: number; errors: string[] }> {
    const result = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    };

    try {
      // rollback状態を読み込み
      const rollbackState = await RollbackService.loadRollbackState();
      
      if (!rollbackState) {
        throw new Error('No rollback state found or rollback functionality not yet implemented');
      }

      Logger.info(`Found rollback state from ${rollbackState.putTimestamp}`);
      Logger.info(`Region: ${rollbackState.region}`);
      Logger.info(`Affected parameters: ${rollbackState.affectedParameters.length}`);

      // rollback操作のプレビュー表示
      this.displayRollbackPreview(rollbackState);

      // ユーザー確認プロンプト
      const shouldProceed = await this.getRollbackConfirmation(rollbackState);
      if (!shouldProceed) {
        Logger.info('Rollback operation cancelled');
        return result;
      }

      Logger.header('Rolling back parameters to previous state');

      // バッチサイズでのrollback処理（put時と同じ仕様）
      const batchSize = RATE_LIMIT_CONFIG.PUT_CONCURRENT_LIMIT;
      for (let i = 0; i < rollbackState.affectedParameters.length; i += batchSize) {
        const batch = rollbackState.affectedParameters.slice(i, i + batchSize);
        
        // バッチ内の処理を並行実行
        const batchPromises = batch.map(async (paramState) => {
          try {
            if (paramState.action === 'created') {
              // 新規作成されたパラメータを削除
              Logger.info(`Deleting parameter: ${paramState.name}`);
              const command = new DeleteParameterCommand({
                Name: paramState.name
              });
              await this.deleteParameterWithRetry(command, paramState.name);
              result.success++;
              Logger.success(`Deleted parameter: ${paramState.name}`);
            } else if (paramState.action === 'updated' && paramState.previousValue !== undefined) {
              // 更新されたパラメータを元の値に復元
              Logger.info(`Restoring parameter: ${paramState.name}`);
              
              const putCommand = new PutParameterCommand({
                Name: paramState.name,
                Value: paramState.previousValue,
                Type: (paramState.previousType as ParameterType) || 'String',
                Description: paramState.previousDescription,
                KeyId: paramState.previousKmsKeyId,
                Overwrite: true
              });
              
              await this.putParameterWithRetry(putCommand, paramState.name);

              // タグも復元
              if (paramState.previousTags && paramState.previousTags.length > 0) {
                const tagCommand = new AddTagsToResourceCommand({
                  ResourceType: 'Parameter',
                  ResourceId: paramState.name,
                  Tags: paramState.previousTags.map(tag => ({
                    Key: tag.key,
                    Value: tag.value
                  }))
                });
                await this.ssmClient.send(tagCommand);
              }

              result.success++;
              Logger.success(`Restored parameter: ${paramState.name}`);
            }
          } catch (error) {
            result.failed++;
            const errorMsg = `Failed to rollback parameter ${paramState.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            result.errors.push(errorMsg);
            Logger.error(errorMsg);
          }
        });

        // バッチ内の処理を並行実行
        await Promise.all(batchPromises);
      }

      // rollback完了後、状態はクリアしない（put時のみ更新する仕様）
      Logger.info('Rollback completed. State preserved for future operations.');

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(errorMsg);
      throw error;
    }

    return result;
  }

  /**
   * rollback操作のプレビュー表示
   */
  private displayRollbackPreview(rollbackState: RollbackState): void {
    Logger.header('Rollback Preview');
    
    const deleteParams = rollbackState.affectedParameters.filter(p => p.action === 'created');
    const restoreParams = rollbackState.affectedParameters.filter(p => p.action === 'updated');

    if (deleteParams.length > 0) {
      Logger.diffSection('DELETE', deleteParams.length, 'skip');
      deleteParams.forEach(param => {
        Logger.diffDelete(`${param.name} (will be deleted)`);
      });
    }

    if (restoreParams.length > 0) {
      Logger.diffSection('RESTORE', restoreParams.length, 'update');
      restoreParams.forEach(param => {
        Logger.diffUpdate(`${param.name} (will be restored to previous value)`);
        if (param.previousValue) {
          Logger.diffInfo(`    Previous value: ${this.maskValue(param.previousValue)}`);
        }
        if (param.previousType) {
          Logger.diffInfo(`    Previous type: ${param.previousType}`);
        }
      });
    }

    Logger.totalSummary(
      rollbackState.affectedParameters.length,
      0, // create
      restoreParams.length, // update (restore)
      deleteParams.length // delete
    );
  }

  /**
   * rollback実行の確認プロンプト
   */
  private async getRollbackConfirmation(rollbackState: RollbackState): Promise<boolean> {
    const deleteCount = rollbackState.affectedParameters.filter(p => p.action === 'created').length;
    const restoreCount = rollbackState.affectedParameters.filter(p => p.action === 'updated').length;
    
    console.log(chalk.yellow('\n⚠️  WARNING: This will rollback your parameters to the previous state:'));
    if (deleteCount > 0) {
      console.log(chalk.red(`   • ${deleteCount} parameter(s) will be DELETED`));
    }
    if (restoreCount > 0) {
      console.log(chalk.yellow(`   • ${restoreCount} parameter(s) will be RESTORED to previous values`));
    }
    console.log(chalk.gray(`   • Operation timestamp: ${rollbackState.putTimestamp}`));

    return this.getUserConfirmationWithPrompt('\nDo you want to proceed with rollback? (y/N): ');
  }

  /**
   * ユーザー確認プロンプト（rollback用）
   */
  private async getUserConfirmationWithPrompt(promptText: string): Promise<boolean> {
    return new Promise((resolve) => {
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      // タイムアウト処理
      const timeoutDuration = 30000; // 30秒
      const timeout = setTimeout(() => {
        console.log(chalk.gray('\nTimeout reached. Operation cancelled.'));
        rl.close();
        resolve(false);
      }, timeoutDuration);

      // SIGINT (Ctrl+C) 処理
      const sigintHandler = () => {
        console.log(chalk.gray('\nOperation cancelled by user.'));
        clearTimeout(timeout);
        rl.close();
        resolve(false);
      };
      process.on('SIGINT', sigintHandler);

      rl.question(promptText, (answer: string) => {
        clearTimeout(timeout);
        process.removeListener('SIGINT', sigintHandler);
        rl.close();
        
        const normalizedAnswer = answer.trim().toLowerCase();
        resolve(normalizedAnswer === 'y' || normalizedAnswer === 'yes');
      });
    });
  }
}
