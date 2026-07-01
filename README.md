# MTGO Standard Results

MTG Onlineで公開されるStandardフォーマットのデッキリストを日本語で閲覧するためのWebアプリケーションです。

- Standard League 5-0デッキ
- Standard Challenge Top 8デッキ

## 特徴

- 日本語カード名での表示（日本語のみ / 日本語＋英語 / 英語のみの切り替え可能）
- レスポンシブデザイン（PC / タブレット / スマートフォン対応）
- ダークテーマ
- 外部カード詳細ページへのリンク（Scryfall等）
- デッキリストのコピー機能（日本語形式 / MTG Arena形式）
- 公開待ち・取得エラー・解析エラーの状態表示

## 技術スタック

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Lucide React（アイコン）

## ローカル環境での実行

### 前提条件

- Node.js 18以上
- npm 9以上

### 手順

1. 依存パッケージをインストール

```bash
npm install
```

2. 開発サーバーを起動

```bash
npm run dev
```

3. ブラウザで `http://localhost:5173` を開く

### ビルド

本番用ビルドを作成：

```bash
npm run build
```

ビルド成果物は `dist` ディレクトリに出力されます。

ビルド結果をプレビュー：

```bash
npm run preview
```

## データ構造

### ファイル配置

```
public/
└── data/
    ├── index.json          # 全体のインデックス
    └── events/
        ├── standard-challenge-32-2026-06-30.json
        └── standard-league-2026-06-30.json
```

### index.json

全体のインデックスファイルです。

```json
{
  "generatedAt": "2026-07-01T22:05:00+09:00",
  "lastSuccessfulUpdateAt": "2026-07-01T22:05:00+09:00",
  "overallStatus": "success",
  "summary": {
    "completedEvents": 14,
    "pendingEvents": 0,
    "fetchErrors": 0,
    "parseErrors": 0,
    "untranslatedCards": 2
  },
  "events": [
    {
      "id": "standard-challenge-32-2026-06-30",
      "name": "Standard Challenge 32",
      "eventType": "challenge",
      "eventDate": "2026-06-30",
      "publishedDate": "2026-07-01",
      "status": "completed",
      "deckCount": 8,
      "sourceUrl": "https://www.mtgo.com/decklist/...",
      "dataFile": "./events/standard-challenge-32-2026-06-30.json"
    }
  ]
}
```

### イベントJSON

各イベントの詳細データです。

```json
{
  "schemaVersion": 1,
  "event": {
    "id": "standard-challenge-32-2026-06-30",
    "name": "Standard Challenge 32",
    "eventType": "challenge",
    "eventDate": "2026-06-30",
    "publishedDate": "2026-07-01",
    "sourceUrl": "https://www.mtgo.com/decklist/...",
    "status": "completed"
  },
  "decks": [
    {
      "id": "deck-1",
      "player": "PlayerA",
      "placement": 1,
      "record": "7-1",
      "mainboardCount": 60,
      "sideboardCount": 15,
      "mainboard": [
        {
          "quantity": 4,
          "nameEn": "Lightning Strike",
          "nameJa": "稲妻の一撃",
          "detailUrl": "https://scryfall.com/card/...",
          "category": "instant",
          "translationStatus": "complete"
        }
      ],
      "sideboard": []
    }
  ]
}
```

### League形式

League 5-0デッキの場合：

```json
{
  "id": "league-deck-1",
  "player": "PlayerB",
  "placement": null,
  "record": "5-0",
  ...
}
```

### フィールド説明

| フィールド | 説明 |
|-----------|------|
| `generatedAt` | データ生成日時（ISO 8601形式） |
| `overallStatus` | 全体ステータス（success / partial / failed / pending） |
| `eventType` | イベント種別（challenge / league） |
| `eventDate` | イベント開催日 |
| `publishedDate` | MTGO掲載日 |
| `status` | イベントステータス |
| `placement` | 順位（Challengeの場合） |
| `record` | 戦績（Leagueは 5-0） |
| `detailUrl` | カード詳細ページURL（存在しない場合はnull） |
| `category` | カードカテゴリ（creature / instant / sorcery / enchantment / artifact / planeswalker / battle / land / other） |
| `translationStatus` | 翻訳ステータス（complete / missing） |

### イベントステータス

| ステータス | 説明 |
|-----------|------|
| `completed` | 正常に取得完了 |
| `pending_publication` | デッキリスト公開待ち |
| `fetch_error` | ページ取得失敗 |
| `parse_error` | ページ解析失敗 |
| `publication_timeout` | 公開タイムアウト |

## GitHub Pagesへのデプロイ

### 自動デプロイ（GitHub Actions使用しない場合）

1. リポジトリを作成し、コードをプッシュ

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/USERNAME/REPOSITORY.git
git push -u origin main
```

2. ビルドを実行

```bash
npm run build
```

3. `dist` ディレクトリの中身をGitHub Pagesとして公開

方法A: `gh-pages` ブランチを使用

```bash
npx gh-pages -d dist
```

方法B: GitHub設定から `main` ブランチの `/`（root）または `docs` フォルダを指定

※ この場合、`dist` の中身をリポジトリルートまたは `docs` フォルダに配置してください。

### カスタムドメイン（オプション）

`public/CNAME` ファイルを作成し、ドメイン名を記載：

```
your-domain.com
```

## 開発

### 型チェック

```bash
npm run typecheck
```

### Lint

```bash
npm run lint
```

### ディレクトリ構造

```
src/
├── App.tsx                    # メインアプリコンポーネント
├── components/
│   ├── CardList.tsx          # カードリスト表示
│   ├── DeckDetail.tsx        # デッキ詳細モーダル
│   ├── ErrorState.tsx        # エラー状態表示
│   ├── EventCard.tsx         # イベントカード
│   ├── EventList.tsx         # イベント一覧
│   ├── FilterBar.tsx         # フィルターバー
│   ├── Header.tsx            # ヘッダー
│   ├── ProcessingStatusPanel.tsx  # 処理状態パネル
│   ├── Toast.tsx             # トースト通知
│   └── UpdateStatus.tsx      # 更新状態サマリー
├── hooks/
│   └── useData.ts            # データ読み込みフック
├── types/
│   └── index.ts              # TypeScript型定義
└── utils/
    └── helpers.ts            # ユーティリティ関数
```

## 実装対象外

以下は本アプリの対象外です：

- MTGOサイトからのスクレイピング
- デッキリスト取得処理
- カード英日辞書の生成
- ユーザー認証
- データベース
- 外部APIへのリアルタイムアクセス
- 通知機能（Slack / Discord / メール等）
- カード画像・ルールテキスト・価格情報の表示

## ライセンス

MIT License
