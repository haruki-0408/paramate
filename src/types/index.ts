export interface Parameter {
  name: string;
  value: string;
  type: 'String' | 'SecureString';
  description?: string;
  kmsKeyId?: string;
  tags?: Array<{ key: string; value: string }>;
}

export interface ParameterFromStore extends Parameter {
  lastModifiedDate?: Date;
  lastModifiedUser?: string;
  version?: number;
}

export interface SyncOptions {
  dryRun: boolean;
  region?: string;
  profile?: string;
  pathPrefix?: string;
  recursive?: boolean;
}

export interface ExportOptions {
  region?: string;
  profile?: string;
  pathPrefix?: string;
  recursive?: boolean;
  outputFile?: string;
  includeSecureStrings?: boolean;
  decryptSecureStrings?: boolean;
}

export interface SyncResult {
  success: number;
  failed: number;
  updated: number;
  skipped: number;
  deleted: number;
  errors: string[];
}

export interface ParameterChange {
  type: 'create' | 'update' | 'delete' | 'skip';
  parameter: Parameter;
  existing?: ParameterFromStore;
  reason?: string;
}

export interface DiffResult {
  changes: ParameterChange[];
  summary: {
    create: number;
    update: number;
    delete: number;
    skip: number;
  };
}

export interface CSVRecord {
  [key: string]: string;
}

export type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'debug';

export interface TemplateOptions {
  outputPath?: string;
  includeExamples?: boolean;
}
