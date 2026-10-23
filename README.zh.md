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
| ✨ **让 Claude 来整理** | 一个按钮：内置的 `sessions-triage` skill 会对空闲会话和孤儿进程分类，只问一次，仅归档或结束你批准的项目 |
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
- **✨ 让 Claude 来整理** 请当前会话中的 Claude 整理负载。
  归档会话需要桌面应用的会话工具；在终端中，Claude 会告诉你应该关闭哪些会话。

筛选、分组和排序方式会在会话之间保留。

**语言：** 插件的 `language` 选项（`/config`）可取 `auto`、`en`、`ru`、`de`、
`es`、`fr`、`pt`、`zh` 或 `ja`。`auto` 先跟随 Claude Code 的 `language` 设置，再跟随
系统区域设置，最后回退到英语。

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
claude --plugin-dir .
```

截图由 `docs/mock/index.html` 渲染；参见 [docs/mock/README.md](docs/mock/README.md)。

## 许可证

[MIT](LICENSE)
