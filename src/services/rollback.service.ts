import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ParameterFromStore } from '../types';
import { Logger } from '../utils/logger';

export interface RollbackState {
  putTimestamp: string;
  region: string;
  profile?: string;
  affectedParameters: Array<{
    name: string;
    action: 'created' | 'updated';
    previousValue?: string;
    previousType?: string;
    previousDescription?: string;
    previousKmsKeyId?: string;
    previousTags?: Array<{key: string; value: string}>;
  }>;
}

export class RollbackService {
  private static readonly PARAMATE_DIR = path.join(os.homedir(), '.paramate');
  private static readonly ROLLBACK_FILE = path.join(RollbackService.PARAMATE_DIR, 'last-put-state.json');

  /**
   * .paramate ディレクトリが存在しない場合は作成
   */
  private static ensureParamateDirectory(): void {
    if (!fs.existsSync(RollbackService.PARAMATE_DIR)) {
      fs.mkdirSync(RollbackService.PARAMATE_DIR, { recursive: true });
      Logger.debug(`Created directory: ${RollbackService.PARAMATE_DIR}`);
    }
  }

  /**
   * put操作前の状態を保存
   */
  static async saveRollbackState(
    existingParameters: ParameterFromStore[],
    newParameterNames: string[],
    region: string,
    profile?: string
  ): Promise<void> {
    try {
      RollbackService.ensureParamateDirectory();

      const rollbackState: RollbackState = {
        putTimestamp: new Date().toISOString(),
        region,
        profile,
        affectedParameters: []
      };

      // 既存パラメータの状態を保存（更新対象）
      for (const param of existingParameters) {
        rollbackState.affectedParameters.push({
          name: param.name,
          action: 'updated',
          previousValue: param.value,
          previousType: param.type,
          previousDescription: param.description,
          previousKmsKeyId: param.kmsKeyId,
          previousTags: param.tags
        });
      }

      // 新規作成されるパラメータを記録（既存パラメータと重複しないもののみ）
      for (const paramName of newParameterNames) {
        // 既存パラメータに含まれておらず、まだ記録されていない場合のみ追加
        if (!existingParameters.some(p => p.name === paramName) &&
            !rollbackState.affectedParameters.some(p => p.name === paramName)) {
          rollbackState.affectedParameters.push({
            name: paramName,
            action: 'created'
          });
        }
      }

      fs.writeFileSync(RollbackService.ROLLBACK_FILE, JSON.stringify(rollbackState, null, 2));
      Logger.debug(`Rollback state saved: ${rollbackState.affectedParameters.length} parameters`);
    } catch (error) {
      Logger.error(`Failed to save rollback state: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 保存されたrollback状態を読み込み
   */
  static async loadRollbackState(): Promise<RollbackState | null> {
    try {
      if (!fs.existsSync(RollbackService.ROLLBACK_FILE)) {
        return null;
      }

      const data = fs.readFileSync(RollbackService.ROLLBACK_FILE, 'utf8');
      const rollbackState = JSON.parse(data) as RollbackState;

      // 古すぎる状態は無効とする（7日以上前）
      const putDate = new Date(rollbackState.putTimestamp);
      const now = new Date();
      const daysDiff = (now.getTime() - putDate.getTime()) / (1000 * 60 * 60 * 24);

      if (daysDiff > 7) {
        Logger.warning('Rollback state is too old (>7 days). Clearing expired state.');
        RollbackService.clearRollbackState();
        return null;
      }

      return rollbackState;
    } catch (error) {
      Logger.error(`Failed to load rollback state: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  /**
   * rollback状態ファイルを削除
   */
  static clearRollbackState(): void {
    try {
      if (fs.existsSync(RollbackService.ROLLBACK_FILE)) {
        fs.unlinkSync(RollbackService.ROLLBACK_FILE);
        Logger.debug('Rollback state cleared');
      }
    } catch (error) {
      Logger.error(`Failed to clear rollback state: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * rollback状態が存在するかチェック
   */
  static hasRollbackState(): boolean {
    return fs.existsSync(RollbackService.ROLLBACK_FILE);
  }
}
