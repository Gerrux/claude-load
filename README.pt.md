<div align="center">

[English](README.md) · [Русский](README.ru.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · **Português** · [中文](README.zh.md) · [日本語](README.ja.md)

# claude-load

**Veja qual sessão do Claude Code está consumindo sua CPU e sua memória — e limpe tudo com um clique.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-informational)
![Languages](https://img.shields.io/badge/languages-8-success)
![Claude Code mod](https://img.shields.io/badge/Claude%20Code-mod-d97757)

<img src="docs/screenshots/pane.png" alt="O painel do claude-load no aplicativo desktop do Claude: medidores de CPU e RAM com gráficos, sessões com a sua carga, um servidor de desenvolvimento órfão e outros processos" width="560">

<img src="docs/screenshots/band.png" alt="A linha de carga acima do prompt no aplicativo desktop do Claude: um gráfico de CPU, CPU e RAM, os maiores consumidores e um botão /load" width="760">

<img src="docs/screenshots/terminal.png" alt="O relatório do /load e a linha de carga acima do prompt em um terminal" width="860">

<sub>Geradas a partir de dados de demonstração, no design próprio do mod.</sub>

</div>

## Instalação

Um único comando; escolha o seu shell. Ele adiciona este repositório como marketplace de
plugins e instala o mod para o seu usuário, de modo que ele é carregado em toda nova
sessão, tanto no terminal quanto no aplicativo desktop do Claude.

**macOS · Linux · Git Bash no Windows**

```bash
claude plugin marketplace add Gerrux/claude-load && claude plugin install claude-load@claude-load --config language=auto
```

**Windows — PowerShell** (5.1 e 7)

```powershell
claude plugin marketplace add Gerrux/claude-load; if ($?) { claude plugin install claude-load@claude-load --config language=auto }
```

**Windows — Prompt de Comando** (`cmd`)

```bat
claude plugin marketplace add Gerrux/claude-load && claude plugin install claude-load@claude-load --config language=auto
```

**Somente o aplicativo desktop do Claude** (sem o comando `claude` no terminal): clique em
**+** ao lado da caixa do prompt → **Plugins** → **Add marketplace** →
`Gerrux/claude-load` → **Add plugin** → **claude-load**.

**Dentro de uma sessão de terminal do Claude Code:**

```text
/plugin marketplace add Gerrux/claude-load
/plugin install claude-load@claude-load
```

Depois, em uma sessão que já estava aberta, execute `/reload-plugins` e `/load`.

| | |
| --- | --- |
| **Requisitos** | Claude Code com suporte a mods, versão 2.1.287 ou superior (`claude --version`); Windows 10/11, macOS ou Linux |
| **Idioma** | `--config language=auto` segue o idioma do Claude Code e, depois, a localidade do sistema. Fixe um com `en`, `ru`, `de`, `es`, `fr`, `pt`, `zh` ou `ja`, ou mude depois em `/config` |
| **Atualizar** | `claude plugin marketplace update claude-load`, depois `claude plugin update claude-load@claude-load` e então `/reload-plugins` |
| **Remover** | `claude plugin uninstall claude-load@claude-load` (e `claude plugin marketplace remove claude-load`) |

## Por quê

Rode várias sessões do Claude Code em paralelo, cada uma com subagentes, servidores MCP,
servidores de desenvolvimento e executores de testes, e a máquina engasga enquanto o
Gerenciador de Tarefas mostra um paredão de `node` e `claude`. O claude-load divide a carga
**por sessão**:

| | |
| --- | --- |
| 📊 **Por sessão** | CPU, memória, número de processos, os processos mais pesados dentro dela, um gráfico de CPU de 6 minutos |
| ⚠️ **Órfãos** | processos de desenvolvimento cujo processo pai morreu (um servidor vite, um servidor de linguagem, uma execução de Python deixada para trás), situados no seu repositório ou worktree pelo diretório de trabalho e encerrados com um clique após uma confirmação |
| 🧩 **Todo o resto** | outros processos agrupados por nome (`chrome ×31`), para você ver se o problema é mesmo o Claude |
| 🔎 **Filtros e grupos** | Todos · Ativos · Pesados · Órfãos · Esta janela; por sessão, por repositório (com os worktrees incorporados), por processo; ordenação por CPU ou memória |
| ✨ **Resolver com o Claude** | um botão: a skill `sessions-triage` incluída classifica as sessões ociosas e os órfãos, pergunta uma única vez e arquiva ou encerra somente o que você aprovar |
| 🚦 **Linha de carga** | acima do prompt sob carga alta (CPU ≥ 50% ou memória ≥ 85%), com os maiores consumidores |
| 🌍 **8 idiomas** | English, Русский, Deutsch, Español, Français, Português, 中文, 日本語 |

## Uso

| Comando | O que faz |
| --- | --- |
| `/load` | Abre o painel e imprime um relatório compacto na transcrição |
| `/load all` | O mesmo, com todas as sessões ociosas listadas |
| `/load band on` · `off` · `auto` | A linha de carga acima do prompt: sempre, nunca ou só sob carga alta (padrão) |

No painel:

- **processos** expande uma sessão em seus processos por nome e seus PIDs pesados.
- **encerrar** em um processo ou em um órfão o encerra junto com seus processos filhos
  depois de **Sim, encerrar**. Antes, o PID é verificado novamente em uma amostra recente
  com o mesmo nome. Os processos `claude` das próprias sessões e os PIDs que não estão na
  amostra atual não podem ser encerrados por aqui.
- **abrir ↗** muda para aquela sessão no aplicativo desktop do Claude.
- **✨ Resolver com o Claude** pede ao Claude, na sessão atual, que analise a carga.
  Arquivar sessões exige as ferramentas de sessão do aplicativo desktop; em um terminal, o
  Claude diz o que você deve fechar.

O filtro, o agrupamento e a ordenação são lembrados entre as sessões.

**Idioma:** a opção `language` do plugin (`/config`) aceita `auto`, `en`, `ru`, `de`,
`es`, `fr`, `pt`, `zh` ou `ja`. `auto` segue a configuração `language` do Claude Code,
depois a localidade do sistema e, por fim, o inglês.

## Como funciona

Um amostrador por máquina grava `~/.claude/state/load/snapshot.json`; o mod de cada sessão
apenas o lê a cada 5 segundos, então o custo não cresce com o número de sessões.

- **Windows:** um processo oculto do PowerShell (`sampler/load-sampler.ps1`) iniciado pelo
  mod. Ele lê `Get-Process` a cada 4 segundos e a árvore de processos pai via CIM somente
  quando surgem novos processos, e encerra 3 minutos depois que a última sessão é fechada.
  Medido em uma máquina de 12 threads com 15 sessões: cerca de 0,35% de CPU e 130 MB de
  memória.
- **macOS e Linux:** o mod de uma sessão mantém um lease e amostra com `ps`; outra sessão
  assume em até 15 segundos se essa desaparecer.

Uma sessão é um PID de `~/.claude/sessions/<pid>.json`, e sua carga é toda a sua árvore de
processos. Um órfão é uma árvore de processos cujo pai morreu (no macOS e no Linux:
reatribuído a `init`, `systemd` ou `launchd`) e que contém uma ferramenta de
desenvolvimento. Seu diretório de trabalho vem do próprio processo (o Windows o lê da
memória do processo, o Linux de `/proc/<pid>/cwd`, o macOS via `lsof`).

**Privacidade:** tudo fica na sua máquina. Sem chamadas de rede, sem telemetria.

## Solução de problemas

- **"O amostrador não inicia"** (Windows): os scripts do PowerShell estão bloqueados por
  política (`AllSigned` ou Constrained Language Mode). O amostrador precisa executar
  `sampler/load-sampler.ps1` a partir da pasta do plugin.
- **Nada aparece no macOS/Linux:** verifique se `ps` está no `PATH`; o `lsof` (macOS) só é
  necessário para os órfãos.

## Status

Desenvolvido e usado diariamente no Windows 11 com o aplicativo desktop do Claude. O
amostrador para macOS e Linux é coberto por testes unitários sobre saídas gravadas de `ps`,
`vm_stat`, `/proc/meminfo` e `lsof`, mas ainda não rodou em um Mac ou em uma máquina Linux
de verdade. Relatos e correções são bem-vindos.

## Desenvolvimento

```bash
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

As capturas de tela são geradas a partir de `docs/mock/index.html`; veja [docs/mock/README.md](docs/mock/README.md).

## Licença

[MIT](LICENSE)
