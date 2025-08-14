import { ParameterStoreService } from '../../src/services/parameter-store.service';
import { Parameter, ParameterFromStore, SyncOptions, ExportOptions } from '../../src/types';
import { SSMClient } from '@aws-sdk/client-ssm';

// Mock the console methods to avoid polluting test output
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});

describe('ParameterStoreService', () => {
  let parameterStoreService: ParameterStoreService;
  let mockSSMClient: jest.Mocked<SSMClient>;

  beforeEach(() => {
    parameterStoreService = new ParameterStoreService('us-east-1', 'default');
    mockSSMClient = (parameterStoreService as unknown as { ssmClient: jest.Mocked<SSMClient> }).ssmClient;
  });

  describe('getParameter', () => {
    it('should return parameter when found', async () => {
      const mockResponse = {
        Parameter: {
          Name: '/app/test',
          Value: 'test-value',
          Type: 'String',
          Description: 'Test parameter',
          LastModifiedDate: new Date('2023-01-01'),
          Version: 1
        }
      };

      mockSSMClient.send = jest.fn().mockResolvedValue(mockResponse);

      const result = await parameterStoreService.getParameter('/app/test');

      expect(result).toEqual({
        name: '/app/test',
        value: 'test-value',
        type: 'String',
        description: 'Test parameter',
        lastModifiedDate: new Date('2023-01-01'),
        lastModifiedUser: undefined,
        version: 1,
        tags: []
      });
    });

    it('should return null when parameter not found', async () => {
      const error = new Error('Parameter not found');
      error.name = 'ParameterNotFound';
      mockSSMClient.send = jest.fn().mockRejectedValue(error);

      const result = await parameterStoreService.getParameter('/nonexistent');

      expect(result).toBeNull();
    });

    it('should throw error for other AWS errors', async () => {
      const error = new Error('Access denied');
      error.name = 'AccessDenied';
      mockSSMClient.send = jest.fn().mockRejectedValue(error);

      await expect(parameterStoreService.getParameter('/app/test'))
        .rejects.toThrow('Access denied');
    });
  });

  describe('exportParameters', () => {
    it('should export parameters successfully', async () => {
      const mockResponse = {
        Parameters: [
          {
            Name: '/app/test1',
            Value: 'value1',
            Type: 'String',
            Description: 'Test parameter 1',
            LastModifiedDate: new Date('2023-01-01'),
            Version: 1
          },
          {
            Name: '/app/test2',
            Value: 'value2',
            Type: 'SecureString',
            Description: 'Test parameter 2',
            LastModifiedDate: new Date('2023-01-02'),
            Version: 2
          }
        ],
        NextToken: undefined
      };

      mockSSMClient.send = jest.fn().mockResolvedValue(mockResponse);

      const exportOptions: ExportOptions = {
        pathPrefix: '/app',
        recursive: true,
        includeSecureStrings: true,
        decryptSecureStrings: true
      };

      const result = await parameterStoreService.exportParameters(exportOptions);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('/app/test1');
      expect(result[1].name).toBe('/app/test2');
    });

    it('should handle pagination', async () => {
      const mockResponse1 = {
        Parameters: [
          {
            Name: '/app/test1',
            Value: 'value1',
            Type: 'String',
            LastModifiedDate: new Date('2023-01-01'),
            Version: 1
          }
        ],
        NextToken: 'next-token'
      };

      const mockResponse2 = {
        Parameters: [
          {
            Name: '/app/test2',
            Value: 'value2',
            Type: 'String',
            LastModifiedDate: new Date('2023-01-02'),
            Version: 2
          }
        ],
        NextToken: undefined
      };

      mockSSMClient.send = jest.fn()
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      const exportOptions: ExportOptions = {
        pathPrefix: '/app',
        recursive: true
      };

      const result = await parameterStoreService.exportParameters(exportOptions);

      expect(result).toHaveLength(2);
      expect(mockSSMClient.send).toHaveBeenCalledTimes(2);
    });

    it('should exclude SecureString parameters when specified', async () => {
      const mockResponse = {
        Parameters: [
          {
            Name: '/app/test1',
            Value: 'value1',
            Type: 'String',
            LastModifiedDate: new Date('2023-01-01'),
            Version: 1
          },
          {
            Name: '/app/test2',
            Value: 'value2',
            Type: 'SecureString',
            LastModifiedDate: new Date('2023-01-02'),
            Version: 2
          }
        ],
        NextToken: undefined
      };

      mockSSMClient.send = jest.fn().mockResolvedValue(mockResponse);

      const exportOptions: ExportOptions = {
        pathPrefix: '/app',
        includeSecureStrings: false
      };

      const result = await parameterStoreService.exportParameters(exportOptions);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('/app/test1');
    });
  });

  describe('putParameter', () => {
    it('should create new parameter successfully', async () => {
      mockSSMClient.send = jest.fn().mockResolvedValue({});

      const parameter: Parameter = {
        name: '/app/test',
        value: 'test-value',
        type: 'String',
        description: 'Test parameter'
      };

      await expect(parameterStoreService.putParameter(parameter, false))
        .resolves.not.toThrow();

      expect(mockSSMClient.send).toHaveBeenCalledTimes(1);
    });

    it('should update existing parameter with tags', async () => {
      mockSSMClient.send = jest.fn().mockResolvedValue({});

      const parameter: Parameter = {
        name: '/app/test',
        value: 'test-value',
        type: 'String',
        description: 'Test parameter',
        tags: [{ key: 'Environment', value: 'dev' }]
      };

      await parameterStoreService.putParameter(parameter, true);

      expect(mockSSMClient.send).toHaveBeenCalledTimes(2); // PutParameter + AddTags
    });
  });

  describe('calculateDiff', () => {
    it('should identify new parameters', async () => {
      const parameters: Parameter[] = [
        {
          name: '/app/new',
          value: 'new-value',
          type: 'String'
        }
      ];

      // Mock parameter not found
      const error = new Error('Parameter not found');
      error.name = 'ParameterNotFound';
      mockSSMClient.send = jest.fn().mockRejectedValue(error);

      const result = await parameterStoreService.calculateDiff(parameters);

      expect(result.summary.create).toBe(1);
      expect(result.summary.update).toBe(0);
      expect(result.summary.skip).toBe(0);
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].type).toBe('create');
    });

    it('should identify parameters to update', async () => {
      const parameters: Parameter[] = [
        {
          name: '/app/existing',
          value: 'new-value',
          type: 'String'
        }
      ];

      const mockResponse = {
        Parameter: {
          Name: '/app/existing',
          Value: 'old-value', // Different value
          Type: 'String'
        }
      };

      mockSSMClient.send = jest.fn().mockResolvedValue(mockResponse);

      const result = await parameterStoreService.calculateDiff(parameters);

      expect(result.summary.create).toBe(0);
      expect(result.summary.update).toBe(1);
      expect(result.summary.skip).toBe(0);
      expect(result.changes[0].type).toBe('update');
    });

    it('should identify parameters to skip', async () => {
      const parameters: Parameter[] = [
        {
          name: '/app/same',
          value: 'same-value',
          type: 'String'
        }
      ];

      const mockResponse = {
        Parameter: {
          Name: '/app/same',
          Value: 'same-value', // Same value
          Type: 'String'
        }
      };

      mockSSMClient.send = jest.fn().mockResolvedValue(mockResponse);

      const result = await parameterStoreService.calculateDiff(parameters);

      expect(result.summary.create).toBe(0);
      expect(result.summary.update).toBe(0);
      expect(result.summary.skip).toBe(1);
      expect(result.changes[0].type).toBe('skip');
    });
  });

  describe('syncParameters', () => {
    beforeEach(() => {
      // Mock user confirmation to always return true
      jest.spyOn(parameterStoreService as unknown as { getUserConfirmation: () => Promise<boolean> }, 'getUserConfirmation')
        .mockResolvedValue(true);
    });

    it('should sync parameters in dry run mode', async () => {
      const parameters: Parameter[] = [
        {
          name: '/app/test',
          value: 'test-value',
          type: 'String'
        }
      ];

      // Mock parameter not found (new parameter)
      const error = new Error('Parameter not found');
      error.name = 'ParameterNotFound';
      mockSSMClient.send = jest.fn().mockRejectedValue(error);

      const syncOptions: SyncOptions = {
        dryRun: true,
        region: 'us-east-1'
      };

      const result = await parameterStoreService.syncParameters(parameters, syncOptions);

      expect(result.success).toBe(1);
      expect(result.failed).toBe(0);
      // In dry run mode, putParameter should not be called
      expect(mockSSMClient.send).toHaveBeenCalledWith(expect.objectContaining({
        input: expect.objectContaining({
          Name: '/app/test'
        })
      })); // Only GetParameter called
    });

    it('should sync parameters in normal mode', async () => {
      const parameters: Parameter[] = [
        {
          name: '/app/test',
          value: 'test-value',
          type: 'String'
        }
      ];

      // Mock parameter not found, then successful put
      const getError = new Error('Parameter not found');
      getError.name = 'ParameterNotFound';
      
      mockSSMClient.send = jest.fn()
        .mockRejectedValueOnce(getError) // GetParameter fails
        .mockRejectedValueOnce(getError) // GetParameter fails again in diff calculation
        .mockResolvedValueOnce({}); // PutParameter succeeds

      const syncOptions: SyncOptions = {
        dryRun: false,
        region: 'us-east-1'
      };

      const result = await parameterStoreService.syncParameters(parameters, syncOptions);

      expect(result.success).toBe(1);
      expect(result.failed).toBe(0);
      expect(mockSSMClient.send).toHaveBeenCalledTimes(3); // 2x GetParameter + 1x PutParameter
    });
  });
});