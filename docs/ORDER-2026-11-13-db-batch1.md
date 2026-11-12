# 発注書：DB移行 第1弾（Copilot Studio と PowerEgg の DB 配信化）

発行：2026-11-13（クロ）
対象リポジトリ：netamade/skill-quest
担当：Codex（作業ごとに新規タスクで実施すること）
前提：docs/ORDER-2026-11-13-pa-db-fetch.md（PR #5）で Power Automate の API 取得が実装済み。本発注はその仕組みの一般化。

## 変更内容

### 1. 取得対象の一般化（engine.js）
- 現在 Power Automate 専用になっている API 取得を、移行済みツールの共通処理にする。
- 移行済みツールは engine.js 内の定数リストで定義し、今回は次の3ツールとする：
  `powerautomate`、`copilot`、`poweregg`
- 各ツールの取得先は `GET https://sq-questions-api.sola-labo.workers.dev/v1/tools/{tool}/questions`（tool はツールID）。
- 取得のタイミング・回数は従来どおり：そのツールのタブを開いたとき、ページ読み込みごとに各ツール最大1回。

### 2. 差し替えの規則（重要）
- API が **1問以上** 返したときだけ、そのツールの bank を差し替える。
- 0件が返った場合・取得失敗時（通信エラー、200以外、不正JSON、questions が配列でない）は、data.js の静的 bank をそのまま使う。
  - Power Automate は静的 bank が空なので従来と同じ挙動になる。
  - Copilot Studio（34問）と PowerEgg（38問）は、DB 側に既存問題と同内容が投入済み（投入と照合はクロ側で実施）。通常時は DB の内容で差し替わり、障害時は静的データでそのまま遊べるのが正しい状態。

### 3. リリース情報の追記（data.js）
- `releaseNotes` に次の1件を新しい順になるよう追加する：
  - `{ "date": "2026-11-13", "text": "Copilot Studio と PowerEgg の問題配信をデータベース方式に切り替えました" }`

## 禁止事項
- data.js の各ツールの config・bank の変更（releaseNotes への追記のみ可）。
- localStorage のキー・保存形式・記録処理の変更。
- 上記3ツール以外への取得処理の適用、デザイン変更、その他のリファクタリング。

## 完了条件
- PR を作成し、変更点と自己検証の結果を PR 本文に書くこと。
- 自己検証で最低限確認すること：
  - Copilot Studio と PowerEgg を開くと API から問題が取得され、問数が静的データと一致する（34問・38問）。両ツールで出題・採点ができる。特に PowerEgg と Copilot Studio の画面再現（screen_spot）形式の問題が DB 経由でも正しく表示・採点できること。
  - API を止めた想定では、両ツールとも静的データで従来どおり遊べる。
  - Power Automate の従来動作（取得・フォールバック）が変わらない。
  - 未移行の3ツール（Blue Prism、ASTERIA Warp、SmartDB）では API リクエストが発生せず、表示・動作が従来どおり。
  - トップ画面のリリース情報が2件表示される。
