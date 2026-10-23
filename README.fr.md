<div align="center">

[English](README.md) · [Русский](README.ru.md) · [Deutsch](README.de.md) · [Español](README.es.md) · **Français** · [Português](README.pt.md) · [中文](README.zh.md) · [日本語](README.ja.md)

# claude-load

**Voyez quelle session Claude Code dévore votre CPU et votre mémoire, et faites le ménage en un clic.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-informational)
![Languages](https://img.shields.io/badge/languages-8-success)
![Claude Code mod](https://img.shields.io/badge/Claude%20Code-mod-d97757)

<img src="docs/screenshots/pane.png" alt="Le panneau claude-load dans l'application de bureau Claude : jauges CPU et RAM avec graphiques, sessions avec leur charge, un serveur de développement orphelin et d'autres processus" width="560">

<img src="docs/screenshots/band.png" alt="La ligne de charge au-dessus de la saisie dans l'application de bureau Claude : un graphique CPU, CPU et RAM, les plus gros consommateurs et un bouton /load" width="760">

<img src="docs/screenshots/terminal.png" alt="Le rapport /load et la ligne de charge au-dessus de la saisie dans un terminal" width="860">

<sub>Générées à partir de données de démonstration, dans le design propre au mod.</sub>

</div>

## Installation

Une seule commande ; choisissez votre shell. Elle ajoute ce dépôt comme marketplace de
plugins et installe le mod pour votre utilisateur, de sorte qu'il se charge dans chaque
nouvelle session, aussi bien dans le terminal que dans l'application de bureau Claude.

**macOS · Linux · Git Bash sous Windows**

```bash
claude plugin marketplace add Gerrux/claude-load && claude plugin install claude-load@claude-load --config language=auto
```

**Windows — PowerShell** (5.1 et 7)

```powershell
claude plugin marketplace add Gerrux/claude-load; if ($?) { claude plugin install claude-load@claude-load --config language=auto }
```

**Windows — Invite de commandes** (`cmd`)

```bat
claude plugin marketplace add Gerrux/claude-load && claude plugin install claude-load@claude-load --config language=auto
```

**Application de bureau Claude uniquement** (pas de commande `claude` dans votre terminal) :
cliquez sur **+** à côté de la zone de saisie → **Plugins** → **Add marketplace** →
`Gerrux/claude-load` → **Add plugin** → **claude-load**.

**Dans une session de terminal Claude Code :**

```text
/plugin marketplace add Gerrux/claude-load
/plugin install claude-load@claude-load
```

Ensuite, dans une session déjà ouverte, lancez `/reload-plugins` puis `/load`.

| | |
| --- | --- |
| **Prérequis** | Claude Code avec prise en charge des mods, version 2.1.287 ou ultérieure (`claude --version`) ; Windows 10/11, macOS ou Linux |
| **Langue** | `--config language=auto` suit la langue de Claude Code, puis les paramètres régionaux du système. Imposez-en une avec `en`, `ru`, `de`, `es`, `fr`, `pt`, `zh` ou `ja`, ou changez-la plus tard dans `/config` |
| **Mise à jour** | `claude plugin marketplace update claude-load`, puis `claude plugin update claude-load@claude-load`, puis `/reload-plugins` |
| **Suppression** | `claude plugin uninstall claude-load@claude-load` (et `claude plugin marketplace remove claude-load`) |

## Pourquoi

Lancez plusieurs sessions Claude Code en parallèle, chacune avec des sous-agents, des
serveurs MCP, des serveurs de développement et des lanceurs de tests, et la machine rame
pendant que le Gestionnaire des tâches affiche un mur de `node` et de `claude`. claude-load
répartit la charge **par session** :

| | |
| --- | --- |
| 📊 **Par session** | CPU, mémoire, nombre de processus, les processus les plus lourds à l'intérieur, un graphique CPU sur 6 minutes |
| ⚠️ **Orphelins** | processus de développement dont le parent a disparu (un serveur vite, un serveur de langage, une exécution Python restée en plan), rattachés à leur dépôt ou worktree d'après le répertoire de travail, et arrêtés en un clic après confirmation |
| 🧩 **Tout le reste** | les autres processus regroupés par nom (`chrome ×31`), pour voir si le problème vient bien de Claude |
| 🔎 **Filtres et groupes** | Tous · Actifs · Lourds · Orphelins · Cette fenêtre ; par session, par dépôt (worktrees inclus), par processus ; tri par CPU ou par mémoire |
| ✨ **Faire le tri avec Claude** | un bouton : le skill `sessions-triage` fourni classe les sessions inactives et les orphelins, pose la question une seule fois, puis archive ou arrête uniquement ce que vous approuvez |
| 🚦 **Ligne de charge** | au-dessus de la saisie en cas de forte charge (CPU ≥ 50 % ou mémoire ≥ 85 %), avec les plus gros consommateurs |
| 🌍 **8 langues** | English, Русский, Deutsch, Español, Français, Português, 中文, 日本語 |

## Utilisation

| Commande | Ce qu'elle fait |
| --- | --- |
| `/load` | Ouvre le panneau et affiche un rapport compact dans la transcription |
| `/load all` | Idem, avec toutes les sessions inactives listées |
| `/load band on` · `off` · `auto` | La ligne de charge au-dessus de la saisie : toujours, jamais, ou seulement en cas de forte charge (par défaut) |

Dans le panneau :

- **processus** déplie une session en ses processus par nom et ses PID les plus lourds.
- **arrêter** sur un processus ou un orphelin l'arrête avec ses processus enfants après
  **Oui, arrêter**. Le PID est d'abord revérifié sur un échantillon récent, sous le même
  nom. Les processus `claude` propres aux sessions et les PID absents de l'échantillon
  actuel ne peuvent pas être arrêtés d'ici.
- **ouvrir ↗** bascule vers cette session dans l'application de bureau Claude.
- **✨ Faire le tri avec Claude** demande à Claude, dans la session en cours, de faire le tri
  dans la charge. L'archivage des sessions nécessite les outils de session de l'application
  de bureau ; dans un terminal, Claude vous indique à la place quoi fermer.

Le filtre, le regroupement et le tri sont mémorisés d'une session à l'autre.

**Langue :** l'option `language` du plugin (`/config`) accepte `auto`, `en`, `ru`, `de`,
`es`, `fr`, `pt`, `zh` ou `ja`. `auto` suit le réglage `language` de Claude Code, puis les
paramètres régionaux du système, puis l'anglais.

## Fonctionnement

Un seul échantillonneur par machine écrit `~/.claude/state/load/snapshot.json` ; le mod de
chaque session ne fait que le lire toutes les 5 secondes, si bien que le coût ne croît pas
avec le nombre de sessions.

- **Windows :** un processus PowerShell caché (`sampler/load-sampler.ps1`) lancé par le mod.
  Il lit `Get-Process` toutes les 4 secondes et l'arbre des parents via CIM uniquement
  quand de nouveaux processus apparaissent, et s'arrête 3 minutes après la fermeture de la
  dernière session. Mesuré sur une machine à 12 threads avec 15 sessions : environ 0,35 %
  de CPU et 130 Mo de mémoire.
- **macOS et Linux :** le mod d'une session détient un bail (lease) et échantillonne avec
  `ps` ; une autre session prend le relais en moins de 15 secondes si celle-ci disparaît.

Une session est un PID issu de `~/.claude/sessions/<pid>.json`, et sa charge est celle de
tout son arbre de processus. Un orphelin est un arbre de processus dont le parent a disparu
(sous macOS et Linux : rattaché à `init`, `systemd` ou `launchd`) et qui contient un outil
de développement. Son répertoire de travail est lu depuis le processus lui-même (Windows le
lit dans la mémoire du processus, Linux dans `/proc/<pid>/cwd`, macOS via `lsof`).

**Confidentialité :** tout reste sur votre machine. Aucun appel réseau, aucune télémétrie.

## Dépannage

- **« L'échantillonneur ne démarre pas »** (Windows) : les scripts PowerShell sont bloqués
  par une stratégie (`AllSigned` ou Constrained Language Mode). L'échantillonneur doit
  pouvoir exécuter `sampler/load-sampler.ps1` depuis le dossier du plugin.
- **Rien ne s'affiche sous macOS/Linux :** vérifiez que `ps` est dans le `PATH` ; `lsof`
  (macOS) n'est nécessaire que pour les orphelins.

## État du projet

Développé et utilisé au quotidien sous Windows 11 avec l'application de bureau Claude.
L'échantillonneur macOS et Linux est couvert par des tests unitaires sur des sorties
enregistrées de `ps`, `vm_stat`, `/proc/meminfo` et `lsof`, mais n'a pas encore tourné sur
un vrai Mac ni sur une vraie machine Linux. Les retours et les correctifs sont les
bienvenus.

## Développement

```bash
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

Les captures d'écran sont générées à partir de `docs/mock/index.html` ; voir [docs/mock/README.md](docs/mock/README.md).

## Licence

[MIT](LICENSE)
