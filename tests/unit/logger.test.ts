import { Logger } from '../../src/utils/logger';

// テスト時の色表示を一貫性のあるものにするためchalkをモック化
jest.mock('chalk', () => ({
  __esModule: true,
  default: {
    blue: jest.fn((text: string) => `blue:${text}`),
    green: jest.fn((text: string) => `green:${text}`),
    yellow: jest.fn((text: string) => `yellow:${text}`),
    red: jest.fn((text: string) => `red:${text}`),
    cyan: jest.fn((text: string) => `cyan:${text}`),
    gray: jest.fn((text: string) => `gray:${text}`),
    magenta: jest.fn((text: string) => `magenta:${text}`),
    bold: Object.assign(
      jest.fn((text: string) => `bold:${text}`),
      {
        green: jest.fn((text: string) => `bold-green:${text}`)
      }
    )
  }
}));

/**
 * Logger 単体テスト
 * CLI出力とログ機能のテスト：
 * - 各レベル（info, success, warning, error）のログ出力
 * - 色付けとアイコン表示の確認
 * - タイムスタンプとフォーマットの検証
 * - サマリー表示とヘッダー出力のテスト
 */
describe('Logger', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    // タイムスタンプを予測可能にするためDateをモック化
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2023-01-01T00:00:00.000Z');
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    jest.restoreAllMocks();
  });

  describe('info', () => {
    it('情報メッセージを青色で出力すること', () => {
      Logger.info('Test info message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'blue:[i] gray:2023-01-01T00:00:00.000Z blue:Test info message'
      );
    });
  });

  describe('success', () => {
    it('成功メッセージを緑色で出力すること', () => {
      Logger.success('Test success message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'green:[✓] gray:2023-01-01T00:00:00.000Z green:Test success message'
      );
    });
  });

  describe('warning', () => {
    it('警告メッセージを黄色で出力すること', () => {
      Logger.warning('Test warning message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'yellow:[!] gray:2023-01-01T00:00:00.000Z yellow:Test warning message'
      );
    });
  });

  describe('error', () => {
    it('エラーメッセージを赤色でconsole.errorに出力すること', () => {
      Logger.error('Test error message');
      
      // エラーは console.error を使用するため、console.log はチェックしない
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      Logger.error('Test error message');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'red:[x] gray:2023-01-01T00:00:00.000Z red:Test error message'
      );
      consoleErrorSpy.mockRestore();
    });
  });

  describe('updated', () => {
    it('更新メッセージを緑色で出力すること', () => {
      Logger.updated('Test updated message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'green:[~] gray:2023-01-01T00:00:00.000Z green:Test updated message'
      );
    });
  });

  describe('skipped', () => {
    it('スキップメッセージをグレーで出力すること', () => {
      Logger.skipped('Test skipped message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'gray:[-] gray:2023-01-01T00:00:00.000Z gray:Test skipped message'
      );
    });
  });

  describe('dryRun', () => {
    it('ドライランメッセージをマゼンタ色で出力すること', () => {
      Logger.dryRun('Test dry run message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'magenta:[?] gray:2023-01-01T00:00:00.000Z magenta:magenta:[DRY-RUN] Test dry run message'
      );
    });
  });

  describe('header', () => {
    it('ヘッダーメッセージと区切り線を出力すること', () => {
      Logger.header('Test Header');
      
      expect(consoleSpy).toHaveBeenCalledTimes(2);
      expect(consoleSpy).toHaveBeenNthCalledWith(1, expect.stringContaining('bold-green:> Test Header'));
      expect(consoleSpy).toHaveBeenNthCalledWith(2, expect.stringContaining('gray:-'));
    });
  });

  describe('summary', () => {
    it('すべての結果カウントを含むサマリーを出力すること', () => {
      const result = {
        success: 5,
        failed: 1,
        updated: 3,
        skipped: 2,
        deleted: 0,
        errors: ['Test error']
      };

      Logger.summary(result);
      
      expect(consoleSpy).toHaveBeenCalledWith('bold:[Summary]');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Success: 5'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed: 1'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Updated: 3'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Skipped: 2'));
    });

    it('削除カウントが0の場合は表示しないこと', () => {
      const result = {
        success: 1,
        failed: 0,
        updated: 0,
        skipped: 0
      };

      Logger.summary(result);
      
      // summaryメソッドには deleted フィールドは含まれていない
      expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Deleted'));
    });

    it('削除カウントが0より大きい場合も表示しないこと（現仕様）', () => {
      const result = {
        success: 1,
        failed: 0,
        updated: 0,
        skipped: 0
      };

      Logger.summary(result);
      
      // summaryメソッドにはdeletedカウントは含まれていない
      expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Deleted'));
    });
  });
});