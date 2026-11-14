# 発注書：SKILL QUEST 新規4タブの器追加（2026-11-14）

## 目的
SKILL QUEST（netamade/skill-quest）に新しい学習タブを4件追加する。今回は「器（config＋空の問題バンク）」だけを追加し、問題は後から配信DB（sq-questions-api）へ別途投入する。Power Automate 追加時（PR #3）と同じ手順・同じ粒度で実施すること。

## 追加する4ツール
いずれも data.js の `window.KT_DATA` にエントリを追加する。フィールド構成（schemaVersion／productId／prefix／displayName／disclaimer／versions／editions／tiers／domains／objectives／judgement／テーマ色フィールド等）は既存ツールの config に厳密に合わせること。tiers は各ツールとも単一ティア（id: "basic"、name: "基礎"）とする。模試（mock exam）の定義は持たない。judgement は既存ツールと同じ値（window 20／minEvidence 8／decay 0.9／labels 未着手・挑戦中・安定・マスター）。

### 1. DX実務スキル
- productId: `dxskill`、prefix: `DX`、displayName: `DX実務スキル`、テーマ色: `#2E7D4F`
- domains（code／name／weight）:
  - HEAR ヒアリング 16
  - STR 業務の構造化 16
  - DIA 図の使い分け 16
  - REQ 要件定義 18
  - REW 手戻り防止 16
  - LOW ローコードへの落とし込み 10
  - UML UMLの使いどころ 8

### 2. SQL
- productId: `sql`、prefix: `SQL`、displayName: `SQL`、テーマ色: `#A67C00`
- domains:
  - BAS 基礎とSELECT 14
  - WHR 絞り込みと並び替え 16
  - AGG 集計とグループ化 14
  - JOIN 結合 16
  - SUB サブクエリと集合演算 10
  - UPD 更新とトランザクション 10
  - DDL テーブル設計とDDL 8
  - PRC 実務クエリ 12

### 3. SQL Server Management Studio
- productId: `ssms`、prefix: `SS`、displayName: `SQL Server Management Studio`、テーマ色: `#C4262E`
- domains:
  - BAS 接続と画面構成 10
  - OE オブジェクトエクスプローラー操作 12
  - QRY クエリ実行と結果の扱い 16
  - TBL テーブル・ビューの操作 12
  - IO インポート・エクスポート 12
  - BKP バックアップと復元 14
  - SEC ログインと権限 12
  - JOB SQL Serverエージェントとジョブ 12

### 4. HTML & CSS
- productId: `htmlcss`、prefix: `HC`、displayName: `HTML & CSS`、テーマ色: `#D6336C`
- domains:
  - BAS HTMLの構造と基本要素 16
  - SEM セマンティクスと文書構造 12
  - FRM フォームと入力部品 12
  - SEL CSSセレクタと優先順位 14
  - LAY レイアウト 18
  - RSP レスポンシブとメディアクエリ 12
  - STY 見た目の指定 16

各 domain には objectives を最低1件ずつ用意すること（text は分野名に沿った一文でよい。問題投入時に精緻化する）。

## リリース情報
data.js の `window.releaseNotes` の先頭に1件追加する:
- date: `2026-11-14`、text: `DX実務スキル、SQL、SQL Server Management Studio、HTML & CSS のタブを追加しました（問題追加中）`

## 守ること（受け入れ条件）
- 既存6ツール（blueprism／asteria／smartdb／poweregg／copilot／powerautomate）の config と問題データは一切変更しない。マージ前に既存ツールの問題数が従来どおり（43／46／35／38／34／0）であることを確認する。
- 新タブは問題0問の状態で開け、「問題は順次追加中」の表示になり、練習開始ボタンが押せないこと（Power Automate 追加時と同じ挙動）。
- トップ画面のツールタブに4件が追加され、既存タブの表示・動作（達成度バー、分野マップ、レーダーチャート）が壊れないこと。
- 変更はこの器追加の範囲だけに留める。エンジン（engine.js／index.html）の変更が必要になった場合は、理由を PR 説明に明記すること。
