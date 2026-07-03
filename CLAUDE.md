# CLAUDE.md

このファイルは、このリポジトリで作業する際に Claude Code が守るべき恒常的なルールをまとめたものです。
詳細な手順・JSONスキーマ・状態定義は `README.md` を参照してください。ここには README と重複しない「制約」を中心に記載します。

## システム概要

MTGO で公開される Standard の大会結果を取得し、日本語カード名で閲覧できる **静的Webサイト**。

- 対象: Standard League の 5-0 デッキ / Standard Challenge 系イベントの Top 8 / 直近10日間のイベント
- 構成: MTGO公開ページ → GitHub Actions で定期取得 → 解析 → 英→日変換 → JSON保存 → React 静的UI → GitHub Pages 公開
- **サーバー・データベース・ユーザー認証・通知は一切使用しない。**

技術: React 18 / TypeScript / Vite 5 / Tailwind CSS 3。取得・解析は Node.js の `.mjs` スクリプト（標準ライブラリ + `fetch`）。テストは `node:test`。

## 主要コマンド

| 用途 | コマンド |
|---|---|
| 開発サーバー | `npm run dev` |
| 本番ビルド | `npm run build` |
| 型チェック | `npm run typecheck` |
| Lint | `npm run lint` |
| テスト | `npm test` |
| デッキリスト取得 | `npm run fetch:decklists` |
| カード辞書更新（手動） | `npm run update:dictionary` |
| 既存イベント再変換 | `npm run rebuild:data` |
| index/検索index再生成 | `npm run build:index` |
| 翻訳監査 | `npm run audit:translations` |

変更後は最低限 `npm run typecheck && npm run lint && npm test && npm run build` を通すこと。

## データ保存場所

- `data/raw/events/*.html` … 取得した生HTML
- `data/events/*.json` … イベント単位の永続JSON
- `data/cards/` … 辞書（`en-ja-map.json`）、手動補正（`manual-overrides.json`）、Scryfallキャッシュ等
- `data/state/events.json` … イベント状態の永続化
- `public/data/index.json` / `public/data/events/*.json` / `public/data/card-search-index.json` … 公開JSON

**過去イベントJSONは削除しない。** UIに表示する範囲だけを直近10日間に限定する。

## データ・状態の不変条件

- 取得失敗・解析失敗が起きても、**既存の正常なJSONを不完全なデータで上書きしない**（`scripts/fetch-mtgo-events.mjs` の `writeNonCompletedEventIfSafe` / `hasValidCompletedEventJson`）。
- イベント一覧にリンクがあるだけでは `completed` にしない。必要なデッキを取得・検証できた場合のみ `completed`。
- 状態を混同しない: `pending_publication`（未公開/一部のみ）と `parse_error`（構造はあるが解析不能）は別物。
- **JSONスキーマの互換性を維持する**（`schemaVersion` を含む）。破壊的変更をしない。
- Windows と GitHub Actions（Linux）の両環境で動くようにする。

## カード辞書・翻訳の注意

- 辞書は通常の定期取得では更新しない。**新セット発売時などに GitHub Actions から手動更新**する。
- **表示時に Scryfall API を呼ばない。**
- Bulk JSON を一括でメモリ展開しない。API利用時はページ単位で逐次処理し、大量並列リクエストを送らない。
- 日本語名がなくても処理全体を止めない（英語名で表示し `translationStatus: "missing"` として集計）。
- 現在の翻訳処理は正常動作している。**明確な不具合が確認されない限り変更しない。** 手動補正やハードコードを安易に追加しない。

## UI の制約

- 既存UI（Bolt由来）を**ゼロから作り直さない**。デザインテーマを勝手に変更しない。
- 既存コンポーネント（`src/components/*`）を可能な限り再利用する。
- レスポンシブ挙動（PC / スマートフォン両対応）を維持する。
- UIライブラリの全面移行・不要な大規模リファクタリングをしない。
- 要件にない機能を独自判断で追加しない。
- データ取得は相対パス（`useData.ts` の `./data`）+ Vite `base: './'`。GitHub Pages のサブパス公開前提を崩さない。

## GitHub Actions の運用

ワークフロー: `fetch-decklists.yml`（定期＋手動取得）/ `update-card-dictionary.yml`（手動・辞書更新）/ `deploy-pages.yml`（Pagesデプロイ）。

- `workflow_dispatch` を利用可能にし、schedule 実行と手動実行を区別する。
- 定期実行は増分取得。手動実行では必要に応じて過去10日分を取得（`LOOKBACK_DAYS` / `force_backfill`）。
- `concurrency` を設定し、同時デプロイを重複させない。
- 変更がない場合は不要なコミット・デプロイをしない（`public/data` の差分で判定）。
- GITHUB_TOKEN のコミットを契機に別ワークフローが連鎖する前提に依存しない。
- 必要最小限の権限のみ付与する。Secrets をコードやログに出さない。

## 実装しない機能

サーバー / データベース / ログイン / ユーザー登録 / 通知 / お気に入り / コメント / デッキ評価 / 勝率表示 / 対戦履歴 / カード価格 / 管理画面 / ブラウザ上のJSON編集 / 外部ページのiframe埋め込み / 表示時の外部カードAPI呼び出し。

## 作業ブランチ

- `main` へ直接コミット・マージしない。作業内容に応じた作業ブランチを使用する。
- 外部アクセス（MTGO / Scryfall）は必要最小限にする。調査目的で大量アクセスしない。
