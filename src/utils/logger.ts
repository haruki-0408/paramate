import chalk from 'chalk';

/**
 * コンソール出力用のアイコン定義
 * ログレベルごとに異なるアイコンで視覚的に区別
 */
const ICONS = {
  info: '[i]',      // 情報メッセージ
  success: '[✓]',   // 成功メッセージ
  warning: '[!]',    // 警告メッセージ
  error: '[x]',      // エラーメッセージ
  updated: '[~]',    // 更新メッセージ
  skipped: '[-]',    // スキップメッセージ
  dryRun: '[?]',     // ドライランモード
  create: '[+]',     // 作成操作
  update: '[~]',     // 更新操作
  debug: '[d]'       // デバッグメッセージ
} as const;

/**
 * アプリケーションのログ出力を管理するユーティリティクラス
 * タイムスタンプ付きの色付きログ、アイコン付きメッセージを提供
 */
export class Logger {
  // ログレベルに対応するアイコンを取得
  private static getIcon(iconKey: keyof typeof ICONS): string {
    return ICONS[iconKey];
  }

  private static log(iconKey: keyof typeof ICONS, message: string, color?: (text: string) => string): void {
    const timestamp = chalk.gray(new Date().toISOString());
    const icon = this.getIcon(iconKey);
    const coloredIcon = color ? color(icon) : icon;
    const coloredMessage = color ? color(message) : message;
    console.log(`${coloredIcon} ${timestamp} ${coloredMessage}`);
  }

  public static info(message: string): void {
    this.log('info', message, chalk.blue);
  }

  public static success(message: string): void {
    this.log('success', message, chalk.green);
  }

  public static warning(message: string): void {
    this.log('warning', message, chalk.yellow);
  }

  public static error(message: string): void {
    const timestamp = chalk.gray(new Date().toISOString());
    const icon = this.getIcon('error');
    console.error(`${chalk.red(icon)} ${timestamp} ${chalk.red(message)}`);
  }

  public static updated(message: string): void {
    this.log('updated', message, chalk.green);
  }

  public static skipped(message: string): void {
    this.log('skipped', message, chalk.gray);
  }

  public static dryRun(message: string): void {
    this.log('dryRun', `${chalk.magenta('[DRY-RUN]')} ${message}`, chalk.magenta);
  }

  public static debug(message: string): void {
    this.log('debug', message, chalk.gray);
  }

  public static separator(): void {
    console.log(chalk.gray('-'.repeat(60)));
  }

  public static header(title: string): void {
    console.log(`\n${chalk.bold.green(`> ${title}`)}`);
    this.separator();
  }

  public static summary(result: { success: number; failed: number; updated: number; skipped: number }): void {
    console.log();
    this.separator();
    console.log(chalk.bold('[Summary]'));
    console.log(`  ${chalk.green(`${this.getIcon('success')} Success:`)} ${result.success}`);
    console.log(`  ${chalk.red(`${this.getIcon('error')} Failed:`)} ${result.failed}`);
    console.log(`  ${chalk.green(`${this.getIcon('updated')} Updated:`)} ${result.updated}`);
    console.log(`  ${chalk.gray(`${this.getIcon('skipped')} Skipped:`)} ${result.skipped}`);
    this.separator();
  }

  // 差分表示用のヘルパーメソッド
  public static diffSection(title: string, count: number, iconType: 'create' | 'update' | 'skip'): void {
    const sections = {
      create: chalk.green(`[CREATE] ${title} (${count} items):`),
      update: chalk.green(`[UPDATE] ${title} (${count} items):`),
      skip: chalk.gray(`[SKIP] ${title} (${count} items):`)
    };
    console.log(`\n${sections[iconType]}`);
  }

  public static totalSummary(total: number, create: number, update: number, skip: number): void {
    console.log(`\n${chalk.green(`[TOTAL] Total: ${total} items (Create: ${create}, Update: ${update}, Skip: ${skip})`)}`);
    Logger.separator();
  }


  // diff専用のログメソッド
  public static diffCreate(message: string): void {
    console.log(chalk.green(`  + ${message}`));
  }

  public static diffUpdate(message: string): void {
    console.log(chalk.green(`  ~ ${message}`));
  }

  public static diffDelete(message: string): void {
    console.log(chalk.red(`  - ${message}`));
  }

  public static diffInfo(message: string): void {
    console.log(`    ${message}`);
  }
}
