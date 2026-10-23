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
| ✨ **Resolver con Claude** | un botón: la skill incluida `sessions-triage` clasifica las sesiones inactivas y los huérfanos, pregunta una sola vez y archiva o termina solo lo que apruebes |
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
- **✨ Resolver con Claude** pide a Claude, en la sesión actual, que haga el triaje de la
  carga. Archivar sesiones requiere las herramientas de sesión de la aplicación de
  escritorio; en una terminal, Claude te indica qué cerrar.

El filtro, la agrupación y el orden se recuerdan entre sesiones.

**Idioma:** la opción `language` del plugin (`/config`) admite `auto`, `en`, `ru`, `de`,
`es`, `fr`, `pt`, `zh` o `ja`. `auto` sigue el ajuste `language` de Claude Code, luego la
configuración regional del sistema y, por último, el inglés.

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
claude --plugin-dir .
```

Las capturas se generan a partir de `docs/mock/index.html`; consulta [docs/mock/README.md](docs/mock/README.md).

## Licencia

[MIT](LICENSE)
