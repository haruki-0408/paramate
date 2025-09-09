import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * CLI 統合テスト
 * 実際のCLIコマンドを子プロセスとして実行し、エンドツーエンドでの動作をテスト：
 * - 各コマンド（generate-template, validate, put, rollback）の動作検証
 * - エラーハンドリングと適切な終了コードの確認
 * - AWS認証エラー、CSVバリデーションなどの統合テスト
 */
describe('CLI Integration Tests', () => {
  let tempDir: string;
  const CLI_PATH = path.resolve(__dirname, '../../dist/cli/cli.js');

  beforeAll(async () => {
    // CLIがビルドされていることを確認
    if (!fs.existsSync(CLI_PATH)) {
      throw new Error('CLI not built. Run `npm run build` first.');
    }
  });

  beforeEach(() => {
    // 各テスト用の一時ディレクトリを作成
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-integration-test-'));
  });

  afterEach(() => {
    // テスト後のクリーンアップ
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const runCLI = (args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
    return new Promise((resolve) => {
      const child = spawn('node', [CLI_PATH, ...args], {
        stdio: 'pipe',
        env: {
          ...process.env,
          AWS_PROFILE: 'test-profile-that-does-not-exist' // 実際AWS呼び出しを防止
        }
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code || 0
        });
      });
    });
  };

  // CSVテンプレート生成コマンドのテスト
  describe('generate-template command', () => {
    it('デフォルト設定でテンプレートを生成できること', async () => {
      const templatePath = path.join(tempDir, 'test-template.csv');
      
      const result = await runCLI(['generate-template', '-o', templatePath]);

      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(templatePath)).toBe(true);

      const content = fs.readFileSync(templatePath, 'utf8');
      expect(content).toContain('name,value,type,description,kmsKeyId,tags');
      expect(content).toContain('/myapp/database/host');
      expect(content).toContain('localhost');
    });

    it('サンプルなしテンプレートを生成できること', async () => {
      const templatePath = path.join(tempDir, 'no-examples.csv');
      
      const result = await runCLI(['generate-template', '-o', templatePath, '--no-examples']);

      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(templatePath)).toBe(true);

      const content = fs.readFileSync(templatePath, 'utf8');
      expect(content).toContain('name,value,type,description,kmsKeyId,tags');
      expect(content).not.toContain('localhost');
    });
  });

  // CSVバリデーションコマンドのテスト
  describe('validate command', () => {
    it('正しいCSVファイルを検証できること', async () => {
      const csvContent = [
        'name,value,type,description,kmsKeyId,tags',
        '/app/test,test-value,String,Test parameter,,Environment=dev'
      ].join('\n');

      const csvPath = path.join(tempDir, 'valid.csv');
      fs.writeFileSync(csvPath, csvContent);

      const result = await runCLI(['validate', '-f', csvPath]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('CSV file is valid');
    });

    it('バリデーションエラーを検出できること', async () => {
      const csvContent = [
        'name,value,type,description',
        'invalid-name,value,String,Description'
      ].join('\n');

      const csvPath = path.join(tempDir, 'invalid.csv');
      fs.writeFileSync(csvPath, csvContent);

      const result = await runCLI(['validate', '-f', csvPath]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Errors found in CSV file');
    });

    it('行数制限を強制できること', async () => {
      const headers = 'name,value,type,description';
      const rows = Array.from({ length: 501 }, (_, i) => 
        `/app/test${i + 1},value${i + 1},String,Description ${i + 1}`
      );
      const csvContent = [headers, ...rows].join('\n');

      const csvPath = path.join(tempDir, 'too-many-rows.csv');
      fs.writeFileSync(csvPath, csvContent);

      const result = await runCLI(['validate', '-f', csvPath]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CSV file exceeds maximum row limit: 501 rows (maximum allowed: 500). Please split the file into smaller chunks.');
    });

    it('パラメータ名長さ制限を強制できること', async () => {
      const longName = '/' + 'a'.repeat(500); // 501 characters
      const csvContent = [
        'name,value,type,description',
        `${longName},value,String,Description`
      ].join('\n');

      const csvPath = path.join(tempDir, 'long-name.csv');
      fs.writeFileSync(csvPath, csvContent);

      const result = await runCLI(['validate', '-f', csvPath]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Parameter name exceeds maximum length of 500 characters: 501');
    });

    it('説明文長さ制限を強制できること', async () => {
      const longDescription = 'a'.repeat(501);
      const csvContent = [
        'name,value,type,description',
        `/app/test,value,String,${longDescription}`
      ].join('\n');

      const csvPath = path.join(tempDir, 'long-description.csv');
      fs.writeFileSync(csvPath, csvContent);

      const result = await runCLI(['validate', '-f', csvPath]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Parameter description exceeds maximum length of 500 characters: 501');
    });

    it('タグ長さ制限を強制できること', async () => {
      const longKey = 'a'.repeat(129);
      const csvContent = [
        'name,value,type,description,kmsKeyId,tags',
        `/app/test,value,String,Description,,${longKey}=value`
      ].join('\n');

      const csvPath = path.join(tempDir, 'long-tag.csv');
      fs.writeFileSync(csvPath, csvContent);

      const result = await runCLI(['validate', '-f', csvPath]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Tag key exceeds maximum length: 129 characters (maximum allowed: 128)');
    });

    it('ファイルが見つからない場合を適切に処理できること', async () => {
      const result = await runCLI(['validate', '-f', '/nonexistent/file.csv']);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CSV file not found at path: /nonexistent/file.csv');
    });
  });

  // Putコマンド（ドライラン）のテスト
  describe('put command (dry-run)', () => {
    it('認証エラーを適切に処理できること', async () => {
      const csvContent = [
        'name,value,type,description',
        '/app/test,test-value,String,Test parameter'
      ].join('\n');

      const csvPath = path.join(tempDir, 'test.csv');
      fs.writeFileSync(csvPath, csvContent);

      const result = await runCLI(['put', '-f', csvPath, '--dry-run']);

      // Should fail due to invalid AWS profile, but gracefully
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('failed');
    });
  });

  // ロールバックコマンドのテスト
  describe('rollback command', () => {
    it('認証エラーを適切に処理できること', async () => {
      const result = await runCLI(['rollback']);

      // AWS region/認証エラーが発生するため、適切に処理できることを確認
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/Could not (resolve AWS region|load credentials)/)
    });
  });

  // ヘルプとバージョン情報のテスト
  describe('help and version', () => {
    it('ヘルプを表示できること', async () => {
      const result = await runCLI(['--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Tool to put parameters from CSV to AWS Parameter Store with rollback support');
    });

    it('バージョンを表示できること', async () => {
      const result = await runCLI(['--version']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('1.0.0');
    });
  });
});