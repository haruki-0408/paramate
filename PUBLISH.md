# NPM Publish ガイド

このドキュメントは `aws-parameter-sync-cli` パッケージをnpmに公開する手順を説明します。

## 事前準備

### 1. npmアカウントの作成
```bash
# npmアカウントを作成（まだの場合）
npm adduser
# または
npm login
```

### 2. GitHubリポジトリの設定
1. GitHubでリポジトリを作成
2. package.jsonの以下の項目を実際の値に更新：
   - `author`: あなたの名前とメールアドレス
   - `repository.url`: 実際のGitHubリポジトリURL
   - `bugs.url`: GitHubのissues URL
   - `homepage`: GitHubリポジトリのURL

### 3. パッケージ名の確認
```bash
# パッケージ名が利用可能かチェック
npm view aws-parameter-sync-cli
# エラーが返れば利用可能
```

## パブリッシュ手順

### 1. 最終確認
```bash
# 依存関係をインストール
npm install

# TypeScriptビルド
npm run build

# リントチェック
npm run lint

# 型チェック
npm run type-check
```

### 2. バージョン管理
```bash
# バージョンを更新（初回は不要）
npm version patch  # バグ修正
npm version minor  # 新機能追加
npm version major  # 破壊的変更
```

### 3. ドライラン（推奨）
```bash
# 実際に公開する前にチェック
npm publish --dry-run
```

### 4. 公開
```bash
# 公開実行
npm publish

# スコープ付きパッケージの場合（パブリック）
npm publish --access public
```

## 公開後の確認

### 1. インストールテスト
```bash
# グローバルインストールテスト
npm install -g aws-parameter-sync-cli

# コマンド動作確認
aps --help

# クリーンアップ
npm uninstall -g aws-parameter-sync-cli
```

### 2. npmページの確認
https://www.npmjs.com/package/aws-parameter-sync-cli

## トラブルシューティング

### パッケージ名が既に存在する場合
```bash
# スコープ付きパッケージ名に変更
# package.jsonで name を "@yourusername/aps" に変更
npm publish --access public
```

### 認証エラーの場合
```bash
# ログイン状態を確認
npm whoami

# 再ログイン
npm logout
npm login
```

### ビルドエラーの場合
```bash
# node_modulesとdistを削除して再ビルド
rm -rf node_modules dist
npm install
npm run build
```

## 更新時の手順

1. コードを修正
2. `npm version patch/minor/major`
3. `git push && git push --tags`
4. `npm publish`

## 公開するファイル

以下のファイルが公開されます：
- `dist/` - ビルドされたJavaScriptファイル
- `package.json`
- `README.md`
- `LICENSE`

`.npmignore`で除外されるファイル：
- `src/` - TypeScriptソースファイル
- `node_modules/`
- テストファイル
- 開発用設定ファイル