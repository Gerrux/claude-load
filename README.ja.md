<div align="center">

[English](README.md) · [Русский](README.ru.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · [Português](README.pt.md) · [中文](README.zh.md) · **日本語**

# claude-load

**どの Claude Code セッションが CPU とメモリを消費しているかを可視化し、ワンクリックで片付けます。**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-informational)
![Languages](https://img.shields.io/badge/languages-8-success)
![Claude Code mod](https://img.shields.io/badge/Claude%20Code-mod-d97757)

<img src="docs/screenshots/pane.png" alt="Claude デスクトップアプリ内の claude-load ペイン：グラフ付きの CPU とメモリのメーター、セッションごとの負荷、孤立した開発サーバーとその他のプロセス" width="560">

<img src="docs/screenshots/band.png" alt="Claude デスクトップアプリの入力欄の上にある負荷行：CPU グラフ、CPU とメモリ、上位の消費プロセス、/load ボタン" width="760">

<img src="docs/screenshots/terminal.png" alt="ターミナルでの /load レポートと入力欄の上の負荷行" width="860">

<sub>デモデータを使い、mod 自身のデザインで描画したものです。</sub>

</div>

## インストール

コマンドは 1 つです。お使いのシェルを選んでください。このリポジトリをプラグインマーケットプレイスとして追加し、
ユーザー単位で mod をインストールします。ターミナルでも Claude デスクトップアプリでも、
新しいセッションごとに読み込まれます。

**macOS · Linux · Windows の Git Bash**

```bash
claude plugin marketplace add Gerrux/claude-load && claude plugin install claude-load@claude-load --config language=auto
```

**Windows — PowerShell**（5.1 と 7）

```powershell
claude plugin marketplace add Gerrux/claude-load; if ($?) { claude plugin install claude-load@claude-load --config language=auto }
```

**Windows — コマンドプロンプト**（`cmd`）

```bat
claude plugin marketplace add Gerrux/claude-load && claude plugin install claude-load@claude-load --config language=auto
```

**Claude デスクトップアプリのみ**（ターミナルに `claude` コマンドがない場合）：入力欄の横の **+** をクリックし、
**Plugins** → **Add marketplace** → `Gerrux/claude-load` → **Add plugin** →
**claude-load** の順に選びます。

**Claude Code のターミナルセッション内：**

```text
/plugin marketplace add Gerrux/claude-load
/plugin install claude-load@claude-load
```

すでに開いているセッションでは、続けて `/reload-plugins` と `/load` を実行してください。

| | |
| --- | --- |
| **要件** | mod に対応した Claude Code 2.1.287 以降（`claude --version`）、Windows 10/11、macOS、または Linux |
| **言語** | `--config language=auto` は Claude Code の言語、次にシステムのロケールに従います。`en`、`ru`、`de`、`es`、`fr`、`pt`、`zh`、`ja` のいずれかで固定でき、後から `/config` で変更することもできます |
| **更新** | `claude plugin marketplace update claude-load`、続けて `claude plugin update claude-load@claude-load`、そして `/reload-plugins` |
| **削除** | `claude plugin uninstall claude-load@claude-load`（および `claude plugin marketplace remove claude-load`） |

## 背景

Claude Code のセッションをいくつも並行して動かし、それぞれにサブエージェント、MCP サーバー、開発サーバー、
テストランナーが付くと、マシンは重くなり、タスクマネージャーには `node` と `claude` がずらりと並びます。
claude-load は負荷を**セッション単位**に分けて表示します。

| | |
| --- | --- |
| 📊 **セッションごと** | CPU、メモリ、プロセス数、内部で最も重いプロセス、6 分間の CPU グラフ |
| ⚠️ **孤立プロセス** | 親プロセスが終了した開発プロセス（置き去りにされた vite サーバー、言語サーバー、Python の実行など）。作業ディレクトリをもとに所属するリポジトリや worktree に振り分け、確認のうえワンクリックで終了できます |
| 🧩 **その他すべて** | 他のプロセスは名前ごとにまとめて表示（`chrome ×31`）。問題がそもそも Claude にあるのかどうかが分かります |
| 🔎 **フィルターとグループ化** | すべて · アクティブ · 高負荷 · 孤立 · このウィンドウ。セッション別、リポジトリ別（worktree を集約）、プロセス別。CPU 順またはメモリ順に並べ替え |
| ✻ **Claude に整理してもらう** | ボタン 1 つで、同梱の `sessions-triage` skill がアイドルのセッションと孤立プロセスを分類し、1 回だけ確認したうえで、承認したものだけをアーカイブまたは終了します |
| ⏳ **実行キュー** | `runq` は全セッションの重い実行を、メモリ・排他タグ・ディスクに応じてマシン上で順番待ちさせます。任意で有効にできるガードがそこへ誘導します |
| 🚦 **負荷行** | 高負荷時（CPU 50% 以上、またはメモリ 85% 以上）に入力欄の上へ表示され、上位の消費プロセスも示します |
| 🌍 **8 言語** | English, Русский, Deutsch, Español, Français, Português, 中文, 日本語 |

## 使い方

| コマンド | 動作 |
| --- | --- |
| `/load` | ペインを開き、トランスクリプトに簡潔なレポートを出力します |
| `/load all` | 同じ内容に加え、アイドルのセッションもすべて一覧表示します |
| `/load band on` · `off` · `auto` | 入力欄の上の負荷行：常に表示、非表示、または高負荷時のみ表示（デフォルト） |

ペイン内の操作：

- **プロセス** はセッションを名前別のプロセスと高負荷な PID に展開します。
- プロセスや孤立プロセスの **終了** を押し、**はい、終了** で確定すると、子プロセスも含めて終了します。
  終了前に、同じ名前の最新サンプルと照合して PID を再確認します。セッション自身の `claude` プロセスや、
  現在のサンプルにない PID は、ここからは終了できません。
- **開く ↗** は Claude デスクトップアプリでそのセッションに切り替えます。
- **✻ Claude に整理してもらう** は、現在のセッションの Claude に負荷の整理を依頼します。
  セッションのアーカイブにはデスクトップアプリのセッションツールが必要です。ターミナルでは、
  代わりに閉じるべきセッションを Claude が案内します。

フィルター、グループ化、並べ替えの設定はセッションをまたいで保持されます。

**言語：** プラグインの `language` オプション（`/config`）には `auto`、`en`、`ru`、`de`、
`es`、`fr`、`pt`、`zh`、`ja` を指定できます。`auto` は Claude Code の `language` 設定、
次にシステムのロケール、最後に英語の順で決まります。

## 実行キュー（runq）

1 台のマシン上の複数のセッションがそれぞれメモリを大量に使う実行（テストスイート、シミュレーション、
大きなビルド）を始めると、マシンのメモリが足りなくなったり、一時パスを共有する 2 つの実行が互いを
壊したりします。`runq` はそれらを自動で順番待ちさせます。重いコマンドはそれぞれマシン全体で 1 つの
キューに並び、空きができるまで待ってから、通常どおり実行されます。

```bash
python "$HOME/.claude/state/queue/runq.py" --mem 20 --tag helios --label "scan 1 ha" -- ./target/release/treegrow-cli scan --plot 1ha
```

同じ行が Git Bash でも PowerShell でも動きます（`$HOME` は両方で展開されます。それ以外の環境では
`python3` を使ってください）。Python 3.8 以降が必要です。mod はセッション開始のたびに `runq.py` を
`~/.claude/state/queue/` にコピーするので、プラグインを更新してもパスは変わりません。

ジョブは先着順で、次のすべてが満たされるまで待ちます。

- **メモリ：** 空き commit（Windows がまだ約束できる量。RAM とページファイルの合計）が、ジョブの
  `--mem` に余裕分（デフォルトは 12 GB）を加えた量を満たしていること。実行中のジョブは、申告したが
  まだ確保していない分も含めて数えられるため、1 秒違いで許可された 2 つのジョブが同じ空きメモリを
  見てしまうことはありません。小さいジョブは、メモリを待っている大きいジョブを追い越せます。ただし
  大きいジョブが 5 分待ったあとは、メモリを必要とするものはもう追い越せません。
- **排他タグ：** 実行中のジョブにも、先にキューに入ったジョブにも、同じ排他タグを持つものがないこと。
  `cargo-test` はデフォルトで排他です。マシンごとに `cargo test` は 1 つだけです。
- **ディスク：** `--disk D:=<GB>` の各ドライブに、その分の空き容量があること。ただし、実行中のジョブが
  そのドライブ用に申告してまだ書き込んでいない分は差し引きます。

その後、runq はコマンドを自身の子プロセスとして、ターミナルの stdin、stdout、stderr で実行し、
コマンドの終了コードで終了します。runq 自身の出力は stderr に出て、`runq:` で始まります。待機中は
30 秒ごとに進捗行（待っている理由）、最後に終了、実行時間、ピークメモリが出ます。

| オプション | |
| --- | --- |
| `--mem <GB>` | その実行で想定されるピークメモリ（必須。タグだけが必要な実行は `0`） |
| `--tag <name>` | 繰り返し指定可。`exclusiveTags` に載っていれば排他 |
| `--disk D:=<GB>` | 繰り返し指定可。ドライブに必要な空き容量（macOS/Linux ではパス） |
| `--label <text>` | ペインとログがジョブを呼ぶ名前（デフォルト：コマンド） |
| `--max-mem <GB>` | コマンド自身のプロセスツリーがこの値を超えたら終了させる |
| `--max-wait <min>` | これだけ待ったらあきらめる（終了コード 75） |

| 終了コード | |
| --- | --- |
| コマンドのもの | 実行された |
| 2 | 使い方のエラー |
| 3 | `--mem` に余裕分を加えるとマシンの commit 上限を超える：決して開始できない |
| 75 | `--max-wait` が尽きた |
| 126 | コマンドを起動できなかった（たとえば Microsoft Defender がブロックする、ビルドしたての `.exe`：`Permission denied`）。1 回だけ報告され、再試行はされない |
| 127 | コマンドが見つからない |
| 130 | 待機中にキャンセルされた（Ctrl+C） |
| 137 | 自身の `--max-mem` で終了させられた |

`runq.py status` は、実行中のものと待機中のもの（とその理由）、空き commit、RAM、ディスクを表示します。
`runq.py log --since 30m`（または `-n 50`、ISO 時刻、`--json`）はイベントを表示します：queued、
started、finished、killed、failed、stale、cancelled、gave-up。ペインは、何かが実行中または待機中の間、
そしてその後 2 時間、同じ内容を **実行キュー** セクションに表示します。

**runq が触れるもの。** 他のプロセスのメモリは、マシン全体の合計値を通してしか読みません。終了させる
のは自分のコマンドのプロセスツリーだけで、それも `--max-mem` を使ったときに限ります。Windows では
コマンドは Job Object の中で実行されます。そのツリーはジョブのメンバーそのもので、終了させる前に
それぞれがジョブに属しているか確認されます。また、runq 自身が強制終了された場合は、コマンドを管理外で
動かし続けるのではなく、コマンドも道連れにします。ジョブを作れない環境（および macOS/Linux）では、
親 PID でツリーをたどり、終了させる前に各プロセスの開始時刻を確認します。runq もコマンドも消えた
ジョブ（クラッシュや再起動）は、PID と開始時刻で破棄されます。runq が死んだあともコマンドが動き続けて
いる場合は、枠とタグが保たれます。判断は OS のファイルロックのもとで行われ、保持者が死ぬと OS が
そのロックを解放します。

**設定：** `~/.claude/state/queue/config.json`。すべて任意です。

```json
{
  "guardGB": 12,
  "exclusiveTags": ["cargo-test"],
  "fairAfterMin": 5,
  "guard": {
    "roots": ["C:/Users/me/garage/treegrow", "D:/work/treegrow-*"],
    "rules": [{ "name": "cargo test", "pattern": "^cargo(\\s+\\+\\S+)?\\s+(test|nextest)\\b", "tag": "cargo-test", "memGB": 8 }]
  }
}
```

### ガード：重いコマンドは runq 経由のみ

オプトインしたプロジェクトでは、runq を通さずに重い実行を始める Bash または PowerShell のコマンドは
拒否され、エージェントには代わりに実行すべき正確な runq の行が渡されます（`cd …&&` と `| tail` は
そのまま保たれます）。mod 自身がコマンドを書き換えたり実行したりすることはありません。プロジェクトの
`.claude/settings.json`（共有されるので、そのすべての worktree で有効）または
`.claude/settings.local.json` で有効にします。

```json
{ "env": { "CLAUDE_LOAD_RUNQ_GUARD": "1" } }
```

フォルダー（worktree を含む）に対しては、`config.json` の `guard.roots` で有効にできます（`*` はパスの
1 区間を表します）。プロジェクトの設定の `"0"` は、そこでガードをオフにします。デフォルトで重いもの：
`cargo test` / `cargo nextest`、`treegrow*` の `grow|scan|stand|forest`（実行ファイル、または
`cargo run … -- <verb>`）、`helios*`。`guard.rules` はこのリストを置き換えます。

## 仕組み

サンプラーはマシンごとに 1 つで、`~/.claude/state/load/snapshot.json` に書き込みます。各セッションの mod は
5 秒ごとにそれを読むだけなので、セッション数が増えてもコストは増えません。

- **Windows：** mod が起動する非表示の PowerShell プロセス（`sampler/load-sampler.ps1`）。
  4 秒ごとに `Get-Process` を読み、親子ツリーは新しいプロセスが現れたときだけ CIM から取得し、最後のセッションが閉じて 3 分後に終了します。
  12 スレッドのマシンで 15 セッションを動かして計測したところ、CPU は約 0.35%、メモリは 130 MB でした。
- **macOS と Linux：** いずれか 1 つのセッションの mod がリースを保持し、`ps` でサンプリングします。
  そのセッションが終了した場合は、別のセッションが 15 秒以内に引き継ぎます。

セッションとは `~/.claude/sessions/<pid>.json` にある PID のことで、その負荷はプロセスツリー全体の負荷です。
孤立プロセスとは、親プロセスが終了し（macOS と Linux では `init`、`systemd`、`launchd` に付け替えられ）、
開発ツールを含むプロセスツリーのことです。作業ディレクトリはプロセス自身から取得します
（Windows ではプロセスのメモリから、Linux では `/proc/<pid>/cwd` から、macOS では `lsof` から読み取ります）。

**プライバシー：** すべてお使いのマシン内で完結します。ネットワーク通信もテレメトリもありません。

## トラブルシューティング

- **「サンプラーが起動しない」**（Windows）：ポリシー（`AllSigned` や Constrained Language Mode）で
  PowerShell スクリプトがブロックされています。サンプラーはプラグインフォルダー内の
  `sampler/load-sampler.ps1` を実行できる必要があります。
- **macOS/Linux で何も表示されない：** `ps` が `PATH` にあるか確認してください。`lsof`（macOS）は
  孤立プロセスの検出にのみ必要です。

## ステータス

Windows 11 と Claude デスクトップアプリで開発し、毎日使っています。macOS と Linux のサンプラーは、
記録した `ps`、`vm_stat`、`/proc/meminfo`、`lsof` の出力に対する単体テストでカバーしていますが、
実際の Mac や Linux 環境ではまだ動作確認していません。報告や修正を歓迎します。

## 開発

```bash
claude plugin validate .
claude plugin test .
python -m unittest discover -s runq -v
claude --plugin-dir .
```

スクリーンショットは `docs/mock/index.html` から生成しています。[docs/mock/README.md](docs/mock/README.md) を参照してください。

## ライセンス

[MIT](LICENSE)
