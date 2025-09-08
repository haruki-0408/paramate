import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { loadConfig } from '@aws-sdk/node-config-provider';
import { NODE_REGION_CONFIG_OPTIONS, NODE_REGION_CONFIG_FILE_OPTIONS } from '@aws-sdk/config-resolver';
import { Logger } from '../utils/logger';

/**
 * AWS認証情報と設定を管理するユーティリティクラス
 * AWS SDK v3の標準認証プロバイダーチェーンを使用し、
 * 環境変数、AWSプロファイル、IAMロールなどから認証情報を自動取得
 */
export class AWSCredentials {
  /**
   * AWS SDKクライアント用の設定オブジェクトを生成
   * AWS SDK v3標準のリージョンプロバイダーチェーンとcredentialプロバイダーチェーンを使用
   * 環境変数、設定ファイル、プロファイルから自動的に設定を取得
   */
  public static async createConfig(options: { region?: string; profile?: string } = {}): Promise<any> {
    // AWS SDK標準の認証プロバイダーチェーンで認証情報を自動取得
    const credentials = fromNodeProviderChain({
      profile: options.profile,
      // AssumeRoleでMFAが必要な場合の自動コード入力プロンプト
      mfaCodeProvider: async (mfaSerial: string) => {
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        return new Promise<string>((resolve) => {
          rl.question(`Enter MFA code for ${mfaSerial}: `, (code: string) => {
            rl.close();
            resolve(code.trim());
          });
        });
      }
    });

    // AWS SDK標準のリージョンプロバイダーチェーンでリージョンを自動解決
    // 優先順位: 明示的指定 > 環境変数 > 設定ファイル > デフォルト
    let region: string;
    if (options.region) {
      // 明示的に指定されたリージョンを最優先
      region = options.region;
    } else {
      // AWS SDK標準のリージョン解決チェーンを使用
      const regionProvider = loadConfig(
        NODE_REGION_CONFIG_OPTIONS,
        NODE_REGION_CONFIG_FILE_OPTIONS
      );
      
      try {
        // プロファイル指定がある場合は環境変数でプロファイルを設定
        if (options.profile) {
          const originalProfile = process.env.AWS_PROFILE;
          process.env.AWS_PROFILE = options.profile;
          region = await regionProvider();
          // 元の環境変数を復元
          if (originalProfile) {
            process.env.AWS_PROFILE = originalProfile;
          } else {
            delete process.env.AWS_PROFILE;
          }
        } else {
          region = await regionProvider();
        }
      } catch (error) {
        // AWS SDK標準のリージョン解決に失敗した場合はエラーを投げる
        throw new Error('Could not resolve AWS region. Please set AWS_REGION environment variable or specify region with -r option.');
      }
    }

    return {
      region,
      credentials
    };
  }

  /**
   * AWS設定とコンテキスト情報を一度に取得
   * MFA認証を一回のみ実行し、設定オブジェクトと認証情報を返す
   */
  public static async createConfigWithContext(options: { region?: string; profile?: string } = {}): Promise<{
    config: any;
    context: { account: string; region: string; arn: string; profile?: string };
  }> {
    try {
      const config = await this.createConfig(options);
      const stsClient = new STSClient(config);
      const identity = await stsClient.send(new GetCallerIdentityCommand({}));
      
      const context = {
        account: identity.Account!,
        region: config.region,
        arn: identity.Arn!,
        profile: options.profile
      };

      return { config, context };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`Failed to get AWS context: ${errorMessage}`);
      throw error;
    }
  }

  // 現在のAWS認証コンテキストを表示
  public static async displayCurrentContext(options: { region?: string; profile?: string } = {}): Promise<void> {
    const { context } = await this.createConfigWithContext(options);
    
    Logger.info(`AWS Context:`);
    Logger.info(`  Account: ${context.account}`);
    Logger.info(`  Region:  ${context.region}`);
    Logger.info(`  User:    ${context.arn}`);
    
    if (context.profile) {
      Logger.info(`  Profile: ${context.profile}`);
    }
  }
}