# iLiFE! Live Signal

iLiFE! の活動情報を、以下の公開情報から統合表示する非公式ダッシュボードです。

- HEROINES公式NEWS（`https://heroines.jp/news/news.json` と各詳細ページ）
- X公式アカウント（`@iLiFE_official`、`r.jina.ai` ミラー経由）
- イベントカレンダー（月表示・日別表示）

## 起動方法

```bash
npm run dev
```

ブラウザで `http://localhost:3000` を開いてください。

## 構成

- `/server.mjs`: 集約API + 静的ファイル配信
- `/public/index.html`: UI
- `/public/style.css`: デザイン
- `/public/app.js`: 描画ロジック
  - イベントカレンダー描画（前月/次月切り替え）

## API

- `GET /api/feed`: 集約データ
- `GET /api/feed?refresh=1`: キャッシュ無視で再取得
- `GET /api/health`: ヘルスチェック

## GitHub Pages へ公開する場合

このプロジェクトは「フロント（静的） + バックエンドAPI（Node）」構成です。  
GitHub Pages には `public/` の静的ファイルのみを公開し、`server.mjs` は別ホスティング（Render/Railway/Fly.io など）へ配置してください。

1. バックエンドをデプロイして公開URLを取得
2. バックエンド環境変数 `CORS_ALLOW_ORIGIN` に Pages URL を設定  
   例: `https://yoshito1974.github.io`
3. `public/config.js` の `API_BASE_URL` をバックエンドURLへ変更
4. `public/` の中身を GitHub Pages 対象リポジトリへ配置して push

例（Pages側リポジトリでの配置イメージ）:

```bash
# Pagesリポジトリのルートで実行
cp -R /path/to/ilife/public/* .
git add .
git commit -m "deploy: ilife live signal frontend"
git push origin main
```

## 注意

- Xは公式APIではなくミラー経由で取得するため、取得結果が不安定になる場合があります。
- 本サイトは非公式のまとめ表示です。最終的な情報は各公式リンク先で確認してください。
