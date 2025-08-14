// Jest setup file
// Global test configuration and mocks

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: jest.fn().mockImplementation(() => ({
    send: jest.fn()
  })),
  PutParameterCommand: jest.fn(),
  GetParameterCommand: jest.fn(),
  GetParametersByPathCommand: jest.fn(),
  AddTagsToResourceCommand: jest.fn(),
  ParameterType: {
    String: 'String',
    SecureString: 'SecureString'
  }
}));

jest.mock('@aws-sdk/credential-providers', () => ({
  fromNodeProviderChain: jest.fn(() => ({}))
}));

// Mock console methods for cleaner test output
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeEach(() => {
  // Reset all mocks before each test
  jest.clearAllMocks();
});

afterAll(() => {
  // Restore original console methods
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});