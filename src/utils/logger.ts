import chalk from 'chalk';

// OS互換性を考慮したアイコン設定
const ICONS = {
  info: '[i]',
  success: '[✓]',
  warning: '[!]',
  error: '[×]',
  updated: '[~]',
  skipped: '[-]',
  dryRun: '[?]',
  create: '[+]',
  update: '[~]'
} as const;

export class Logger {
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

  static info(message: string): void {
    this.log('info', message, chalk.blue);
  }

  static success(message: string): void {
    this.log('success', message, chalk.green);
  }

  static warning(message: string): void {
    this.log('warning', message, chalk.yellow);
  }

  static error(message: string): void {
    const timestamp = chalk.gray(new Date().toISOString());
    const icon = this.getIcon('error');
    console.error(`${chalk.red(icon)} ${timestamp} ${chalk.red(message)}`);
  }

  static updated(message: string): void {
    this.log('updated', message, chalk.cyan);
  }

  static skipped(message: string): void {
    this.log('skipped', message, chalk.gray);
  }

  static dryRun(message: string): void {
    this.log('dryRun', `${chalk.magenta('[DRY-RUN]')} ${message}`, chalk.magenta);
  }

  static separator(): void {
    console.log(chalk.gray('-'.repeat(60)));
  }

  static header(title: string): void {
    console.log(`\n${chalk.bold.blue(`> ${title}`)}`);
    this.separator();
  }

  static summary(result: { success: number; failed: number; updated: number; skipped: number }): void {
    console.log();
    this.separator();
    console.log(chalk.bold(`[Summary]`));
    console.log(`  ${chalk.green(`${this.getIcon('success')} Success:`)} ${result.success}`);
    console.log(`  ${chalk.red(`${this.getIcon('error')} Failed:`)} ${result.failed}`);
    console.log(`  ${chalk.cyan(`${this.getIcon('updated')} Updated:`)} ${result.updated}`);
    console.log(`  ${chalk.gray(`${this.getIcon('skipped')} Skipped:`)} ${result.skipped}`);
    this.separator();
  }

  // 差分表示用のヘルパーメソッド
  static diffSection(title: string, count: number, iconType: 'create' | 'update' | 'skip'): void {
    const icons = {
      create: '[CREATE]',
      update: '[UPDATE]', 
      skip: '[SKIP]'
    };
    Logger.info(`\n${icons[iconType]} ${title} (${count} items):`);
  }

  static totalSummary(total: number, create: number, update: number, skip: number): void {
    Logger.info(`\n[TOTAL] Total: ${total} items (Create: ${create}, Update: ${update}, Skip: ${skip})`);
    Logger.separator();
  }

  // 矢印文字のヘルパーメソッド
  static getArrow(): string {
    return '->';
  }
}
