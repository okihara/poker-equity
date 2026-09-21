# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

NLHE のハンド vs レンジ オールインエクイティ計算ツール。依存ゼロの単一ページアプリ。
README.md に計算方式・列挙 vs モンテカルロの閾値表・検証内容が日本語で詳しくまとまっているので、
アルゴリズムの背景を知りたいときはそちらを先に読むこと。

## コマンド

```sh
npm run build   # src/ -> index.html + dist/artifact.html を生成
npm test        # 全テスト（約13秒）
npm run check   # build してから test
npm run rank    # src/rank-order.json を再計算（約40秒、シード固定で再現可能）
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

`src/evaluator.js` / `src/equity.js` / `src/app.js` は `require` / `import` / `export` を一切持たない
プレーンなクラシックスクリプト。ブラウザでは `<script>` 内に連結され、Node では
`tools/load-engine.js` が `new Function` で同じ順序・同じスコープに読み込む。
これにより**テストが叩くバイト列と出荷されるバイト列が同一**になる（`build.test.js` が保証）。

- 読み込み順は evaluator → equity → app。前段の関数は後段からグローバルとして見える
- エンジン側に新しいグローバルを足してテストから使いたいときは、`tools/load-engine.js` の `EXPORTS` 配列に名前を追加する
- `RANK_ORDER` は実行時に JSON を読むのではなく、ビルドが `const RANK_ORDER=[...]` を evaluator の前に差し込む。`src/rank-order.json` を変えたら `npm run build` が必要
- 外部 `<script src>` の追加はテストで禁止されている（スタイルシートは fonts.googleapis.com のみ許可）

## 主要な内部表現

- **カード** = `rank<<2 | suit`（0..51）。rank 0..12 = `'23456789TJQKA'`、suit 0..3 = `'cdhs'`
- **コンボ** = `[card0, card1, weight]`。`weight` は 0..1 の相対値で、エクイティは `Σ w·eq / Σ w`
- **13×13 グリッド座標** `[i][j]` はインデックス `12 - rank`。`i===j` ペア、`i<j` スーテッド、`i>j` オフスート
  （`cellOf` / `cellName` / `cellCombos` / `NAME2IJ` で相互変換）
- **ハンド強度** = `eval7()` が返す整数。`Math.floor(v / 0x100000)` がカテゴリ（0 ハイカード 〜 8 ストレートフラッシュ）で、下位ビットがキッカー。大小比較のみが意味を持つ

## computeEquity の呼び出し契約

`computeEquity(hero, board, rawCombos, opts)` は async。UI をブロックしないために内部で
`await sleep()` して定期的に制御を返す。`opts` は:

- `onProgress(fraction)` — 進捗コールバック
- `isStale()` — true を返すと計算を中断し `{stale:true}` を返す（入力が変わったときのキャンセル用）
- `mcTotal` — モンテカルロ時の総サンプル数（UI の「精度」ボタン）

戻り値は `{equity, win, tie, lose, mode:'exact'|'mc', se, perCombo, ...}` か、
`{error}`（レンジが全ブロック）か `{stale:true}`。`残りボード通り数 × コンボ数 <= 3e7`（`EXACT_BUDGET`）
で完全列挙、超えるとコンボ層化モンテカルロに切り替わる。層化しているのはヒートマップの各マスに
サンプルを行き渡らせるため — 単純なランダム抽出に変えると `perCombo` が壊れる。

## 配色

`src/app.js` に色リテラルを書かない。CSS 変数（`--pole-hi` / `--pole-lo` / `--opp` など）を
`cssVar()` で読み、Oklab 空間で補間する（`divergeColor` / `weightColor`）。ライト/ダークは
`prefers-color-scheme` と `:root[data-theme]` の両方で切り替わり、どちらの変化も MutationObserver /
matchMedia リスナーが拾って `refreshPalette()` → 再描画する。

## コードスタイル

`src/` のエンジンと UI は意図的に高密度（1行に複数文、短い識別子、スペースなし）。
成果物サイズとホットループの可読性のトレードオフとして選ばれているので、周囲に合わせること。
一方 `tools/` と `test/` は通常の整形＋「なぜ」を説明するブロックコメントという別のスタイル。
