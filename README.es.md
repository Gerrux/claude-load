<div align="center">

[English](README.md) · [Русский](README.ru.md) · [Deutsch](README.de.md) · **Español** · [Français](README.fr.md) · [Português](README.pt.md) · [中文](README.zh.md) · [日本語](README.ja.md)

# claude-load

**Descubre qué sesión de Claude Code se come tu CPU y tu memoria, y límpiala con un clic.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-informational)
![Languages](https://img.shields.io/badge/languages-8-success)
![Claude Code mod](https://img.shields.io/badge/Claude%20Code-mod-d97757)

<img src="docs/screenshots/pane.png" alt="El panel de claude-load en la aplicación de escritorio de Claude: medidores de CPU y RAM con gráficos, sesiones con su carga, un servidor de desarrollo huérfano y otros procesos" width="560">

<img src="docs/screenshots/band.png" alt="La línea de carga sobre el prompt en la aplicación de escritorio de Claude: un gráfico de CPU, CPU y RAM, los mayores consumidores y un botón /load" width="760">

<img src="docs/screenshots/terminal.png" alt="El informe de /load y la línea de carga sobre el prompt en una terminal" width="860">

<sub>Generadas a partir de datos de demostración con el diseño propio del mod.</sub>

</div>

## Instalación

Un solo comando; elige tu shell. Añade este repositorio como marketplace de plugins e
instala el mod para tu usuario, de modo que se carga en cada sesión nueva, tanto en la
terminal como en la aplicación de escritorio de Claude.

**macOS · Linux · Git Bash en Windows**

```bash
claude plugin marketplace add Gerrux/claude-load && claude plugin install claude-load@claude-load --config language=auto
```

**Windows — PowerShell** (5.1 y 7)

```powershell
claude plugin marketplace add Gerrux/claude-load; if ($?) { claude plugin install claude-load@claude-load --config language=auto }
```

**Windows — Símbolo del sistema** (`cmd`)

```bat
claude plugin marketplace add Gerrux/claude-load && claude plugin install claude-load@claude-load --config language=auto
```

**Solo la aplicación de escritorio de Claude** (sin el comando `claude` en la terminal):
haz clic en **+** junto al cuadro del prompt → **Plugins** → **Add marketplace** →
`Gerrux/claude-load` → **Add plugin** → **claude-load**.

**Dentro de una sesión de terminal de Claude Code:**

```text
/plugin marketplace add Gerrux/claude-load
/plugin install claude-load@claude-load
```

Después, en una sesión que ya estaba abierta, ejecuta `/reload-plugins` y `/load`.

| | |
| --- | --- |
| **Requisitos** | Claude Code con compatibilidad con mods, versión 2.1.287 o posterior (`claude --version`); Windows 10/11, macOS o Linux |
| **Idioma** | `--config language=auto` sigue el idioma de Claude Code y, después, el de la configuración regional del sistema. Fija uno con `en`, `ru`, `de`, `es`, `fr`, `pt`, `zh` o `ja`, o cámbialo más tarde en `/config` |
| **Actualizar** | `claude plugin marketplace update claude-load`, luego `claude plugin update claude-load@claude-load` y después `/reload-plugins` |
| **Desinstalar** | `claude plugin uninstall claude-load@claude-load` (y `claude plugin marketplace remove claude-load`) |

## Por qué

Ejecuta varias sesiones de Claude Code en paralelo, cada una con subagentes, servidores MCP,
servidores de desarrollo y ejecutores de pruebas, y la máquina se arrastra mientras el
Administrador de tareas muestra un muro de `node` y `claude`. claude-load reparte la carga
**por sesión**:

| | |
| --- | --- |
| 📊 **Por sesión** | CPU, memoria, número de procesos, los procesos más pesados dentro de ella, un gráfico de CPU de 6 minutos |
| ⚠️ **Huérfanos** | procesos de desarrollo cuyo proceso padre terminó (un servidor vite, un servidor de lenguaje, una ejecución de Python que quedó atrás), situados en su repositorio o worktree según el directorio de trabajo y terminados con un clic tras una confirmación |
| 🧩 **Todo lo demás** | otros procesos agrupados por nombre (`chrome ×31`), para que veas si el problema es realmente Claude |
| 🔎 **Filtros y grupos** | Todos · Activos · Pesados · Huérfanos · Esta ventana; por sesión, por repositorio (con los worktrees integrados), por proceso; orden por CPU o por memoria |
| ✻ **Resolver con Claude** | un botón: la skill incluida `sessions-triage` clasifica las sesiones inactivas y los huérfanos, pregunta una sola vez y archiva o termina solo lo que apruebes |
| ⏳ **Cola de ejecuciones** | `runq` hace que las ejecuciones pesadas de todas las sesiones se turnen en la máquina según la memoria, las etiquetas exclusivas y el disco; un guardián opcional las envía allí |
| 🚦 **Línea de carga** | sobre el prompt con carga alta (CPU ≥ 50 % o memoria ≥ 85 %), con los mayores consumidores |
| 🌍 **8 idiomas** | English, Русский, Deutsch, Español, Français, Português, 中文, 日本語 |

## Uso

| Comando | Qué hace |
| --- | --- |
| `/load` | Abre el panel e imprime un informe compacto en la transcripción |
| `/load all` | Lo mismo, con todas las sesiones inactivas listadas |
| `/load band on` · `off` · `auto` | La línea de carga sobre el prompt: siempre, nunca o solo con carga alta (por defecto) |

En el panel:

- **procesos** despliega una sesión en sus procesos por nombre y sus PID pesados.
- **terminar** en un proceso o en un huérfano lo termina junto con sus procesos hijos tras
  pulsar **Sí, terminar**. Antes se vuelve a comprobar el PID con una muestra reciente bajo
  el mismo nombre. Los procesos `claude` de las propias sesiones y los PID que no están en
  la muestra actual no se pueden terminar desde aquí.
- **abrir ↗** cambia a esa sesión en la aplicación de escritorio de Claude.
- **✻ Resolver con Claude** pide a Claude, en la sesión actual, que haga el triaje de la
  carga. Archivar sesiones requiere las herramientas de sesión de la aplicación de
  escritorio; en una terminal, Claude te indica qué cerrar.

El filtro, la agrupación y el orden se recuerdan entre sesiones.

**Idioma:** la opción `language` del plugin (`/config`) admite `auto`, `en`, `ru`, `de`,
`es`, `fr`, `pt`, `zh` o `ja`. `auto` sigue el ajuste `language` de Claude Code, luego la
configuración regional del sistema y, por último, el inglés.

## Cola de ejecuciones (runq)

Varias sesiones en una misma máquina lanzan cada una una ejecución que consume mucha
memoria (un conjunto de tests, una simulación, una compilación grande), y la máquina se
queda sin memoria, o dos ejecuciones que comparten rutas temporales se estropean entre sí.
`runq` hace que se turnen por sí solas: cada comando pesado espera en una única cola para
toda la máquina hasta que haya sitio para él, y entonces se ejecuta como de costumbre.

```bash
python "$HOME/.claude/state/queue/runq.py" --mem 20 --tag helios --label "scan 1 ha" -- ./target/release/treegrow-cli scan --plot 1ha
```

La misma línea funciona en Git Bash y en PowerShell (`$HOME` se expande en ambos; en otros
sitios usa `python3`). Requiere Python 3.8 o posterior. El mod copia `runq.py` en
`~/.claude/state/queue/` al iniciar cada sesión, de modo que la ruta sigue siendo la misma
entre actualizaciones del plugin.

Una tarea espera, por orden de llegada, hasta que se cumple todo esto:

- **memoria:** el commit libre (lo que Windows aún puede prometer: RAM más archivo de
  paginación) cubre el `--mem` de la tarea más un margen, 12 GB por defecto. Las tareas en
  ejecución cuentan con lo que declararon y aún no han ocupado, así que dos tareas
  admitidas con un segundo de diferencia no ven ambas la misma memoria libre. Una tarea
  más pequeña puede adelantar a una mayor que espera memoria; cuando la mayor ha esperado
  5 minutos, nada que necesite memoria la adelanta.
- **etiquetas exclusivas:** ninguna tarea en ejecución, ni ninguna puesta en cola antes,
  tiene la misma etiqueta exclusiva. `cargo-test` es exclusiva por defecto: un
  `cargo test` por máquina.
- **disco:** cada unidad de `--disk D:=<GB>` tiene ese espacio libre, menos lo que las
  tareas en ejecución declararon para ella y aún no han escrito.

Después runq ejecuta el comando como hijo propio con el stdin, stdout y stderr del terminal
y termina con el código de salida del comando. Las líneas propias de runq van a stderr y
empiezan por `runq:`: una línea de progreso cada 30 s mientras espera (por qué espera) y,
al final, la salida, el tiempo de ejecución y la memoria máxima.

| Opción | |
| --- | --- |
| `--mem <GB>` | la memoria máxima esperada de la ejecución (obligatoria; `0` para una ejecución que solo necesita una etiqueta) |
| `--tag <name>` | repetible; exclusiva si figura en `exclusiveTags` |
| `--disk D:=<GB>` | repetible; espacio libre que debe tener una unidad (una ruta en macOS/Linux) |
| `--label <text>` | cómo llaman a la tarea el panel y el registro (por defecto, el comando) |
| `--max-mem <GB>` | termina el árbol de procesos del propio comando si supera este valor |
| `--max-wait <min>` | se rinde tras esperar tanto (salida 75) |

| Salida | |
| --- | --- |
| la del comando | se ejecutó |
| 2 | error de uso |
| 3 | `--mem` más el margen supera el límite de commit de la máquina: nunca podría empezar |
| 75 | se agotó `--max-wait` |
| 126 | no se pudo iniciar el comando (por ejemplo, un `.exe` recién compilado que Microsoft Defender bloquea: `Permission denied`); se informa una vez, nunca se reintenta |
| 127 | comando no encontrado |
| 130 | cancelada (Ctrl+C) mientras esperaba |
| 137 | terminada por su propio `--max-mem` |

`runq.py status` muestra qué se ejecuta y qué espera (y por qué), el commit libre, la RAM y
los discos; `runq.py log --since 30m` (o `-n 50`, una hora ISO, `--json`) muestra los
eventos: queued, started, finished, killed, failed, stale, cancelled, gave-up. El panel
muestra lo mismo en una sección **Cola de ejecuciones** mientras algo se ejecuta o espera, y
durante dos horas después.

**Qué toca runq.** Lee la memoria de otros procesos solo a través de los totales de la
máquina. Los únicos procesos que termina son el árbol de su propio comando, y solo con
`--max-mem`. En Windows el comando se ejecuta en un Job Object: su árbol son exactamente los
miembros del trabajo, a cada uno se le comprueba que pertenece al trabajo antes de
terminarlo, y un runq al que matan se lleva consigo su comando en lugar de dejarlo
ejecutándose sin contabilizar. Donde no se puede crear un trabajo (y en macOS/Linux), el
árbol se recorre por PID del padre, y se comprueba la hora de inicio de cada proceso antes de
terminarlo. Una tarea cuyo runq y cuyo comando han desaparecido (un fallo, un reinicio) se
descarta por PID y hora de inicio; un comando que sigue ejecutándose tras morir su runq
conserva su plaza y sus etiquetas. Las decisiones se toman bajo un bloqueo de archivo del SO,
que el SO libera cuando muere su titular.

**Ajustes:** `~/.claude/state/queue/config.json`, todos opcionales:

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

### El guardián: los comandos pesados solo a través de runq

En un proyecto que lo activa, un comando de Bash o PowerShell que inicia una ejecución
pesada fuera de runq se deniega, y el agente recibe en su lugar la línea exacta de runq que
debe ejecutar (conservando su `cd …&&` y su `| tail`). El mod nunca reescribe ni ejecuta un
comando por sí mismo. Actívalo para un proyecto en su `.claude/settings.json` (compartido,
así que todos sus worktrees lo tienen) o en `.claude/settings.local.json`:

```json
{ "env": { "CLAUDE_LOAD_RUNQ_GUARD": "1" } }
```

o para carpetas, worktrees incluidos, con `guard.roots` en `config.json` (`*` equivale a
una parte de la ruta); `"0"` en los ajustes de un proyecto lo desactiva allí. Son pesados
por defecto: `cargo test` / `cargo nextest`, `treegrow*` `grow|scan|stand|forest` (un
ejecutable o `cargo run … -- <verb>`) y `helios*`; `guard.rules` reemplaza la lista.

## Cómo funciona

Un muestreador por máquina escribe `~/.claude/state/load/snapshot.json`; el mod de cada
sesión solo lo lee cada 5 segundos, así que el coste no crece con el número de sesiones.

- **Windows:** un proceso oculto de PowerShell (`sampler/load-sampler.ps1`) iniciado por el
  mod. Lee `Get-Process` cada 4 segundos y el árbol de procesos padre desde CIM solo cuando
  aparecen procesos nuevos, y termina 3 minutos después de que se cierre la última sesión.
  Medido en una máquina de 12 hilos con 15 sesiones: alrededor de un 0,35 % de CPU y 130 MB
  de memoria.
- **macOS y Linux:** el mod de una sesión mantiene un lease y muestrea con `ps`; otra sesión
  toma el relevo en menos de 15 segundos si esa desaparece.

Una sesión es un PID de `~/.claude/sessions/<pid>.json`, y su carga es todo su árbol de
procesos. Un huérfano es un árbol de procesos cuyo padre terminó (en macOS y Linux:
reasignado a `init`, `systemd` o `launchd`) y que contiene una herramienta de desarrollo.
Su directorio de trabajo se obtiene del propio proceso (Windows lo lee de la memoria del
proceso, Linux de `/proc/<pid>/cwd`, macOS de `lsof`).

**Privacidad:** todo se queda en tu máquina. Sin llamadas de red, sin telemetría.

## Solución de problemas

- **«El muestreador no arranca»** (Windows): una directiva bloquea los scripts de
  PowerShell (`AllSigned` o Constrained Language Mode). El muestreador necesita poder
  ejecutar `sampler/load-sampler.ps1` desde la carpeta del plugin.
- **No se muestra nada en macOS/Linux:** comprueba que `ps` esté en el `PATH`; `lsof`
  (macOS) solo hace falta para los huérfanos.

## Estado

Desarrollado y usado a diario en Windows 11 con la aplicación de escritorio de Claude. El
muestreador de macOS y Linux está cubierto por pruebas unitarias sobre salidas grabadas de
`ps`, `vm_stat`, `/proc/meminfo` y `lsof`, pero aún no se ha ejecutado en un Mac ni en un
equipo Linux reales. Se agradecen informes y correcciones.

## Desarrollo

```bash
claude plugin validate .
claude plugin test .
python -m unittest discover -s runq -v
claude --plugin-dir .
```

Las capturas se generan a partir de `docs/mock/index.html`; consulta [docs/mock/README.md](docs/mock/README.md).

## Licencia

[MIT](LICENSE)
