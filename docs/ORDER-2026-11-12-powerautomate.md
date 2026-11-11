# 発注書：SKILL QUEST に Power Automate を追加（メニュー先行）

2026-11-12、発注者：クロ。担当：Codex。
対象リポジトリ：netamade/skill-quest（現行5ツール・196問）。

## 目的
新ツール「Power Automate」を追加する。今回は**メニュー（ツールタブと器）を先行追加**し、問題は0問でよい。問題データは作問ストック（チェック済み分）から後日バッチ投入する。

## 作業内容

### 1. data.js への追加
`window.KT_DATA` の末尾にキー `powerautomate` を追加する。既存5ツール（blueprism／asteria／smartdb／poweregg／copilot）のデータは一切変更しない。

config（schemaVersion 1、copilot の config 骨格に合わせる）：
- productId: "powerautomate"、prefix: "PA"、displayName: "Power Automate"
- disclaimer: 他ツールと同じ定型文
- versions: { "list": [], "default": null }
- editions: [{id:"cloud", name:"クラウドフロー"}, {id:"desktop", name:"デスクトップフロー"}]
- tiers: [{id:"basic", name:"基礎", order:1}, {id:"advanced", name:"応用", order:2}]
- domains（code／name／weight、minObjectives は全て1、weight 合計100）：
  - BAS 基礎・フローの種類 10
  - CLD クラウドフローとトリガー 12
  - CON コネクタとアクション 12
  - EXP 式と関数 10
  - DAT 変数とデータ操作 10
  - CTL 条件・ループ・制御 10
  - DSK デスクトップフロー 12
  - ERR エラー処理と実行管理 8
  - APP 承認とプロセス自動化 8
  - ALM 共有・環境・ソリューション 8
- objectives（各 domain に1件、tier は "basic"、minQuestions は 4）：
  - BAS-01 クラウドフローとデスクトップフローの違いと使い分けを説明できる
  - CLD-01 トリガーの種類を選んでクラウドフローを開始できる
  - CON-01 主要コネクタのアクションとトリガーを使い分けられる
  - EXP-01 Power Fx の式と関数で値を加工できる
  - DAT-01 変数・作成・JSON解析・配列操作でデータを扱える
  - CTL-01 条件分岐・スイッチ・ループでフローを制御できる
  - DSK-01 デスクトップフローのアクションとUI自動化を使える
  - ERR-01 スコープ・再試行・実行後の構成でエラー処理を設計できる
  - APP-01 承認アクションと待機・応答の流れを設計できる
  - ALM-01 ソリューション・接続参照・環境でフローを共有・移行できる
- modes：practice は他ツールの標準形（label「分野別練習」、count [10,20,30]、即時フィードバック等）。もう1つは asteria 型の cross（label「横断テスト」、count [20,40]、feedback "end"、pass null）。mock（本番テスト）は作らない。
- judgement／revenge：copilot と同じ値。
- theme: { "primary": "#0067C0" }
- note: "試作v0。メニュー先行追加。問題は作問ストック（チェック済み）から順次投入する。"

bank：{ schemaVersion: 1, productId: "powerautomate", bankVersion: "prototype-v0", generatedAt: "2026-11-12", questions: [] }

### 2. 0問状態の表示
- ツールタブは engine.js が KT_DATA のキーから自動生成する想定なので、原則として engine.js／index.html／styles.css は変更しない。
- ただし Power Automate（0問）を開いたときにエラーや白画面になる場合は、最小限の手当てをする：問題が0問のときは「問題は順次追加中です」と表示して練習を開始できないようにする。その場合は変更内容と理由を PR 本文に明記する。

### 3. 検証（実施して PR 本文に結果を書く）
- data.js が JSON としてパースでき、既存5ツールの問題総数が従来どおり196問であること。
- ローカル表示で6ツールのタブが並び、Power Automate のトップ・分野マップ（10分野）がエラーなく表示されること。
- 既存ツールのうち1つ（例：copilot）を開き、従来どおり問題が解けること。

### 4. PR
- main 向けの PR を作成し、URL を報告する。**マージはしない**（検証とマージはクロが行う）。
