import { Parameter, ParameterFromStore, SyncOptions, ExportOptions, SyncResult, ParameterChange, DiffResult } from '../../src/types';

/**
 * Types 単体テスト
 * TypeScript型定義の正しさをテスト：
 * - Parameter、ParameterFromStoreの基本的なインターフェース
 * - SyncOptions、ExportOptionsの設定オプション
 * - SyncResult、ParameterChange、DiffResultの結果オブジェクト
 */
describe('Types', () => {
  describe('Parameter interface', () => {
    it('有効なパラメータオブジェクトを受け入れること', () => {
      const parameter: Parameter = {
        name: '/app/test',
        value: 'test-value',
        type: 'String',
        description: 'Test parameter',
        kmsKeyId: 'alias/test-key',
        tags: [{ key: 'Environment', value: 'dev' }]
      };

      expect(parameter.name).toBe('/app/test');
      expect(parameter.type).toBe('String');
    });

    it('SecureStringタイプをサポートすること', () => {
      const parameter: Parameter = {
        name: '/app/secret',
        value: 'secret-value',
        type: 'SecureString',
        description: 'Secret parameter',
        kmsKeyId: 'alias/secret-key',
        tags: []
      };

      expect(parameter.type).toBe('SecureString');
    });

    it('すべてのフィールドを必須とすること', () => {
      const parameter: Parameter = {
        name: '/app/minimal',
        value: 'value',
        type: 'String',
        description: '',
        kmsKeyId: '',
        tags: []
      };

      expect(parameter.description).toBe('');
      expect(parameter.kmsKeyId).toBe('');
      expect(parameter.tags).toEqual([]);
    });
  });

  describe('ParameterFromStore interface', () => {
    it('Parameterを拡張してParameter Store固有のフィールドを追加すること', () => {
      const parameterFromStore: ParameterFromStore = {
        name: '/app/test',
        value: 'test-value',
        type: 'String',
        description: 'Test parameter',
        kmsKeyId: '',
        tags: [{ key: 'Environment', value: 'dev' }],
        lastModifiedDate: new Date('2023-01-01'),
        lastModifiedUser: 'test-user',
        version: 1
      };

      expect(parameterFromStore.lastModifiedDate).toBeInstanceOf(Date);
      expect(parameterFromStore.version).toBe(1);
    });
  });

  describe('SyncOptions interface', () => {
    it('有効な同期オプションを受け入れること', () => {
      const syncOptions: SyncOptions = {
        dryRun: true,
        region: 'us-east-1',
        profile: 'default',
        pathPrefix: '/app',
        recursive: true
      };

      expect(syncOptions.dryRun).toBe(true);
      expect(syncOptions.pathPrefix).toBe('/app');
    });

    it('最小限の同期オプションを受け入れること', () => {
      const syncOptions: SyncOptions = {
        dryRun: false
      };

      expect(syncOptions.region).toBeUndefined();
      expect(syncOptions.profile).toBeUndefined();
    });
  });

  describe('ExportOptions interface', () => {
    it('有効なエクスポートオプションを受け入れること', () => {
      const exportOptions: ExportOptions = {
        region: 'us-west-2',
        profile: 'production',
        pathPrefix: '/prod',
        recursive: false,
        outputFile: 'export.csv',
        includeSecureStrings: false,
        decryptSecureStrings: false
      };

      expect(exportOptions.includeSecureStrings).toBe(false);
      expect(exportOptions.outputFile).toBe('export.csv');
    });

    it('すべてのフィールドをオプショナルとすること', () => {
      const exportOptions: ExportOptions = {};

      expect(Object.keys(exportOptions)).toHaveLength(0);
    });
  });

  describe('SyncResult interface', () => {
    it('同期操作の結果を追跡すること', () => {
      const syncResult: SyncResult = {
        success: 5,
        failed: 1,
        updated: 3,
        skipped: 2,
        deleted: 0,
        errors: ['Parameter creation failed: /app/test']
      };

      expect(syncResult.success + syncResult.failed + syncResult.updated + syncResult.skipped + syncResult.deleted).toBe(11);
      expect(syncResult.errors).toHaveLength(1);
    });
  });

  describe('ParameterChange interface', () => {
    it('パラメータの変更を表現すること', () => {
      const parameter: Parameter = {
        name: '/app/test',
        value: 'new-value',
        type: 'String',
        description: 'Test parameter',
        kmsKeyId: '',
        tags: []
      };

      const existing: ParameterFromStore = {
        name: '/app/test',
        value: 'old-value',
        type: 'String',
        description: 'Test parameter',
        kmsKeyId: '',
        tags: [],
        lastModifiedDate: new Date(),
        lastModifiedUser: 'user',
        version: 1
      };

      const change: ParameterChange = {
        type: 'update',
        parameter,
        existing,
        reason: 'Value changed'
      };

      expect(change.type).toBe('update');
      expect(change.existing?.value).toBe('old-value');
    });

    it('すべての変更タイプをサポートすること', () => {
      const parameter: Parameter = {
        name: '/app/test',
        value: 'value',
        type: 'String',
        description: 'Test parameter',
        kmsKeyId: '',
        tags: []
      };

      const createChange: ParameterChange = {
        type: 'create',
        parameter,
        existing: null,
        reason: 'Parameter does not exist'
      };

      const updateChange: ParameterChange = {
        type: 'update',
        parameter,
        existing: null,
        reason: 'Parameter value changed'
      };

      const deleteChange: ParameterChange = {
        type: 'delete',
        parameter,
        existing: null,
        reason: 'Parameter to be deleted'
      };

      const skipChange: ParameterChange = {
        type: 'skip',
        parameter,
        existing: null,
        reason: 'No changes detected'
      };

      expect(createChange.type).toBe('create');
      expect(updateChange.type).toBe('update');
      expect(deleteChange.type).toBe('delete');
      expect(skipChange.type).toBe('skip');
    });
  });

  describe('DiffResult interface', () => {
    it('パラメータの差分を集約すること', () => {
      const changes: ParameterChange[] = [
        {
          type: 'create',
          parameter: {
            name: '/app/new',
            value: 'value',
            type: 'String',
            description: '',
            kmsKeyId: '',
            tags: []
          },
          existing: null,
          reason: 'New parameter'
        },
        {
          type: 'update',
          parameter: {
            name: '/app/existing',
            value: 'new-value',
            type: 'String',
            description: '',
            kmsKeyId: '',
            tags: []
          },
          existing: null,
          reason: 'Value changed'
        }
      ];

      const diffResult: DiffResult = {
        changes,
        summary: {
          create: 1,
          update: 1,
          delete: 0,
          skip: 0
        }
      };

      expect(diffResult.changes).toHaveLength(2);
      expect(diffResult.summary.create + diffResult.summary.update).toBe(2);
    });
  });
});