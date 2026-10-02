# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

NLHE のハンド vs レンジ / レンジ vs レンジ（ヘッズアップ）オールインエクイティ計算ツール。依存ゼロの単一ページアプリ。
README.md に計算方式・列挙 vs モンテカルロの閾値表・検証内容が日本語で詳しくまとまっているので、
アルゴリズムの背景を知りたいときはそちらを先に読むこと。

## コマンド

```sh
npm run build   # src/ -> index.html + dist/artifact.html を生成
npm test        # 全テスト（約10秒）
npm run check   # build してから test
npm run rank    # src/rank-order.json を再計算（約40秒、シード固定で再現可能）
npm run bench   # 評価器などのスループット計測（タイミングはテストに入れない方針）
npm run preflop # src/preflop-table.bin を全列挙で再生成（約8分、8コア）
```

単一テストファイル: `node --test test/equity.test.js`
テスト名で絞る: `node --test --test-name-pattern "exact enumeration"`

## ビルド成果物はコミットされる

`index.html` と `dist/artifact.html` は **生成物だがリポジトリにコミットされている**。
`src/` を触ったら必ず `npm run build`。`test/build.test.js` が両ファイルに現在の `src/` の
バイト列がそのまま含まれることを検査するので、ビルドを忘れるとテストが落ちる。

- `index.html` — doctype/head/body 込みのスタンドアロン版。ダブルクリックで動く
- `dist/artifact.html` — Claude Artifact 用フラグメント。doctype/html/head/body タグを**含んではいけない**（テストで検査）

## src/ にモジュール構文を書かない

`src/evaluator.js` / `src/preflop.js` / `src/rvr.js` / `src/worker.js` / `src/app.js` は `require` / `import` / `export` を一切持たない
プレーンなクラシックスクリプト。ブラウザでは `<script>` 内に連結され、Node では
`tools/load-engine.js` が `new Function` で同じ順序・同じスコープに読み込む。
これにより**テストが叩くバイト列と出荷されるバイト列が同一**になる（`build.test.js` が保証）。

- 読み込み順は evaluator → preflop → rvr → worker → app。前段の関数は後段からグローバルとして見える
- ビルドは evaluator〜worker を `<script id="engine">`、app を別の `<script>` に入れる。`app.js` は `#engine` の
  テキストから Blob URL で Worker を起動するので、**エンジン側のファイルに DOM（`document` / `window`）を書かない**（テストで検査）
- エンジン側に新しいグローバルを足してテストから使いたいときは、`tools/load-engine.js` の `EXPORTS` 配列に名前を追加する
- `PF_TABLE` も同様に `src/preflop-table.bin` を base64 にしてビルドが差し込む。`src/preflop.js` の
  `pfInit` のクラス番号付けを変えると表と食い違うので、その場合は `npm run preflop` で再生成すること
- `RANK_ORDER` は実行時に JSON を読むのではなく、ビルドが `const RANK_ORDER=[...]` を app.js の前に差し込む（UI だけが使うので #engine には入れない）。`src/rank-order.json` を変えたら `npm run build` が必要
- 外部 `<script src>` の追加はテストで禁止されている（スタイルシートは fonts.googleapis.com のみ許可）

## 主要な内部表現

- **カード** = `rank<<2 | suit`（0..51）。rank 0..12 = `'23456789TJQKA'`、suit 0..3 = `'cdhs'`
- **コンボ** = `[card0, card1, weight]`。`weight` は 0..1 の相対値（各レンジ内で相対）
- **13×13 グリッド座標** `[i][j]` はインデックス `12 - rank`。`i===j` ペア、`i<j` スーテッド、`i>j` オフスート
  （`cellOf` / `cellName` / `cellCombos` / `NAME2IJ` で相互変換）
- **ハンド強度** = `eval7()` が返す整数。`Math.floor(v / 0x100000)` がカテゴリ（0 ハイカード 〜 8 ストレートフラッシュ）で、下位ビットがキッカー。大小比較のみが意味を持つ

## computeRangeEquity の呼び出し契約

`computeRangeEquity(rangeA, rangeB, board, dead, opts)` は async。UI は Worker 経由で呼ぶ（`src/worker.js`）が、
フォールバック時はメインスレッドで動くので、内部で `await sleep()` して約30msごとに制御を返す。
ハンド vs レンジも、ヒーローを1コンボのレンジにしてこの関数で解く。`opts` は:

- `onProgress(fraction, partialEquity)` — 進捗と暫定エクイティ（ランナウトをシャッフル順に回すので偏りのない推定）
- `isStale()` — true を返すと中断して `{stale:true}` を返す
- `mcBoards` — デッドカードありのプリフロップでのサンプルボード数（結果欄の「高精度で再計算」ボタン。モンテカルロの結果のときだけ出る）

戻り値は `{equity, win, tie, lose, perCombo, opp:{equity, win, tie, lose, perCombo}, mode:'exact'|'mc', se, nRunouts, nCombos, nCombosOpp}`
か `{error}` か `{stale:true}`。`perCombo` の各要素は `{a, b, w, eq, share}` で、`share` はそのコンボが占める
対戦の重み（Σ share = 1、Σ share·eq = equity）。ブロッカーでコンボごとの相手の重みが変わるので、
集計には `w` ではなく `share` を使うこと。

- ボード 3〜5枚: 全ランナウトのスイープ（ランナウトごとの率を平均せず、分子・分母を合計する）
- ボード 0枚・デッドなし: `pfInit()` の表引き
- ボード 0枚・デッドあり: ボード単位のモンテカルロ（`se` は比推定量の標準誤差）
- ボード 1〜2枚は非対応（`{error}`）

旧エンジン `computeEquity`（ハンド vs レンジ）は `test/reference-equity.js` に移してあり、出荷しない。
`tools/load-engine.js` がテスト用に同じスコープへ読み込み、新エンジンの交差検証に使っている。

## 配色

`src/app.js` に色リテラルを書かない。CSS 変数（`--pole-hi` / `--pole-lo` / `--opp` など）を
`cssVar()` で読み、Oklab 空間で補間する（`divergeLab` / `divergeColor`）。テーマはライトのみ（ダークモードは持たない）。`refreshPalette()` は起動時に一度だけ呼ばれる。

## コードスタイル

`src/` のエンジンと UI は意図的に高密度（1行に複数文、短い識別子、スペースなし）。
成果物サイズとホットループの可読性のトレードオフとして選ばれているので、周囲に合わせること。
一方 `tools/` と `test/` は通常の整形＋「なぜ」を説明するブロックコメントという別のスタイル。
