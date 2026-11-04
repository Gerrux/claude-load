<div align="center">

[English](README.md) · [Русский](README.ru.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · [Português](README.pt.md) · **中文** · [日本語](README.ja.md)

# claude-load

**看清是哪个 Claude Code 会话在占用你的 CPU 和内存，并一键清理。**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-informational)
![Languages](https://img.shields.io/badge/languages-8-success)
![Claude Code mod](https://img.shields.io/badge/Claude%20Code-mod-d97757)

<img src="docs/screenshots/pane.png" alt="Claude 桌面应用中的 claude-load 面板：带图表的 CPU 和内存仪表、各会话的负载、一个孤儿开发服务器及其他进程" width="560">

<img src="docs/screenshots/band.png" alt="Claude 桌面应用中输入框上方的负载行：CPU 图表、CPU 和内存、占用最高的进程以及 /load 按钮" width="760">

<img src="docs/screenshots/terminal.png" alt="终端中的 /load 报告和输入框上方的负载行" width="860">

<sub>使用演示数据，以 mod 自身的设计渲染。</sub>

</div>

## 安装

一条命令，选择你的 shell。它会把本仓库添加为插件市场，并为当前用户安装该 mod，
因此在终端和 Claude 桌面应用中，每个新会话都会加载它。

**macOS · Linux · Windows 上的 Git Bash**

```bash
claude plugin marketplace add Gerrux/claude-load && claude plugin install claude-load@claude-load --config language=auto
```

**Windows — PowerShell**（5.1 和 7）

```powershell
claude plugin marketplace add Gerrux/claude-load; if ($?) { claude plugin install claude-load@claude-load --config language=auto }
```

**Windows — 命令提示符**（`cmd`）

```bat
claude plugin marketplace add Gerrux/claude-load && claude plugin install claude-load@claude-load --config language=auto
```

**仅使用 Claude 桌面应用**（终端里没有 `claude` 命令）：点击输入框旁的 **+** →
**Plugins** → **Add marketplace** → `Gerrux/claude-load` → **Add plugin** →
**claude-load**。

**在 Claude Code 终端会话中：**

```text
/plugin marketplace add Gerrux/claude-load
/plugin install claude-load@claude-load
```

然后，在已经打开的会话中运行 `/reload-plugins` 和 `/load`。

| | |
| --- | --- |
| **要求** | 支持 mod 的 Claude Code，2.1.287 或更高版本（`claude --version`）；Windows 10/11、macOS 或 Linux |
| **语言** | `--config language=auto` 先跟随 Claude Code 的语言，再跟随系统区域设置。可固定为 `en`、`ru`、`de`、`es`、`fr`、`pt`、`zh` 或 `ja`，也可稍后在 `/config` 中修改 |
| **更新** | `claude plugin marketplace update claude-load`，然后 `claude plugin update claude-load@claude-load`，再执行 `/reload-plugins` |
| **卸载** | `claude plugin uninstall claude-load@claude-load`（以及 `claude plugin marketplace remove claude-load`） |

## 为什么需要它

并行运行几个 Claude Code 会话，每个再带上子代理、MCP 服务器、开发服务器和测试运行器，
机器就会变得卡顿，而任务管理器里只有一大片 `node` 和 `claude`。claude-load 把负载**按会话**拆开：

| | |
| --- | --- |
| 📊 **每个会话** | CPU、内存、进程数、其中最重的进程，以及 6 分钟的 CPU 图表 |
| ⚠️ **孤儿进程** | 父进程已退出的开发进程（遗留的 vite 服务器、语言服务器、Python 运行），按工作目录归入所属的仓库或 worktree，确认后一键结束 |
| 🧩 **其他一切** | 其他进程按名称折叠（`chrome ×31`），让你看清问题究竟是不是出在 Claude 上 |
| 🔎 **筛选与分组** | 全部 · 活跃 · 高负载 · 孤儿进程 · 当前窗口；按会话、按仓库（worktree 折叠在内）、按进程；按 CPU 或内存排序 |
| ✻ **让 Claude 来整理** | 一个按钮：内置的 `sessions-triage` skill 会对空闲会话和孤儿进程分类，只问一次，仅归档或结束你批准的项目 |
| ⏳ **运行队列** | `runq` 让所有会话的重型运行按内存、独占标签和磁盘在机器上轮流执行；可选启用的守卫会把它们引到这里 |
| 🚦 **负载行** | 高负载时（CPU ≥ 50% 或内存 ≥ 85%）显示在输入框上方，并列出占用最高的进程 |
| 🌍 **8 种语言** | English, Русский, Deutsch, Español, Français, Português, 中文, 日本語 |

## 使用

| 命令 | 作用 |
| --- | --- |
| `/load` | 打开面板，并在对话记录中输出一份简明报告 |
| `/load all` | 同上，并列出所有空闲会话 |
| `/load band on` · `off` · `auto` | 输入框上方的负载行：始终显示、从不显示，或仅在高负载时显示（默认） |

在面板中：

- **进程** 将一个会话展开为按名称归类的进程及其高负载 PID。
- 对某个进程或孤儿进程点击 **结束**，确认 **是，结束** 后，会连同其子进程一起结束。
  结束前会先对照同名进程的最新采样再次校验该 PID。会话自身的 `claude` 进程以及不在当前采样中的 PID
  无法在此结束。
- **打开 ↗** 在 Claude 桌面应用中切换到该会话。
- **✻ 让 Claude 来整理** 请当前会话中的 Claude 整理负载。
  归档会话需要桌面应用的会话工具；在终端中，Claude 会告诉你应该关闭哪些会话。

筛选、分组和排序方式会在会话之间保留。

**语言：** 插件的 `language` 选项（`/config`）可取 `auto`、`en`、`ru`、`de`、
`es`、`fr`、`pt`、`zh` 或 `ja`。`auto` 先跟随 Claude Code 的 `language` 设置，再跟随
系统区域设置，最后回退到英语。

## 运行队列（runq）

同一台机器上的多个会话各自启动一个吃内存的运行（测试套件、模拟、大型构建），机器就会耗尽内存，
或者两个共用临时路径的运行互相破坏。`runq` 让它们自行轮流执行：每条重型命令在整台机器共用的
一个队列里等待，直到有足够的空间，然后照常运行。

```bash
python "$HOME/.claude/state/queue/runq.py" --mem 20 --tag helios --label "scan 1 ha" -- ./target/release/treegrow-cli scan --plot 1ha
```

同一行命令在 Git Bash 和 PowerShell 中都能用（`$HOME` 在两者中都会展开；其他环境请用
`python3`）。需要 Python 3.8 或更高版本。mod 在每次会话启动时把 `runq.py` 复制到
`~/.claude/state/queue/`，因此路径在插件更新后保持不变。

一个任务按先到先得的顺序等待，直到以下条件全部满足：

- **内存：** 可用 commit（Windows 还能承诺的量：内存加页面文件）能覆盖该任务的 `--mem` 再加上
  一份余量，默认 12 GB。运行中的任务按其已声明但尚未占用的量计入，因此相隔一秒被放行的两个任务
  不会都看到同一份空闲内存。较小的任务可以越过正在等内存的较大任务；一旦较大的任务已等待
  5 分钟，任何需要内存的任务都不能再越过它。
- **独占标签：** 没有运行中的任务、也没有更早排队的任务持有同一个独占标签。`cargo-test`
  默认独占：每台机器同时只跑一个 `cargo test`。
- **磁盘：** 每个 `--disk D:=<GB>` 指定的驱动器都有这么多空闲空间，再减去运行中的任务为它声明
  但尚未写入的量。

然后 runq 以自己的子进程运行该命令，沿用终端的 stdin、stdout 和 stderr，并以该命令的退出码退出。
runq 自己的输出走 stderr，并以 `runq:` 开头：等待期间每 30 秒一行进度（说明为何在等），结束时
给出退出情况、运行时间和内存峰值。

| 选项 | |
| --- | --- |
| `--mem <GB>` | 该运行预期的内存峰值（必填；只需要标签的运行填 `0`） |
| `--tag <name>` | 可重复；若列在 `exclusiveTags` 中则为独占 |
| `--disk D:=<GB>` | 可重复；驱动器必须具有的空闲空间（macOS/Linux 上为路径） |
| `--label <text>` | 面板和日志对该任务的称呼（默认：命令本身） |
| `--max-mem <GB>` | 命令自身的进程树超过该值时将其结束 |
| `--max-wait <min>` | 等待这么久后放弃（退出码 75） |

| 退出码 | |
| --- | --- |
| 命令自身的 | 它已运行 |
| 2 | 用法错误 |
| 3 | `--mem` 加余量超过机器的 commit 上限：永远无法启动 |
| 75 | `--max-wait` 已用完 |
| 126 | 命令无法启动（例如刚构建的 `.exe` 被 Microsoft Defender 拦截：`Permission denied`）；只报告一次，不会重试 |
| 127 | 找不到命令 |
| 130 | 等待期间被取消（Ctrl+C） |
| 137 | 被自身的 `--max-mem` 结束 |

`runq.py status` 显示正在运行和正在等待的任务（及原因）、可用 commit、内存和磁盘；
`runq.py log --since 30m`（或 `-n 50`、ISO 时间、`--json`）显示事件：queued、started、finished、
killed、failed、stale、cancelled、gave-up。只要有任务在运行或等待，面板就会在 **运行队列**
部分显示同样的内容，此后还会保留两小时。

**runq 会动什么。** 它只通过机器的总量来读取其他进程的内存。它结束的唯一进程是自己命令的进程树，
并且只在使用 `--max-mem` 时。在 Windows 上，命令运行在 Job Object 中：其进程树恰好就是该作业的
成员，结束每个成员之前都会先确认它确实在作业中；而 runq 自己被杀时会带走它的命令，而不是让命令
脱离统计继续运行。无法创建作业的地方（以及 macOS/Linux 上），则按父 PID 遍历进程树，并在结束每个
进程之前核对其启动时间。runq 和命令都已消失的任务（崩溃、重启）会按 PID 和启动时间被丢弃；
runq 死后仍在运行的命令保留其名额和标签。决策在操作系统的文件锁下做出，持有者死亡时系统会释放该锁。

**设置：** `~/.claude/state/queue/config.json`，全部可选：

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

### 守卫：重型命令只能经由 runq

在选择启用的项目中，绕过 runq 启动重型运行的 Bash 或 PowerShell 命令会被拒绝，并且代理会拿到
应当改为执行的确切 runq 命令行（保留其 `cd …&&` 和 `| tail`）。mod 自己从不改写或执行命令。
在项目的 `.claude/settings.json`（共享，因此它的每个 worktree 都生效）或
`.claude/settings.local.json` 中为该项目开启：

```json
{ "env": { "CLAUDE_LOAD_RUNQ_GUARD": "1" } }
```

或者通过 `config.json` 中的 `guard.roots` 为文件夹（包括其中的 worktree）开启（`*` 代表一段路径）；
项目设置中的 `"0"` 会在该项目里将其关闭。默认视为重型的有：`cargo test` / `cargo nextest`、
`treegrow*` 的 `grow|scan|stand|forest`（可执行文件或 `cargo run … -- <verb>`）以及 `helios*`；
`guard.rules` 会替换这份列表。

## 工作原理

每台机器只有一个采样器，它把数据写入 `~/.claude/state/load/snapshot.json`；各会话的 mod
每 5 秒只读取一次，因此开销不会随会话数量增长。

- **Windows：** 由 mod 启动的隐藏 PowerShell 进程（`sampler/load-sampler.ps1`）。
  它每 4 秒读取一次 `Get-Process`，仅在出现新进程时才从 CIM 读取父进程树，并在最后一个会话关闭 3 分钟后退出。
  在一台 12 线程、运行 15 个会话的机器上实测：约 0.35% CPU 和 130 MB 内存。
- **macOS 和 Linux：** 由某一个会话的 mod 持有租约并用 `ps` 采样；如果它消失，
  另一个会话会在 15 秒内接管。

会话即 `~/.claude/sessions/<pid>.json` 中的一个 PID，其负载是它整个进程树的负载。孤儿进程是指父进程已退出
（在 macOS 和 Linux 上：被 `init`、`systemd` 或 `launchd` 收养）且包含开发工具的进程树。
其工作目录取自进程本身（Windows 从进程内存中读取，Linux 从 `/proc/<pid>/cwd` 读取，macOS 通过 `lsof` 获取）。

**隐私：** 一切都留在你的机器上。无网络请求，无遥测。

## 故障排查

- **“采样器无法启动”**（Windows）：PowerShell 脚本被策略阻止
  （`AllSigned` 或 Constrained Language Mode）。采样器需要运行插件文件夹中的
  `sampler/load-sampler.ps1`。
- **在 macOS/Linux 上什么都不显示：** 检查 `ps` 是否在 `PATH` 中；`lsof`（macOS）
  仅在检测孤儿进程时才需要。

## 状态

在 Windows 11 上配合 Claude 桌面应用开发并每天使用。macOS 和 Linux 的
采样器由针对已录制的 `ps`、`vm_stat`、`/proc/meminfo` 和 `lsof`
输出的单元测试覆盖，但尚未在真实的 Mac 或 Linux 机器上运行过。欢迎反馈问题和提交修复。

## 开发

```bash
claude plugin validate .
claude plugin test .
python -m unittest discover -s runq -v
claude --plugin-dir .
```

截图由 `docs/mock/index.html` 渲染；参见 [docs/mock/README.md](docs/mock/README.md)。

## 许可证

[MIT](LICENSE)
