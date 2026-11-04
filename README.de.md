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
| ✻ **Mit Claude aufräumen** | Eine Schaltfläche: Der mitgelieferte Skill `sessions-triage` klassifiziert inaktive Sitzungen und verwaiste Prozesse, fragt einmal nach und archiviert oder beendet nur, was du freigibst |
| ⏳ **Laufwarteschlange** | `runq` lässt schwere Läufe aller Sitzungen nacheinander auf dem Rechner laufen, geregelt nach Speicher, exklusiven Tags und Datenträger; ein optionaler Wächter schickt sie dorthin |
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
- **✻ Mit Claude aufräumen** bittet Claude in der aktuellen Sitzung, die Last zu sichten.
  Das Archivieren von Sitzungen braucht die Sitzungswerkzeuge der Desktop-App; im Terminal
  sagt dir Claude stattdessen, was du schließen solltest.

Filter, Gruppierung und Sortierung bleiben über Sitzungen hinweg erhalten.

**Sprache:** Die Plugin-Option `language` (`/config`) akzeptiert `auto`, `en`, `ru`, `de`,
`es`, `fr`, `pt`, `zh` oder `ja`. `auto` folgt der Einstellung `language` von Claude Code,
dann der Systemsprache, dann Englisch.

## Laufwarteschlange (runq)

Mehrere Sitzungen auf einem Rechner starten jeweils einen speicherhungrigen Lauf (eine
Test-Suite, eine Simulation, einen großen Build), und dem Rechner geht der Speicher aus,
oder zwei Läufe, die temporäre Pfade teilen, stören einander. `runq` lässt sie von selbst
nacheinander laufen: Jeder schwere Befehl wartet in einer Warteschlange für den ganzen
Rechner, bis Platz für ihn ist, und läuft dann wie gewohnt.

```bash
python "$HOME/.claude/state/queue/runq.py" --mem 20 --tag helios --label "scan 1 ha" -- ./target/release/treegrow-cli scan --plot 1ha
```

Dieselbe Zeile funktioniert in Git Bash und in PowerShell (`$HOME` wird in beiden
aufgelöst; anderswo `python3` verwenden). Es braucht Python 3.8 oder neuer. Der Mod kopiert
`runq.py` bei jedem Sitzungsstart nach `~/.claude/state/queue/`, sodass der Pfad über
Plugin-Updates hinweg gleich bleibt.

Ein Job wartet nach dem Prinzip „wer zuerst kommt, mahlt zuerst“, bis all das gilt:

- **Speicher:** Der freie Commit (was Windows noch zusagen kann: RAM plus Auslagerungsdatei)
  deckt das `--mem` des Jobs plus einen Puffer, standardmäßig 12 GB. Laufende Jobs zählen
  mit dem, was sie angegeben und noch nicht belegt haben; so sehen zwei Jobs, die eine
  Sekunde nacheinander zugelassen werden, nicht beide denselben freien Speicher. Ein
  kleinerer Job darf an einem größeren vorbeiziehen, der auf Speicher wartet; hat der
  größere 5 Minuten gewartet, zieht nichts mehr an ihm vorbei, was Speicher braucht.
- **exklusive Tags:** Kein laufender und kein früher eingereihter Job hält denselben
  exklusiven Tag. `cargo-test` ist standardmäßig exklusiv: ein `cargo test` pro Rechner.
- **Datenträger:** Jedes Laufwerk aus `--disk D:=<GB>` hat so viel freien Platz, abzüglich
  dessen, was laufende Jobs dafür angegeben und noch nicht geschrieben haben.

Dann führt runq den Befehl als eigenes Kind mit stdin, stdout und stderr des Terminals aus
und beendet sich mit dem Exit-Code des Befehls. Die eigenen Zeilen von runq gehen nach
stderr und beginnen mit `runq:`: eine Fortschrittszeile alle 30 s beim Warten (warum er
wartet) sowie am Ende Exit, Laufzeit und Spitzenspeicher.

| Option | |
| --- | --- |
| `--mem <GB>` | der erwartete Spitzenspeicher des Laufs (erforderlich; `0` für einen Lauf, der nur einen Tag braucht) |
| `--tag <name>` | wiederholbar; exklusiv, wenn in `exclusiveTags` aufgeführt |
| `--disk D:=<GB>` | wiederholbar; freier Platz, den ein Laufwerk haben muss (unter macOS/Linux ein Pfad) |
| `--label <text>` | wie Panel und Log den Job nennen (Standard: der Befehl) |
| `--max-mem <GB>` | beendet den eigenen Prozessbaum des Befehls, wenn er darüber geht |
| `--max-wait <min>` | gibt nach so langem Warten auf (Exit 75) |

| Exit | |
| --- | --- |
| der des Befehls | er lief |
| 2 | Verwendungsfehler |
| 3 | `--mem` plus Puffer ist mehr als das Commit-Limit des Rechners: Er könnte nie starten |
| 75 | `--max-wait` ist abgelaufen |
| 126 | der Befehl ließ sich nicht starten (zum Beispiel eine frisch gebaute `.exe`, die Microsoft Defender blockiert: `Permission denied`); wird einmal gemeldet, nie wiederholt |
| 127 | Befehl nicht gefunden |
| 130 | beim Warten abgebrochen (Strg+C) |
| 137 | durch das eigene `--max-mem` beendet |

`runq.py status` zeigt, was läuft und was wartet (und warum), freien Commit, RAM und
Datenträger; `runq.py log --since 30m` (oder `-n 50`, eine ISO-Zeit, `--json`) zeigt die
Ereignisse: queued, started, finished, killed, failed, stale, cancelled, gave-up. Das Panel
zeigt dasselbe in einem Abschnitt **Laufwarteschlange**, solange etwas läuft oder wartet,
und danach noch zwei Stunden.

**Was runq anfasst.** Den Speicher fremder Prozesse liest es nur über die Gesamtwerte des
Rechners. Die einzigen Prozesse, die es je beendet, sind der Baum seines eigenen Befehls,
und nur mit `--max-mem`. Unter Windows läuft der Befehl in einem Job Object: Sein Baum sind
genau die Mitglieder des Jobs, jedes wird vor dem Beenden auf Zugehörigkeit zum Job
geprüft, und ein runq, das selbst beendet wird, nimmt seinen Befehl mit, statt ihn
unverbucht weiterlaufen zu lassen. Wo sich kein Job anlegen lässt (und unter macOS/Linux),
wird der Baum über die Eltern-PID durchlaufen, und die Startzeit jedes Prozesses wird vor
dem Beenden geprüft. Ein Job, dessen runq und Befehl beide verschwunden sind (Absturz,
Neustart), wird anhand von PID und Startzeit verworfen; ein Befehl, der nach dem Tod seines
runq noch läuft, behält seinen Platz und seine Tags. Die Entscheidungen fallen unter einer
Dateisperre des Betriebssystems, die dieses freigibt, wenn ihr Halter stirbt.

**Einstellungen:** `~/.claude/state/queue/config.json`, alle optional:

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

### Der Wächter: schwere Befehle nur über runq

In einem Projekt, das sich dafür entscheidet, wird ein Bash- oder PowerShell-Befehl, der
einen schweren Lauf an runq vorbei startet, abgelehnt, und der Agent bekommt stattdessen
die genaue runq-Zeile, die er ausführen soll (mit seinem `cd …&&` und `| tail`). Der Mod
schreibt oder führt einen Befehl nie selbst um. Schalte ihn für ein Projekt in dessen
`.claude/settings.json` ein (gemeinsam genutzt, sodass jeder Worktree davon ihn hat) oder
in `.claude/settings.local.json`:

```json
{ "env": { "CLAUDE_LOAD_RUNQ_GUARD": "1" } }
```

oder für Ordner, Worktrees eingeschlossen, mit `guard.roots` in `config.json` (`*` steht
für einen Pfadteil); `"0"` in den Einstellungen eines Projekts schaltet ihn dort ab.
Standardmäßig schwer sind: `cargo test` / `cargo nextest`, `treegrow*`
`grow|scan|stand|forest` (eine ausführbare Datei oder `cargo run … -- <verb>`) und
`helios*`; `guard.rules` ersetzt die Liste.

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
python -m unittest discover -s runq -v
claude --plugin-dir .
```

Screenshots werden aus `docs/mock/index.html` gerendert; siehe [docs/mock/README.md](docs/mock/README.md).

## Lizenz

[MIT](LICENSE)
