# MTGO Standard Results

MTGOで公開されるStandard League 5-0とStandard Challenge Top 8のデッキリストを取得し、日本語カード名で閲覧する静的Webサイトです。サーバーとデータベースは使わず、GitHub ActionsでJSONを生成してGitHub Pagesに公開します。

## 構成

- React 18 / TypeScript / Vite / Tailwind CSS
- データ取得と解析: Node.js scripts
- 公開データ: `public/data/index.json`, `public/data/events/*.json`, `public/data/card-search-index.json`
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
npm run update:dictionary            # Standard全体を更新
SET_CODE=MSH npm run update:dictionary   # 特定セットだけを安全にマージ更新
npm run rebuild:data
npm run build:index
SET_CODE=MSH npm run audit:set       # セット単位の翻訳監査を出力
```

データソースはScryfall Cards Search API（`format:standard`）です。英語名、日本語印刷名、カード詳細URL、タイプ分類、`oracle_id`、`layout`、エキスパンション属性（`setCodes` / `sets` / `primarySetCode`）をローカル辞書に保存します。表示時にカードごとの外部API呼び出しは行いません。日本語名がないカードは英語名で表示し、`translationStatus: "missing"` として集計します。

### エキスパンション属性

各カードは複数セットに再録され得るため、単一の `setCode` ではなく `setCodes`（大文字・重複排除・releasedAt降順の安定ソート）を持ちます。`primarySetCode` は表示用の代表コード（対象セット内で最新の印刷）で、実際に使用された印刷版を断定するものではありません。MTGOのデッキリストは印刷版を明示しないため、複数セットのカードは全てのコードに帰属します。

セットコードは、現在のStandard対象セット一覧 `data/config/standard-set-codes.json` に限定して収集します。この設定は全体更新時に直近のStandard印刷（expansion/core、ローテーション期間内）から自動生成され、必要に応じて手動編集できます。

### セット限定更新（例: MSH）

`SET_CODE=MSH` を指定すると、そのセットの印刷だけを取得し、`oracle_id`で日本語印刷を結合して既存辞書へ安全にマージします（他セットの辞書・既存の日本語名は保持）。Scryfallの日本語印刷キャッシュには有効期限（`SCRYFALL_NEGATIVE_CACHE_TTL_DAYS`、既定7日）があり、新セットの日本語データが後から公開されても再取得されます。`SET_CODE=<code> npm run audit:set` で `data/cards/<code>-translation-audit.json` に監査結果を出力します。

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

`public/data/card-search-index.json`（カード検索用、直近10日間のcompletedイベントのみ）:

```json
{
  "schemaVersion": 2,
  "generatedAt": "2026-07-05T12:00:00+09:00",
  "period": { "startDate": "2026-06-26", "endDate": "2026-07-05", "lookbackDays": 10 },
  "expansions": [
    { "code": "MSH", "name": "Marvel Super Heroes", "releasedAt": "2026-06-26", "cardCount": 19, "deckCount": 99 }
  ],
  "cards": [
    {
      "key": "lightning strike",
      "nameEn": "Lightning Strike",
      "nameJa": "稲妻の一撃",
      "normalizedNameEn": "lightning strike",
      "normalizedNameJa": "稲妻の一撃",
      "setCodes": ["MSH", "TLA", "DFT"],
      "primarySetCode": "MSH",
      "deckCount": 3,
      "deckRefs": [
        { "eventId": "standard-challenge-...", "deckId": "8-boin", "mainboardQuantity": 3, "sideboardQuantity": 0 }
      ]
    }
  ]
}
```

`index.json`／`build:index` 生成時に一緒に生成します（`schemaVersion: 2`）。英語名の正規化キー（`scripts/lib/normalize-card-name.mjs`）でカードをまとめ、同一デッキのメイン／サイドは1つの `deckRef` に統合します。`expansions` は直近10日間に登場した各セットのカード数（`cardCount`）と重複排除デッキ数（`deckCount`）です。`scripts/lib/validate-search-index.mjs` で検証し、不正な場合は既存ファイルを上書きしません。UIは日本語名・英語名の部分一致で検索し、選択カードとエキスパンションを含むデッキだけを日付・イベント種別とAND条件で絞り込みます。エキスパンション選択時はカード候補もそのセットに絞られます。

## UI

既存の1ページ構成を維持しています。

- 直近10日間の日付切り替え
- すべて / League / Challengeの絞り込み
- カード名検索（日本語名・英語名、サジェスト、選択カードを含むデッキの抽出、含有枚数表示）
- エキスパンション絞り込み（該当セットのカードを含むデッキ抽出、セット別枚数・種類数表示、候補のセット絞り込み）
- カード行のセットコードバッジ（複数セットは `[FDN +2]` 形式、tooltipで全コード）
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
  - 入力: `set_code`（空欄で全体更新／`MSH`等でセット限定更新）、`retranslate_events`、`rebuild_search_index`
  - Scryfallから辞書生成、既存イベント再変換、検索インデックス再生成、`set_code`指定時はセット監査、Pagesデプロイ
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
