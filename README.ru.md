<div align="center">

[English](README.md) · **Русский** · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · [Português](README.pt.md) · [中文](README.zh.md) · [日本語](README.ja.md)

# claude-load

**Какая сессия Claude Code съедает CPU и память — и как убрать лишнее в один клик.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-informational)
![Languages](https://img.shields.io/badge/languages-8-success)
![Claude Code mod](https://img.shields.io/badge/Claude%20Code-mod-d97757)

<img src="docs/screenshots/pane.png" alt="Пейн claude-load в десктопном приложении Claude: CPU и RAM с графиками, сессии с их нагрузкой, осиротевший dev-сервер и прочие процессы" width="560">

<img src="docs/screenshots/band.png" alt="Строка нагрузки над полем ввода в десктопном приложении Claude: график CPU, CPU и RAM, главные потребители и кнопка /load" width="760">

<img src="docs/screenshots/terminal.png" alt="Отчёт /load и строка нагрузки над полем ввода в терминале" width="860">

<sub>Отрисовано на демо-данных в дизайне самого мода. Интерфейс на скриншотах английский; мод говорит на языке вашего Claude Code.</sub>

</div>

## Установка

Одна команда — выберите свою оболочку. Она добавляет этот репозиторий как маркетплейс
плагинов и ставит мод для вашего пользователя: он загружается в каждой новой сессии, и в
терминале, и в десктопном приложении Claude.

**macOS · Linux · Git Bash на Windows**

```bash
claude plugin marketplace add Gerrux/claude-load && claude plugin install claude-load@claude-load --config language=auto
```

**Windows — PowerShell** (5.1 и 7)

```powershell
claude plugin marketplace add Gerrux/claude-load; if ($?) { claude plugin install claude-load@claude-load --config language=auto }
```

**Windows — командная строка** (`cmd`)

```bat
claude plugin marketplace add Gerrux/claude-load && claude plugin install claude-load@claude-load --config language=auto
```

**Только десктопное приложение Claude** (команды `claude` в терминале нет): нажмите **+**
рядом с полем ввода → **Plugins** → **Add marketplace** → `Gerrux/claude-load` → **Add plugin**
→ **claude-load**.

**Внутри терминальной сессии Claude Code:**

```text
/plugin marketplace add Gerrux/claude-load
/plugin install claude-load@claude-load
```

Затем в уже открытой сессии выполните `/reload-plugins` и `/load`.

| | |
| --- | --- |
| **Нужно** | Claude Code с поддержкой модов, 2.1.287 или новее (`claude --version`); Windows 10/11, macOS или Linux |
| **Язык** | `--config language=auto` следует языку Claude Code, затем локали системы. Закрепить язык: `en`, `ru`, `de`, `es`, `fr`, `pt`, `zh` или `ja`; поменять позже — в `/config` |
| **Обновить** | `claude plugin marketplace update claude-load`, затем `claude plugin update claude-load@claude-load`, затем `/reload-plugins` |
| **Удалить** | `claude plugin uninstall claude-load@claude-load` (и `claude plugin marketplace remove claude-load`) |

## Зачем

Запустите несколько сессий Claude Code параллельно — у каждой субагенты, MCP-серверы,
dev-серверы и тесты, — и машина ползёт, а диспетчер задач показывает стену `node` и
`claude`. claude-load раскладывает нагрузку **по сессиям**:

| | |
| --- | --- |
| 📊 **По сессиям** | CPU, память, число процессов, самые тяжёлые процессы внутри, график CPU за 6 минут |
| ⚠️ **Сироты** | dev-процессы, у которых умер родитель (vite-сервер, языковой сервер, забытый запуск Python), приписаны к своему репозиторию или worktree по рабочему каталогу; завершаются в один клик после подтверждения |
| 🧩 **Всё остальное** | прочие процессы, сложенные по имени (`chrome ×31`), — видно, Claude ли вообще виноват |
| 🔎 **Фильтры и группировки** | все · активные · тяжёлые · сироты · это окно; по сессиям, по репозиториям (worktree сворачиваются в основной), по процессам; сортировка по CPU или памяти |
| ✨ **Разобрать с Claude** | одна кнопка: встроенный скилл `sessions-triage` раскладывает простаивающие сессии и сирот, спрашивает один раз и архивирует или завершает только одобренное |
| 🚦 **Строка нагрузки** | над полем ввода при высокой нагрузке (CPU от 50% или память от 85%), с главными потребителями |
| 🌍 **8 языков** | English, Русский, Deutsch, Español, Français, Português, 中文, 日本語 |

## Использование

| Команда | Что делает |
| --- | --- |
| `/load` | Открывает пейн и печатает в чат краткий отчёт |
| `/load all` | То же, со всеми простаивающими сессиями |
| `/load band on` · `off` · `auto` | Строка нагрузки над полем ввода: всегда, никогда или только при высокой нагрузке (по умолчанию) |

В пейне:

- **процессы** раскрывает сессию: её процессы по именам и тяжёлые PID.
- **завершить** у процесса или сироты завершает его вместе с дочерними после
  **Да, завершить**. Перед этим PID ещё раз сверяется со свежим снимком и именем процесса.
  Собственные процессы сессий (`claude`) и PID, которых нет в текущем снимке, отсюда
  завершить нельзя.
- **открыть ↗** переключает на эту сессию в десктопном приложении Claude.
- **✨ Разобрать с Claude** просит Claude в текущей сессии разобрать нагрузку. Архивировать
  сессии можно только с инструментами десктопного приложения; в терминале Claude подскажет,
  что закрыть.

Фильтр, группировка и сортировка запоминаются между сессиями.

**Язык:** настройка плагина `language` (`/config`) принимает `auto`, `en`, `ru`, `de`, `es`,
`fr`, `pt`, `zh` или `ja`. `auto` берёт настройку `language` Claude Code, затем локаль
системы, затем английский.

## Как это работает

Один сэмплер на машину пишет `~/.claude/state/load/snapshot.json`; мод каждой сессии только
читает его раз в 5 секунд, поэтому стоимость не растёт с числом сессий.

- **Windows:** скрытый процесс PowerShell (`sampler/load-sampler.ps1`), его запускает мод.
  Каждые 4 секунды он читает `Get-Process`, а дерево родителей из CIM — только когда
  появились новые процессы, и выходит через 3 минуты после закрытия последней сессии.
  Замер на машине с 12 потоками и 15 сессиями: около 0,35% CPU и 130 МБ памяти.
- **macOS и Linux:** мод одной из сессий держит «аренду» и снимает нагрузку через `ps`; если
  эта сессия закрылась, другая подхватывает за 15 секунд.

Сессия — это PID из `~/.claude/sessions/<pid>.json`, её нагрузка — всё её дерево процессов.
Сирота — дерево процессов, у которого умер родитель (на macOS и Linux — переподчинённое
`init`, `systemd` или `launchd`) и внутри есть dev-инструмент. Его рабочий каталог берётся у
самого процесса (Windows читает его из памяти процесса, Linux — из `/proc/<pid>/cwd`,
macOS — через `lsof`).

**Приватность:** всё остаётся на вашей машине. Никаких сетевых запросов и телеметрии.

## Проблемы и решения

- **«Сэмплер не запускается»** (Windows): скрипты PowerShell запрещены политикой
  (`AllSigned` или Constrained Language Mode). Сэмплеру нужно запускать
  `sampler/load-sampler.ps1` из папки плагина.
- **На macOS/Linux ничего не видно:** проверьте, что `ps` есть в `PATH`; `lsof` (macOS)
  нужен только для сирот.

## Статус

Разрабатывается и каждый день используется на Windows 11 с десктопным приложением Claude.
Сэмплер для macOS и Linux покрыт юнит-тестами на записанном выводе `ps`, `vm_stat`,
`/proc/meminfo` и `lsof`, но на настоящем Mac или Linux ещё не запускался. Отчёты и
исправления приветствуются.

## Разработка

```bash
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

Скриншоты отрисованы из `docs/mock/index.html`; см. [docs/mock/README.md](docs/mock/README.md).

## Лицензия

[MIT](LICENSE)
