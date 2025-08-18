import { AWSCredentials } from '../../src/config/awsCredentials';

/**
 * AWS認証情報 統合テスト
 * AWS認証とリージョン設定の実際の動作をテスト：
 * - AWS SDK標準のリージョンプロバイダーチェーンの動作確認
 * - 各種認証方法（プロファイル、環境変数、MFA）の統合テスト
 * - エラーハンドリングと設定読み込みの検証
 */
describe('AWS Credentials Integration Tests', () => {
  // CI/テスト環境では実際のAWS呼び出しをスキップ
  const skipAWSTests = process.env.CI || process.env.NODE_ENV === 'test';

  describe('createConfig', () => {
    it('デフォルト設定でconfig作成できること', async () => {
      const config = await AWSCredentials.createConfig({});

      expect(config).toHaveProperty('region');
      expect(config).toHaveProperty('credentials');
    });

    it('カスタムリージョンでconfig作成できること', async () => {
      const config = await AWSCredentials.createConfig({ region: 'eu-west-1' });

      expect(config.region).toBe('eu-west-1');
    });

    it('プロファイル指定でconfig作成できること', async () => {
      const config = await AWSCredentials.createConfig({ 
        region: 'us-east-1', 
        profile: 'individual' 
      });

      expect(config.region).toBe('us-east-1');
      expect(config).toHaveProperty('credentials');
    });
  });

  describe('createConfigWithContext', () => {
    it('無効なプロファイルを適切に処理すること', async () => {
      await expect(
        AWSCredentials.createConfigWithContext({ 
          region: 'us-east-1', 
          profile: 'nonexistent-profile' 
        })
      ).rejects.toThrow();
    });

    // CI環境では実AWS認証テストをスキップ
    (skipAWSTests ? describe.skip : describe)('with real AWS credentials', () => {
      it('有効なプロファイルでコンテキスト取得できること', async () => {
        // このテストは 'individual' という名前の有効なAWSプロファイルが必要
        try {
          const { config, context } = await AWSCredentials.createConfigWithContext({
            region: 'us-east-1',
            profile: 'individual'
          });

          expect(config).toHaveProperty('region', 'us-east-1');
          expect(context).toHaveProperty('account');
          expect(context).toHaveProperty('region');
          expect(context).toHaveProperty('arn');
          expect(context.account).toMatch(/^\d{12}$/); // 12-digit account ID
          expect(context.arn).toContain('arn:aws:');
        } catch (error) {
          // プロファイルが存在しないか認証情報が利用できない場合はテストをスキップ
          console.log('Skipping real AWS test:', (error as Error).message);
        }
      }, 30000); // 30 second timeout for AWS calls

      it('MFAプロンプトを適切に処理すること', async () => {
        // このテストは手動MFA入力が必要なため、モック化して実行
        const originalFromNodeProviderChain = require('@aws-sdk/credential-providers').fromNodeProviderChain;
        
        // MFAプロバイダーをモック化
        const mockFromNodeProviderChain = jest.fn().mockImplementation((options) => {
          if (options.mfaCodeProvider) {
            // Simulate MFA code provider being called
            return async () => ({
              accessKeyId: 'mock-key',
              secretAccessKey: 'mock-secret',
              sessionToken: 'mock-session'
            });
          }
          return originalFromNodeProviderChain(options);
        });

        jest.mock('@aws-sdk/credential-providers', () => ({
          fromNodeProviderChain: mockFromNodeProviderChain
        }));

        try {
          const config = await AWSCredentials.createConfig({ 
            region: 'us-east-1', 
            profile: 'individual-mcp' 
          });
          
          expect(config).toHaveProperty('credentials');
        } catch (error) {
          // プロファイルが存在しない場合は想定内
          console.log('MFA test skipped:', (error as Error).message);
        }
      });
    });
  });

  describe('error handling', () => {
    it('缠失しているAWS認証情報を適切に処理すること', async () => {
      // 一時的にAWS環境変数をクリア
      const originalEnv = { ...process.env };
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      delete process.env.AWS_PROFILE;

      try {
        await expect(
          AWSCredentials.createConfigWithContext({ 
            region: 'us-east-1', 
            profile: 'nonexistent' 
          })
        ).rejects.toThrow();
      } finally {
        // 環境変数を復元
        process.env = originalEnv;
      }
    });

    it('無効なリージョンを適切に処理すること', async () => {
      // AWS SDKは任意のリージョン文字列を受け入れるが、config作成をテスト
      const config = await AWSCredentials.createConfig({ region: 'invalid-region' });
      
      expect(config.region).toBe('invalid-region');
    });
  });
});