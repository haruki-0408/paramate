import { Logger } from '../../src/utils/logger';
import chalk from 'chalk';

// Mock chalk to make colors consistent in tests
jest.mock('chalk', () => ({
  __esModule: true,
  default: {
    blue: jest.fn((text: string) => `blue:${text}`),
    green: jest.fn((text: string) => `green:${text}`),
    yellow: jest.fn((text: string) => `yellow:${text}`),
    red: jest.fn((text: string) => `red:${text}`),
    cyan: jest.fn((text: string) => `cyan:${text}`),
    gray: jest.fn((text: string) => `gray:${text}`),
    magenta: jest.fn((text: string) => `magenta:${text}`)
  }
}));

describe('Logger', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    // Mock Date to make timestamps predictable
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2023-01-01T00:00:00.000Z');
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    jest.restoreAllMocks();
  });

  describe('info', () => {
    it('should log info message with blue color', () => {
      Logger.info('Test info message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'blue:ℹ gray:2023-01-01T00:00:00.000Z blue:Test info message'
      );
    });
  });

  describe('success', () => {
    it('should log success message with green color', () => {
      Logger.success('Test success message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'green:✓ gray:2023-01-01T00:00:00.000Z green:Test success message'
      );
    });
  });

  describe('warning', () => {
    it('should log warning message with yellow color', () => {
      Logger.warning('Test warning message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'yellow:⚠ gray:2023-01-01T00:00:00.000Z yellow:Test warning message'
      );
    });
  });

  describe('error', () => {
    it('should log error message with red color', () => {
      Logger.error('Test error message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'red:✗ gray:2023-01-01T00:00:00.000Z red:Test error message'
      );
    });
  });

  describe('updated', () => {
    it('should log updated message with cyan color', () => {
      Logger.updated('Test updated message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'cyan:↻ gray:2023-01-01T00:00:00.000Z cyan:Test updated message'
      );
    });
  });

  describe('skipped', () => {
    it('should log skipped message with gray color', () => {
      Logger.skipped('Test skipped message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'gray:⊝ gray:2023-01-01T00:00:00.000Z gray:Test skipped message'
      );
    });
  });

  describe('dryRun', () => {
    it('should log dry run message with magenta color', () => {
      Logger.dryRun('Test dry run message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'magenta:⚡ gray:2023-01-01T00:00:00.000Z magenta:Test dry run message'
      );
    });
  });

  describe('header', () => {
    it('should log header message with separator', () => {
      Logger.header('Test Header');
      
      expect(consoleSpy).toHaveBeenCalledTimes(3);
      expect(consoleSpy).toHaveBeenNthCalledWith(1, '');
      expect(consoleSpy).toHaveBeenNthCalledWith(2, expect.stringContaining('Test Header'));
      expect(consoleSpy).toHaveBeenNthCalledWith(3, '────────────────────────────────────────────────────────────');
    });
  });

  describe('summary', () => {
    it('should log summary with all result counts', () => {
      const result = {
        success: 5,
        failed: 1,
        updated: 3,
        skipped: 2,
        deleted: 0,
        errors: ['Test error']
      };

      Logger.summary(result);
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('概要'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('成功: 5'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('失敗: 1'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('更新: 3'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('スキップ: 2'));
    });

    it('should not show deleted count when zero', () => {
      const result = {
        success: 1,
        failed: 0,
        updated: 0,
        skipped: 0,
        deleted: 0,
        errors: []
      };

      Logger.summary(result);
      
      expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('削除'));
    });

    it('should show deleted count when greater than zero', () => {
      const result = {
        success: 1,
        failed: 0,
        updated: 0,
        skipped: 0,
        deleted: 2,
        errors: []
      };

      Logger.summary(result);
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('削除: 2'));
    });
  });
});