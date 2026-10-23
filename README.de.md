<div align="center">

[English](README.md) · [Русский](README.ru.md) · **Deutsch** · [Español](README.es.md) · [Français](README.fr.md) · [Português](README.pt.md) · [中文](README.zh.md) · [日本語](README.ja.md)

# claude-load

**Sieh, welche Claude Code-Sitzung deine CPU und deinen Speicher frisst — und räume mit einem Klick auf.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-informational)
![Languages](https://img.shields.io/badge/languages-8-success)
![Claude Code mod](https://img.shields.io/badge/Claude%20Code-mod-d97757)

<img src="docs/screenshots/pane.png" alt="Das claude-load-Panel in der Claude Desktop-App: CPU- und RAM-Anzeigen mit Graphen, Sitzungen mit ihrer Last, ein verwaister Dev-Server und weitere Prozesse" width="560">

<img src="docs/screenshots/band.png" alt="Die Lastzeile über der Eingabe in der Claude Desktop-App: ein CPU-Graph, CPU und RAM, die größten Verbraucher und eine /load-Schaltfläche" width="760">

<img src="docs/screenshots/terminal.png" alt="Der /load-Bericht und die Lastzeile über der Eingabe in einem Terminal" width="860">

<sub>Aus Demodaten im eigenen Design des Mods gerendert.</sub>

</div>

## Installation

Ein Befehl; wähle deine Shell. Er fügt dieses Repository als Plugin-Marketplace hinzu und
installiert den Mod für deinen Benutzer, sodass er in jeder neuen Sitzung geladen wird, im
Terminal wie in der Claude Desktop-App.

**macOS · Linux · Git Bash unter Windows**

```bash
claude plugin marketplace add Gerrux/claude-load && claude plugin install claude-load@claude-load --config language=auto
```

**Windows — PowerShell** (5.1 und 7)

```powershell
claude plugin marketplace add Gerrux/claude-load; if ($?) { claude plugin install claude-load@claude-load --config language=auto }
```

**Windows — Eingabeaufforderung** (`cmd`)

```bat
claude plugin marketplace add Gerrux/claude-load && claude plugin install claude-load@claude-load --config language=auto
```

**Nur Claude Desktop-App** (kein `claude`-Befehl im Terminal): Klicke auf **+** neben dem
Eingabefeld → **Plugins** → **Add marketplace** → `Gerrux/claude-load` → **Add plugin**
→ **claude-load**.

**In einer Claude Code-Terminalsitzung:**

```text
/plugin marketplace add Gerrux/claude-load
/plugin install claude-load@claude-load
```

Führe danach in einer bereits geöffneten Sitzung `/reload-plugins` und `/load` aus.

| | |
| --- | --- |
| **Voraussetzungen** | Claude Code mit Mod-Unterstützung, Version 2.1.287 oder neuer (`claude --version`); Windows 10/11, macOS oder Linux |
| **Sprache** | `--config language=auto` folgt der Sprache von Claude Code, dann der Systemsprache. Lege eine fest mit `en`, `ru`, `de`, `es`, `fr`, `pt`, `zh` oder `ja`, oder ändere sie später in `/config` |
| **Update** | `claude plugin marketplace update claude-load`, dann `claude plugin update claude-load@claude-load`, dann `/reload-plugins` |
| **Entfernen** | `claude plugin uninstall claude-load@claude-load` (und `claude plugin marketplace remove claude-load`) |

## Warum

Starte ein paar Claude Code-Sitzungen parallel, jede mit Subagenten, MCP-Servern, Dev-Servern
und Test-Runnern, und der Rechner kriecht, während der Task-Manager eine Wand aus `node` und
`claude` zeigt. claude-load schlüsselt die Last **nach Sitzung** auf:

| | |
| --- | --- |
| 📊 **Pro Sitzung** | CPU, Speicher, Prozessanzahl, die schwersten Prozesse darin, ein CPU-Graph über 6 Minuten |
| ⚠️ **Verwaiste Prozesse** | Dev-Prozesse, deren Elternprozess beendet wurde (ein vite-Server, ein Language Server, ein liegengebliebener Python-Lauf), anhand des Arbeitsverzeichnisses ihrem Repository oder Worktree zugeordnet und nach einer Bestätigung mit einem Klick beendet |
| 🧩 **Alles andere** | Weitere Prozesse nach Namen zusammengefasst (`chrome ×31`), damit du siehst, ob das Problem überhaupt bei Claude liegt |
| 🔎 **Filter & Gruppen** | Alle · Aktiv · Schwer · Verwaist · Dieses Fenster; nach Sitzung, nach Repository (Worktrees eingefaltet), nach Prozess; Sortierung nach CPU oder Speicher |
| ✨ **Mit Claude aufräumen** | Eine Schaltfläche: Der mitgelieferte Skill `sessions-triage` klassifiziert inaktive Sitzungen und verwaiste Prozesse, fragt einmal nach und archiviert oder beendet nur, was du freigibst |
| 🚦 **Lastzeile** | Über der Eingabe bei hoher Last (CPU ≥ 50 % oder Speicher ≥ 85 %), mit den größten Verbrauchern |
| 🌍 **8 Sprachen** | English, Русский, Deutsch, Español, Français, Português, 中文, 日本語 |

## Verwendung

| Befehl | Was er tut |
| --- | --- |
| `/load` | Öffnet das Panel und gibt einen kompakten Bericht im Transkript aus |
| `/load all` | Dasselbe, mit allen inaktiven Sitzungen in der Liste |
| `/load band on` · `off` · `auto` | Die Lastzeile über der Eingabe: immer, nie oder nur bei hoher Last (Standard) |

Im Panel:

- **Prozesse** klappt eine Sitzung in ihre Prozesse nach Namen und ihre schweren PIDs auf.
- **beenden** bei einem Prozess oder einem verwaisten Prozess beendet ihn samt seinen
  Kindprozessen nach **Ja, beenden**. Zuvor wird die PID noch einmal gegen eine frische
  Messung unter demselben Namen geprüft. Die eigenen `claude`-Prozesse der Sitzungen und
  PIDs, die nicht in der aktuellen Messung stehen, lassen sich von hier aus nicht beenden.
- **öffnen ↗** wechselt in der Claude Desktop-App zu dieser Sitzung.
- **✨ Mit Claude aufräumen** bittet Claude in der aktuellen Sitzung, die Last zu sichten.
  Das Archivieren von Sitzungen braucht die Sitzungswerkzeuge der Desktop-App; im Terminal
  sagt dir Claude stattdessen, was du schließen solltest.

Filter, Gruppierung und Sortierung bleiben über Sitzungen hinweg erhalten.

**Sprache:** Die Plugin-Option `language` (`/config`) akzeptiert `auto`, `en`, `ru`, `de`,
`es`, `fr`, `pt`, `zh` oder `ja`. `auto` folgt der Einstellung `language` von Claude Code,
dann der Systemsprache, dann Englisch.

## So funktioniert es

Ein Sampler pro Rechner schreibt `~/.claude/state/load/snapshot.json`; der Mod jeder
Sitzung liest die Datei nur alle 5 Sekunden, sodass der Aufwand nicht mit der Zahl der
Sitzungen wächst.

- **Windows:** ein versteckter PowerShell-Prozess (`sampler/load-sampler.ps1`), vom Mod
  gestartet. Er liest alle 4 Sekunden `Get-Process` und den Elternbaum aus CIM nur, wenn
  neue Prozesse auftauchen, und beendet sich 3 Minuten nach dem Schließen der letzten
  Sitzung. Gemessen auf einem Rechner mit 12 Threads und 15 Sitzungen: etwa 0,35 % CPU und
  130 MB Speicher.
- **macOS und Linux:** Der Mod einer Sitzung hält eine Lease und misst mit `ps`; fällt sie
  weg, übernimmt eine andere Sitzung innerhalb von 15 Sekunden.

Eine Sitzung ist eine PID aus `~/.claude/sessions/<pid>.json`, und ihre Last ist ihr
gesamter Prozessbaum. Ein verwaister Prozess ist ein Prozessbaum, dessen Elternprozess
beendet wurde (unter macOS und Linux: an `init`, `systemd` oder `launchd` umgehängt) und
der ein Dev-Tool enthält. Sein Arbeitsverzeichnis stammt vom Prozess selbst (Windows liest
es aus dem Speicher des Prozesses, Linux aus `/proc/<pid>/cwd`, macOS über `lsof`).

**Datenschutz:** Alles bleibt auf deinem Rechner. Keine Netzwerkaufrufe, keine Telemetrie.

## Fehlerbehebung

- **„Der Sampler startet nicht“** (Windows): PowerShell-Skripte sind per Richtlinie
  gesperrt (`AllSigned` oder Constrained Language Mode). Der Sampler muss
  `sampler/load-sampler.ps1` aus dem Plugin-Ordner ausführen können.
- **Unter macOS/Linux wird nichts angezeigt:** Prüfe, ob `ps` im `PATH` liegt; `lsof`
  (macOS) wird nur für verwaiste Prozesse benötigt.

## Status

Entwickelt und täglich genutzt unter Windows 11 mit der Claude Desktop-App. Der Sampler für
macOS und Linux ist durch Unit-Tests mit aufgezeichneter Ausgabe von `ps`, `vm_stat`,
`/proc/meminfo` und `lsof` abgedeckt, lief aber noch nicht auf einem echten Mac oder
Linux-Rechner. Berichte und Fixes sind willkommen.

## Entwicklung

```bash
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

Screenshots werden aus `docs/mock/index.html` gerendert; siehe [docs/mock/README.md](docs/mock/README.md).

## Lizenz

[MIT](LICENSE)
