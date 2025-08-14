import { Parameter, ParameterFromStore, SyncOptions, ExportOptions, SyncResult, ParameterChange, DiffResult } from '../../src/types';

describe('Types', () => {
  describe('Parameter interface', () => {
    it('should allow valid parameter object', () => {
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

    it('should allow SecureString type', () => {
      const parameter: Parameter = {
        name: '/app/secret',
        value: 'secret-value',
        type: 'SecureString'
      };

      expect(parameter.type).toBe('SecureString');
    });

    it('should allow optional fields to be undefined', () => {
      const parameter: Parameter = {
        name: '/app/minimal',
        value: 'value',
        type: 'String'
      };

      expect(parameter.description).toBeUndefined();
      expect(parameter.kmsKeyId).toBeUndefined();
      expect(parameter.tags).toBeUndefined();
    });
  });

  describe('ParameterFromStore interface', () => {
    it('should extend Parameter with additional store fields', () => {
      const parameterFromStore: ParameterFromStore = {
        name: '/app/test',
        value: 'test-value',
        type: 'String',
        description: 'Test parameter',
        lastModifiedDate: new Date('2023-01-01'),
        lastModifiedUser: 'test-user',
        version: 1,
        tags: [{ key: 'Environment', value: 'dev' }]
      };

      expect(parameterFromStore.lastModifiedDate).toBeInstanceOf(Date);
      expect(parameterFromStore.version).toBe(1);
    });
  });

  describe('SyncOptions interface', () => {
    it('should allow valid sync options', () => {
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

    it('should allow minimal sync options', () => {
      const syncOptions: SyncOptions = {
        dryRun: false
      };

      expect(syncOptions.region).toBeUndefined();
      expect(syncOptions.profile).toBeUndefined();
    });
  });

  describe('ExportOptions interface', () => {
    it('should allow valid export options', () => {
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

    it('should allow all fields to be optional', () => {
      const exportOptions: ExportOptions = {};

      expect(Object.keys(exportOptions)).toHaveLength(0);
    });
  });

  describe('SyncResult interface', () => {
    it('should track sync operation results', () => {
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
    it('should represent a parameter change', () => {
      const parameter: Parameter = {
        name: '/app/test',
        value: 'new-value',
        type: 'String'
      };

      const existing: ParameterFromStore = {
        name: '/app/test',
        value: 'old-value',
        type: 'String',
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

    it('should support all change types', () => {
      const parameter: Parameter = {
        name: '/app/test',
        value: 'value',
        type: 'String'
      };

      const createChange: ParameterChange = {
        type: 'create',
        parameter
      };

      const updateChange: ParameterChange = {
        type: 'update',
        parameter
      };

      const deleteChange: ParameterChange = {
        type: 'delete',
        parameter
      };

      const skipChange: ParameterChange = {
        type: 'skip',
        parameter,
        reason: 'No changes detected'
      };

      expect(createChange.type).toBe('create');
      expect(updateChange.type).toBe('update');
      expect(deleteChange.type).toBe('delete');
      expect(skipChange.type).toBe('skip');
    });
  });

  describe('DiffResult interface', () => {
    it('should summarize parameter differences', () => {
      const changes: ParameterChange[] = [
        {
          type: 'create',
          parameter: { name: '/app/new', value: 'value', type: 'String' }
        },
        {
          type: 'update',
          parameter: { name: '/app/existing', value: 'new-value', type: 'String' }
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