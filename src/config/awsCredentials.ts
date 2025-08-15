import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { Logger } from '../utils/logger';

/**
 * AWS SDK v3標準認証プロバイダーチェーンを使用した設定ファクトリー
 */
export class AWSCredentials {
  /**
   * AWS SDKクライアント用の設定オブジェクトを生成
   * AWS SDK v3標準の認証プロバイダーチェーンを使用
   */
  static createConfig(options: { region?: string; profile?: string } = {}): any {
    const config: any = {
      region: options.region || process.env.AWS_REGION || 'us-east-1'
    };

    // AWS SDK v3標準の認証プロバイダーチェーン
    config.credentials = fromNodeProviderChain({
      profile: options.profile,
      // AssumeRole + MFA自動対応
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

    return config;
  }

  /**
   * AWS設定とコンテキスト情報を一度に取得
   * MFA認証を一回のみ実行し、設定オブジェクトと認証情報を返す
   */
  static async createConfigWithContext(options: { region?: string; profile?: string } = {}): Promise<{
    config: any;
    context: { account: string; region: string; arn: string; profile?: string };
  }> {
    try {
      const config = this.createConfig(options);
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

  /**
   * 現在のAWS認証コンテキストを表示
   */
  static async displayCurrentContext(options: { region?: string; profile?: string } = {}): Promise<void> {
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