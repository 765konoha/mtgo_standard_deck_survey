# MTGO Standard Results

MTGOで公開されるStandard League 5-0とStandard Challenge Top 8のデッキリストを取得し、日本語カード名で閲覧する静的Webサイトです。サーバーとデータベースは使わず、GitHub ActionsでJSONを生成してGitHub Pagesに公開します。

## 構成

- React 18 / TypeScript / Vite / Tailwind CSS
- データ取得と解析: Node.js scripts
- 公開データ: `public/data/index.json` と `public/data/events/*.json`
- 永続データ: `data/state/events.json`, `data/events/*.json`, `data/cards/en-ja-map.json`
- 生HTML保存: `data/raw/events/*.html`

## ローカル起動

```bash
npm install
npm run dev
```

ビルドと検証:

```bash
npm run typecheck
npm test
npm run build
```

## データ取得

MTGO公式のDecklistsページを起点に対象イベントリンクを検出します。

```bash
npm run fetch:decklists
```

処理対象:

- 新規に検出したStandard League / Standard Challenge
- `pending_publication` の再確認
- `fetch_error` / `parse_error` の再試行
- `--force` または `FORCE_REFETCH=true` 指定時のcompleted再取得

取得ページは `data/raw/events/<eventId>.html` に保存します。解析成功時は `data/events` と `public/data/events` にイベントJSONを書きます。失敗時も既存の正常データは削除しません。

## 状態

- `discovered`: イベント一覧でリンクを初検出
- `pending_publication`: ページは取得できたがデッキリストが未公開または一部のみ
- `completed`: 必要なデッキを解析しJSON保存済み
- `fetch_error`: HTTPエラー、タイムアウト、ネットワークエラー
- `parse_error`: デッキらしき構造はあるが解析不能
- `publication_timeout`: 発見から設定日数を超えても未公開

公開期限は `PUBLICATION_TIMEOUT_DAYS` で変更できます。初期値は7日です。

## カード辞書

辞書は通常の定期取得では更新しません。新セット発売時などに手動で更新します。

```bash
npm run update:dictionary
npm run rebuild:data
npm run build:index
```

データソースはScryfall Bulk Dataの `all_cards` です。英語名、日本語印刷名、カード詳細URL、タイプ分類をローカル辞書に保存します。表示時にカードごとの外部API呼び出しは行いません。日本語名がないカードは英語名で表示し、`translationStatus: "missing"` として集計します。

## JSONスキーマ概要

`public/data/index.json`:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-07-01T22:05:00+09:00",
  "lastSuccessfulUpdateAt": "2026-07-01T22:05:00+09:00",
  "overallStatus": "partial",
  "summary": {
    "completedEvents": 14,
    "pendingEvents": 1,
    "fetchErrors": 0,
    "parseErrors": 0,
    "timedOutEvents": 0,
    "untranslatedCards": 2
  },
  "events": []
}
```

イベントJSON:

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
    "status": "completed",
    "firstSeenAt": "2026-07-01T06:00:00+09:00",
    "fetchedAt": "2026-07-01T22:00:00+09:00"
  },
  "decks": []
}
```

カードは `quantity`, `nameEn`, `nameJa`, `detailUrl`, `typeGroup`, `translationStatus` を持ちます。

## UI

既存の1ページ構成を維持しています。

- 直近10日間の日付切り替え
- すべて / League / Challengeの絞り込み
- Challenge順位、League 5-0表示
- デッキ詳細、メイン/サイド分離
- 日本語 / 日本語+英語 / 英語表示
- カード分類、外部詳細リンク
- 日本語リストコピー、Arena形式コピー
- 公開待ち、取得エラー、解析エラー、公開期限切れ、未変換カード表示

## GitHub Actions

- `.github/workflows/fetch-decklists.yml`
  - 定期実行と手動実行
  - 06:00 / 14:00 / 22:00 JST相当
  - 取得、解析、変換、index生成、ビルド、変更がある場合だけコミット、Pagesデプロイ
- `.github/workflows/update-card-dictionary.yml`
  - 手動実行専用
  - Scryfall Bulk Dataから辞書生成、既存イベント再変換、Pagesデプロイ
- `.github/workflows/deploy-pages.yml`
  - UIや公開JSON変更時の静的デプロイ

GitHub PagesはRepository SettingsのPagesでSourceを「GitHub Actions」にしてください。

## パーサー修正箇所

- イベント判定: `scripts/lib/event-rules.mjs`
- カード名正規化: `scripts/lib/normalize-card-name.mjs`
- HTML解析: `scripts/lib/parse-event-page.mjs`
- 翻訳処理: `scripts/lib/translate-decklists.mjs`
- JSON検証: `scripts/lib/validate-data.mjs`

HTML構造変更時は `data/raw/events/*.html` をフィクスチャ化して `tests/parse-event-page.test.mjs` にケースを追加してください。

## 既知の制約

- MTGOのHTML構造が大きく変わった場合はパーサー修正が必要です。
- Scryfallに日本語名がないカードは英語名で表示されます。
- デッキタイプ判定、価格、勝率、通知、ログイン、管理画面は実装対象外です。
