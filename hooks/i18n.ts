// Interface strings in eight languages. The language comes from the plugin's `language`
// option, else Claude Code's `language` setting, else the locale (LC_ALL, LC_MESSAGES, LANG,
// then the runtime's Intl locale); English when none of them names a supported language.

export const LANGS = ['en', 'ru', 'de', 'es', 'fr', 'pt', 'zh', 'ja'] as const
export type Lang = (typeof LANGS)[number]

/** Plural forms as Intl.PluralRules names them; a language fills the categories it uses. */
export type Forms = { one?: string; few?: string; many?: string; other: string }

export type Dict = {
  /** Decimal separator for memory figures. */
  decimal: string
  mb: string
  gb: string
  untitled: string
  paneTitle: string
  waiting: string
  samplerStarting: string
  unsupported: string
  commandDescription: string
  bandUsage: string
  bandSet: (mode: 'auto' | 'on' | 'off') => string
  samplerFailed: (why: string) => string
  /** Windows: the sampler was started several times and never wrote a snapshot. */
  samplerBlocked: string

  filterAll: string
  filterActive: string
  filterHeavy: string
  filterOrphans: string
  filterSelf: string
  groupLabel: string
  groupSessions: string
  groupRepos: string
  groupProcs: string
  sortLabel: string
  sortCpu: string
  sortMem: string
  triage: string
  triageToast: string

  sectionActive: string
  sectionSessions: string
  sectionIdle: string
  sectionOrphans: string
  orphansNote: string
  sectionOutside: string
  sectionProcs: string
  names: Forms
  moreIdle: (n: number, mem: string) => string
  empty: string

  thisWindow: string
  procs: Forms
  sessions: Forms
  orphans: Forms
  threads: Forms
  inThisRepo: string
  orphanOf: (label: string) => string
  outsideWhere: string
  open: string
  showProcs: string
  hideProcs: string
  kill: string
  killTitle: (name: string, pid: number) => string
  killNote: string
  killYes: string
  killNo: string
  killed: (name: string, pid: number, where: string) => string
  killFailed: (name: string, pid: number, why: string) => string
  cannotKill: (name: string, pid: number) => string
  openFailed: (why: string) => string

  /** "15 Claude sessions · 47% CPU · 10.4 GB · 12 threads · 3 s ago" */
  headLine: (sessions: string, cpu: string, mem: string, threads: string, ageS: number) => string
  footer: (minutes: number) => string
  graphAlt: (minutes: number) => string
  bandLabel: string
  /** Plain-text report, the answer of /load in the transcript. */
  reportClaude: (sessions: string, cpu: string, mem: string, ageS: number) => string
  memOf: (used: string, total: string) => string
  reportOrphans: string
  reportOutside: string
}

const en: Dict = {
  decimal: '.',
  mb: 'MB',
  gb: 'GB',
  untitled: '(untitled)',
  paneTitle: 'Load by session',
  waiting: 'Waiting for the first sample…',
  samplerStarting: 'The sampler is starting; the first sample arrives in a few seconds.',
  unsupported: 'claude-load does not support this platform.',
  commandDescription: 'Load by session: CPU and memory of each Claude Code session, orphans and other processes (claude-load)',
  bandUsage: '/load band on | off | auto — auto shows the line only at 50% CPU or 85% memory and above',
  bandSet: m => `Load line above the prompt: ${m === 'auto' ? 'only under high load' : m === 'on' ? 'always' : 'off'}.`,
  samplerFailed: why => `claude-load: could not start the sampler: ${why}`,
  samplerBlocked: 'The sampler does not start. PowerShell scripts may be blocked by policy (AllSigned, Constrained Language Mode).',

  filterAll: 'All',
  filterActive: 'Active',
  filterHeavy: 'Heavy',
  filterOrphans: 'Orphans',
  filterSelf: 'This window',
  groupLabel: 'Group ',
  groupSessions: 'by session',
  groupRepos: 'by repository',
  groupProcs: 'by process',
  sortLabel: 'Sort ',
  sortCpu: 'by CPU',
  sortMem: 'by memory',
  triage: '✨ Sort it out with Claude',
  triageToast: 'Claude is sorting out the load; the answer appears in this session',

  sectionActive: 'Active',
  sectionSessions: 'Sessions',
  sectionIdle: 'Idle',
  sectionOrphans: 'Orphans',
  orphansNote: 'parent gone, process still running',
  sectionOutside: 'Outside sessions',
  sectionProcs: 'Processes',
  names: { one: 'name', other: 'names' },
  moreIdle: (n, mem) => `+ ${n} more · ${mem}`,
  empty: 'Nothing matches this filter.',

  thisWindow: 'this window',
  procs: { one: 'process', other: 'processes' },
  sessions: { one: 'session', other: 'sessions' },
  orphans: { one: 'orphan', other: 'orphans' },
  threads: { one: 'thread', other: 'threads' },
  inThisRepo: 'in this repo:',
  orphanOf: label => `orphan ${label}`,
  outsideWhere: 'outside sessions',
  open: 'open ↗',
  showProcs: 'processes',
  hideProcs: 'collapse',
  kill: 'end',
  killTitle: (name, pid) => `End ${name} #${pid}?`,
  killNote: 'together with its child processes',
  killYes: 'Yes, end it',
  killNo: 'Cancel',
  killed: (name, pid, where) => `Ended ${name} #${pid} (${where})`,
  killFailed: (name, pid, why) => `Could not end ${name} #${pid}: ${why}`,
  cannotKill: (name, pid) => `${name} #${pid}: this process cannot be ended from here`,
  openFailed: why => `Could not open the session: ${why}`,

  headLine: (sessions, cpu, mem, threads, ageS) => `${sessions} · ${cpu} CPU · ${mem} · ${threads} · ${ageS} s ago`,
  footer: m => `graphs show CPU over ${m} min · /load band on|off|auto controls the line above the prompt`,
  graphAlt: m => `CPU over ${m} min`,
  bandLabel: 'load',
  reportClaude: (sessions, cpu, mem, ageS) => `Claude: ${sessions} · ${cpu} CPU · ${mem} · sampled ${ageS} s ago`,
  memOf: (used, total) => `${used} of ${total}`,
  reportOrphans: 'Orphans — parent gone, process still running',
  reportOutside: 'Outside sessions:',
}

const ru: Dict = {
  decimal: ',',
  mb: 'МБ',
  gb: 'ГБ',
  untitled: '(без названия)',
  paneTitle: 'Нагрузка по сессиям',
  waiting: 'Жду первый снимок…',
  samplerStarting: 'Сэмплер запускается, первый снимок будет через несколько секунд.',
  unsupported: 'claude-load не поддерживает эту платформу.',
  commandDescription: 'Нагрузка по сессиям: CPU и память каждой сессии Claude Code, сироты и чужие процессы (claude-load)',
  bandUsage: '/load band on | off | auto — auto показывает строку только при CPU от 50% или памяти от 85%',
  bandSet: m => `Строка нагрузки над вводом: ${m === 'auto' ? 'только при высокой нагрузке' : m === 'on' ? 'всегда' : 'выключена'}.`,
  samplerFailed: why => `claude-load: не удалось запустить сэмплер: ${why}`,
  samplerBlocked: 'Сэмплер не запускается. Возможно, скрипты PowerShell запрещены политикой (AllSigned, Constrained Language Mode).',

  filterAll: 'Все',
  filterActive: 'Активные',
  filterHeavy: 'Тяжёлые',
  filterOrphans: 'Сироты',
  filterSelf: 'Это окно',
  groupLabel: 'Группировка ',
  groupSessions: 'по сессиям',
  groupRepos: 'по репозиториям',
  groupProcs: 'по процессам',
  sortLabel: 'Сортировка ',
  sortCpu: 'по CPU',
  sortMem: 'по памяти',
  triage: '✨ Разобрать с Claude',
  triageToast: 'Claude разбирает нагрузку — ответ появится в этой сессии',

  sectionActive: 'Активные',
  sectionSessions: 'Сессии',
  sectionIdle: 'Простаивают',
  sectionOrphans: 'Сироты',
  orphansNote: 'родитель умер, процесс живёт',
  sectionOutside: 'Вне сессий',
  sectionProcs: 'Процессы',
  names: { one: 'имя', few: 'имени', many: 'имён', other: 'имени' },
  moreIdle: (n, mem) => `+ ещё ${n} · ${mem}`,
  empty: 'Под этот фильтр ничего не попало.',

  thisWindow: 'это окно',
  procs: { one: 'процесс', few: 'процесса', many: 'процессов', other: 'процесса' },
  sessions: { one: 'сессия', few: 'сессии', many: 'сессий', other: 'сессии' },
  orphans: { one: 'сирота', few: 'сироты', many: 'сирот', other: 'сироты' },
  threads: { one: 'поток', few: 'потока', many: 'потоков', other: 'потока' },
  inThisRepo: 'в этом репо:',
  orphanOf: label => `сирота ${label}`,
  outsideWhere: 'вне сессий',
  open: 'открыть ↗',
  showProcs: 'процессы',
  hideProcs: 'свернуть',
  kill: 'завершить',
  killTitle: (name, pid) => `Завершить ${name} #${pid}?`,
  killNote: 'вместе с дочерними процессами',
  killYes: 'Да, завершить',
  killNo: 'Отмена',
  killed: (name, pid, where) => `Завершён ${name} #${pid} (${where})`,
  killFailed: (name, pid, why) => `Не удалось завершить ${name} #${pid}: ${why}`,
  cannotKill: (name, pid) => `${name} #${pid}: этот процесс отсюда завершать нельзя`,
  openFailed: why => `Не удалось открыть сессию: ${why}`,

  headLine: (sessions, cpu, mem, threads, ageS) => `${sessions} · ${cpu} CPU · ${mem} · ${threads} · ${ageS} с назад`,
  footer: m => `графики — CPU за ${m} мин · /load band on|off|auto — строка над вводом`,
  graphAlt: m => `CPU за ${m} мин`,
  bandLabel: 'нагрузка',
  reportClaude: (sessions, cpu, mem, ageS) => `Claude: ${sessions} · ${cpu} CPU · ${mem} · снимок ${ageS} с назад`,
  memOf: (used, total) => `${used} из ${total}`,
  reportOrphans: 'Сироты — родитель умер, процесс живёт',
  reportOutside: 'Вне сессий:',
}

const de: Dict = {
  decimal: ',',
  mb: 'MB',
  gb: 'GB',
  untitled: '(ohne Titel)',
  paneTitle: 'Last pro Sitzung',
  waiting: 'Warte auf die erste Messung…',
  samplerStarting: 'Der Sampler startet; die erste Messung kommt in wenigen Sekunden.',
  unsupported: 'claude-load unterstützt diese Plattform nicht.',
  commandDescription: 'Last pro Sitzung: CPU und Speicher jeder Claude Code-Sitzung, verwaiste und fremde Prozesse (claude-load)',
  bandUsage: '/load band on | off | auto — auto zeigt die Zeile erst ab 50 % CPU oder 85 % Speicher',
  bandSet: m => `Lastzeile über der Eingabe: ${m === 'auto' ? 'nur bei hoher Last' : m === 'on' ? 'immer' : 'aus'}.`,
  samplerFailed: why => `claude-load: Sampler konnte nicht gestartet werden: ${why}`,
  samplerBlocked: 'Der Sampler startet nicht. PowerShell-Skripte sind möglicherweise per Richtlinie gesperrt (AllSigned, Constrained Language Mode).',

  filterAll: 'Alle',
  filterActive: 'Aktiv',
  filterHeavy: 'Schwer',
  filterOrphans: 'Verwaist',
  filterSelf: 'Dieses Fenster',
  groupLabel: 'Gruppieren ',
  groupSessions: 'nach Sitzung',
  groupRepos: 'nach Repository',
  groupProcs: 'nach Prozess',
  sortLabel: 'Sortieren ',
  sortCpu: 'nach CPU',
  sortMem: 'nach Speicher',
  triage: '✨ Mit Claude aufräumen',
  triageToast: 'Claude räumt die Last auf; die Antwort erscheint in dieser Sitzung',

  sectionActive: 'Aktiv',
  sectionSessions: 'Sitzungen',
  sectionIdle: 'Inaktiv',
  sectionOrphans: 'Verwaist',
  orphansNote: 'Elternprozess beendet, Prozess läuft noch',
  sectionOutside: 'Außerhalb von Sitzungen',
  sectionProcs: 'Prozesse',
  names: { one: 'Name', other: 'Namen' },
  moreIdle: (n, mem) => `+ ${n} weitere · ${mem}`,
  empty: 'Nichts passt zu diesem Filter.',

  thisWindow: 'dieses Fenster',
  procs: { one: 'Prozess', other: 'Prozesse' },
  sessions: { one: 'Sitzung', other: 'Sitzungen' },
  orphans: { one: 'verwaister Prozess', other: 'verwaiste Prozesse' },
  threads: { one: 'Thread', other: 'Threads' },
  inThisRepo: 'in diesem Repo:',
  orphanOf: label => `verwaist ${label}`,
  outsideWhere: 'außerhalb von Sitzungen',
  open: 'öffnen ↗',
  showProcs: 'Prozesse',
  hideProcs: 'einklappen',
  kill: 'beenden',
  killTitle: (name, pid) => `${name} #${pid} beenden?`,
  killNote: 'samt seinen Kindprozessen',
  killYes: 'Ja, beenden',
  killNo: 'Abbrechen',
  killed: (name, pid, where) => `${name} #${pid} beendet (${where})`,
  killFailed: (name, pid, why) => `${name} #${pid} konnte nicht beendet werden: ${why}`,
  cannotKill: (name, pid) => `${name} #${pid}: Dieser Prozess kann von hier nicht beendet werden`,
  openFailed: why => `Sitzung konnte nicht geöffnet werden: ${why}`,

  headLine: (sessions, cpu, mem, threads, ageS) => `${sessions} · ${cpu} CPU · ${mem} · ${threads} · vor ${ageS} s`,
  footer: m => `Graphen zeigen CPU der letzten ${m} Min. · /load band on|off|auto steuert die Zeile über der Eingabe`,
  graphAlt: m => `CPU der letzten ${m} Min.`,
  bandLabel: 'Last',
  reportClaude: (sessions, cpu, mem, ageS) => `Claude: ${sessions} · ${cpu} CPU · ${mem} · gemessen vor ${ageS} s`,
  memOf: (used, total) => `${used} von ${total}`,
  reportOrphans: 'Verwaist — Elternprozess beendet, Prozess läuft noch',
  reportOutside: 'Außerhalb von Sitzungen:',
}

const es: Dict = {
  decimal: ',',
  mb: 'MB',
  gb: 'GB',
  untitled: '(sin título)',
  paneTitle: 'Carga por sesión',
  waiting: 'Esperando la primera muestra…',
  samplerStarting: 'El muestreador se está iniciando; la primera muestra llega en unos segundos.',
  unsupported: 'claude-load no es compatible con esta plataforma.',
  commandDescription: 'Carga por sesión: CPU y memoria de cada sesión de Claude Code, huérfanos y otros procesos (claude-load)',
  bandUsage: '/load band on | off | auto — auto muestra la línea solo con 50 % de CPU o 85 % de memoria o más',
  bandSet: m => `Línea de carga sobre el prompt: ${m === 'auto' ? 'solo con carga alta' : m === 'on' ? 'siempre' : 'desactivada'}.`,
  samplerFailed: why => `claude-load: no se pudo iniciar el muestreador: ${why}`,
  samplerBlocked: 'El muestreador no arranca. Puede que una directiva bloquee los scripts de PowerShell (AllSigned, Constrained Language Mode).',

  filterAll: 'Todos',
  filterActive: 'Activos',
  filterHeavy: 'Pesados',
  filterOrphans: 'Huérfanos',
  filterSelf: 'Esta ventana',
  groupLabel: 'Agrupar ',
  groupSessions: 'por sesión',
  groupRepos: 'por repositorio',
  groupProcs: 'por proceso',
  sortLabel: 'Ordenar ',
  sortCpu: 'por CPU',
  sortMem: 'por memoria',
  triage: '✨ Resolver con Claude',
  triageToast: 'Claude está revisando la carga; la respuesta aparecerá en esta sesión',

  sectionActive: 'Activos',
  sectionSessions: 'Sesiones',
  sectionIdle: 'Inactivos',
  sectionOrphans: 'Huérfanos',
  orphansNote: 'el proceso padre terminó, pero sigue en ejecución',
  sectionOutside: 'Fuera de sesiones',
  sectionProcs: 'Procesos',
  names: { one: 'nombre', other: 'nombres' },
  moreIdle: (n, mem) => `+ ${n} más · ${mem}`,
  empty: 'Nada coincide con este filtro.',

  thisWindow: 'esta ventana',
  procs: { one: 'proceso', other: 'procesos' },
  sessions: { one: 'sesión', other: 'sesiones' },
  orphans: { one: 'huérfano', other: 'huérfanos' },
  threads: { one: 'hilo', other: 'hilos' },
  inThisRepo: 'en este repo:',
  orphanOf: label => `huérfano ${label}`,
  outsideWhere: 'fuera de sesiones',
  open: 'abrir ↗',
  showProcs: 'procesos',
  hideProcs: 'contraer',
  kill: 'terminar',
  killTitle: (name, pid) => `¿Terminar ${name} #${pid}?`,
  killNote: 'junto con sus procesos hijos',
  killYes: 'Sí, terminar',
  killNo: 'Cancelar',
  killed: (name, pid, where) => `${name} #${pid} terminado (${where})`,
  killFailed: (name, pid, why) => `No se pudo terminar ${name} #${pid}: ${why}`,
  cannotKill: (name, pid) => `${name} #${pid}: este proceso no se puede terminar desde aquí`,
  openFailed: why => `No se pudo abrir la sesión: ${why}`,

  headLine: (sessions, cpu, mem, threads, ageS) => `${sessions} · ${cpu} CPU · ${mem} · ${threads} · hace ${ageS} s`,
  footer: m => `los gráficos muestran la CPU de ${m} min · /load band on|off|auto controla la línea sobre el prompt`,
  graphAlt: m => `CPU en ${m} min`,
  bandLabel: 'carga',
  reportClaude: (sessions, cpu, mem, ageS) => `Claude: ${sessions} · ${cpu} CPU · ${mem} · muestreado hace ${ageS} s`,
  memOf: (used, total) => `${used} de ${total}`,
  reportOrphans: 'Huérfanos — el proceso padre terminó, pero sigue en ejecución',
  reportOutside: 'Fuera de sesiones:',
}

const fr: Dict = {
  decimal: ',',
  mb: 'Mo',
  gb: 'Go',
  untitled: '(sans titre)',
  paneTitle: 'Charge par session',
  waiting: "En attente du premier échantillon…",
  samplerStarting: "L'échantillonneur démarre ; le premier échantillon arrive dans quelques secondes.",
  unsupported: "claude-load ne prend pas en charge cette plateforme.",
  commandDescription: 'Charge par session : CPU et mémoire de chaque session Claude Code, orphelins et autres processus (claude-load)',
  bandUsage: "/load band on | off | auto — auto n'affiche la ligne qu'à partir de 50 % de CPU ou 85 % de mémoire",
  bandSet: m => `Ligne de charge au-dessus de la saisie : ${m === 'auto' ? 'seulement en cas de forte charge' : m === 'on' ? 'toujours' : 'désactivée'}.`,
  samplerFailed: why => `claude-load : impossible de démarrer l'échantillonneur : ${why}`,
  samplerBlocked: "L'échantillonneur ne démarre pas. Une stratégie bloque peut-être les scripts PowerShell (AllSigned, Constrained Language Mode).",

  filterAll: 'Tous',
  filterActive: 'Actifs',
  filterHeavy: 'Lourds',
  filterOrphans: 'Orphelins',
  filterSelf: 'Cette fenêtre',
  groupLabel: 'Grouper ',
  groupSessions: 'par session',
  groupRepos: 'par dépôt',
  groupProcs: 'par processus',
  sortLabel: 'Trier ',
  sortCpu: 'par CPU',
  sortMem: 'par mémoire',
  triage: '✨ Faire le tri avec Claude',
  triageToast: 'Claude fait le tri dans la charge ; la réponse apparaîtra dans cette session',

  sectionActive: 'Actifs',
  sectionSessions: 'Sessions',
  sectionIdle: 'Inactifs',
  sectionOrphans: 'Orphelins',
  orphansNote: 'parent disparu, processus toujours actif',
  sectionOutside: 'Hors sessions',
  sectionProcs: 'Processus',
  names: { one: 'nom', many: 'noms', other: 'noms' },
  moreIdle: (n, mem) => `+ ${n} de plus · ${mem}`,
  empty: 'Aucun résultat pour ce filtre.',

  thisWindow: 'cette fenêtre',
  procs: { one: 'processus', many: 'processus', other: 'processus' },
  sessions: { one: 'session', many: 'sessions', other: 'sessions' },
  orphans: { one: 'orphelin', many: 'orphelins', other: 'orphelins' },
  threads: { one: 'thread', many: 'threads', other: 'threads' },
  inThisRepo: 'dans ce dépôt :',
  orphanOf: label => `orphelin ${label}`,
  outsideWhere: 'hors sessions',
  open: 'ouvrir ↗',
  showProcs: 'processus',
  hideProcs: 'réduire',
  kill: 'arrêter',
  killTitle: (name, pid) => `Arrêter ${name} #${pid} ?`,
  killNote: 'avec ses processus enfants',
  killYes: 'Oui, arrêter',
  killNo: 'Annuler',
  killed: (name, pid, where) => `${name} #${pid} arrêté (${where})`,
  killFailed: (name, pid, why) => `Impossible d'arrêter ${name} #${pid} : ${why}`,
  cannotKill: (name, pid) => `${name} #${pid} : ce processus ne peut pas être arrêté d'ici`,
  openFailed: why => `Impossible d'ouvrir la session : ${why}`,

  headLine: (sessions, cpu, mem, threads, ageS) => `${sessions} · ${cpu} CPU · ${mem} · ${threads} · il y a ${ageS} s`,
  footer: m => `les graphiques montrent le CPU sur ${m} min · /load band on|off|auto règle la ligne au-dessus de la saisie`,
  graphAlt: m => `CPU sur ${m} min`,
  bandLabel: 'charge',
  reportClaude: (sessions, cpu, mem, ageS) => `Claude : ${sessions} · ${cpu} CPU · ${mem} · mesuré il y a ${ageS} s`,
  memOf: (used, total) => `${used} sur ${total}`,
  reportOrphans: 'Orphelins — parent disparu, processus toujours actif',
  reportOutside: 'Hors sessions :',
}

const pt: Dict = {
  decimal: ',',
  mb: 'MB',
  gb: 'GB',
  untitled: '(sem título)',
  paneTitle: 'Carga por sessão',
  waiting: 'Aguardando a primeira amostra…',
  samplerStarting: 'O amostrador está iniciando; a primeira amostra chega em alguns segundos.',
  unsupported: 'O claude-load não é compatível com esta plataforma.',
  commandDescription: 'Carga por sessão: CPU e memória de cada sessão do Claude Code, órfãos e outros processos (claude-load)',
  bandUsage: '/load band on | off | auto — auto mostra a linha só com 50% de CPU ou 85% de memória, ou mais',
  bandSet: m => `Linha de carga acima do prompt: ${m === 'auto' ? 'só sob carga alta' : m === 'on' ? 'sempre' : 'desligada'}.`,
  samplerFailed: why => `claude-load: não foi possível iniciar o amostrador: ${why}`,
  samplerBlocked: 'O amostrador não inicia. Uma política pode estar bloqueando scripts do PowerShell (AllSigned, Constrained Language Mode).',

  filterAll: 'Todos',
  filterActive: 'Ativos',
  filterHeavy: 'Pesados',
  filterOrphans: 'Órfãos',
  filterSelf: 'Esta janela',
  groupLabel: 'Agrupar ',
  groupSessions: 'por sessão',
  groupRepos: 'por repositório',
  groupProcs: 'por processo',
  sortLabel: 'Ordenar ',
  sortCpu: 'por CPU',
  sortMem: 'por memória',
  triage: '✨ Resolver com o Claude',
  triageToast: 'O Claude está analisando a carga; a resposta aparecerá nesta sessão',

  sectionActive: 'Ativos',
  sectionSessions: 'Sessões',
  sectionIdle: 'Ociosos',
  sectionOrphans: 'Órfãos',
  orphansNote: 'processo pai encerrado, processo ainda em execução',
  sectionOutside: 'Fora das sessões',
  sectionProcs: 'Processos',
  names: { one: 'nome', other: 'nomes' },
  moreIdle: (n, mem) => `+ ${n} a mais · ${mem}`,
  empty: 'Nada corresponde a este filtro.',

  thisWindow: 'esta janela',
  procs: { one: 'processo', other: 'processos' },
  sessions: { one: 'sessão', other: 'sessões' },
  orphans: { one: 'órfão', other: 'órfãos' },
  threads: { one: 'thread', other: 'threads' },
  inThisRepo: 'neste repo:',
  orphanOf: label => `órfão ${label}`,
  outsideWhere: 'fora das sessões',
  open: 'abrir ↗',
  showProcs: 'processos',
  hideProcs: 'recolher',
  kill: 'encerrar',
  killTitle: (name, pid) => `Encerrar ${name} #${pid}?`,
  killNote: 'junto com seus processos filhos',
  killYes: 'Sim, encerrar',
  killNo: 'Cancelar',
  killed: (name, pid, where) => `${name} #${pid} encerrado (${where})`,
  killFailed: (name, pid, why) => `Não foi possível encerrar ${name} #${pid}: ${why}`,
  cannotKill: (name, pid) => `${name} #${pid}: este processo não pode ser encerrado daqui`,
  openFailed: why => `Não foi possível abrir a sessão: ${why}`,

  headLine: (sessions, cpu, mem, threads, ageS) => `${sessions} · ${cpu} CPU · ${mem} · ${threads} · há ${ageS} s`,
  footer: m => `os gráficos mostram a CPU em ${m} min · /load band on|off|auto controla a linha acima do prompt`,
  graphAlt: m => `CPU em ${m} min`,
  bandLabel: 'carga',
  reportClaude: (sessions, cpu, mem, ageS) => `Claude: ${sessions} · ${cpu} CPU · ${mem} · medido há ${ageS} s`,
  memOf: (used, total) => `${used} de ${total}`,
  reportOrphans: 'Órfãos — processo pai encerrado, processo ainda em execução',
  reportOutside: 'Fora das sessões:',
}

const zh: Dict = {
  decimal: '.',
  mb: 'MB',
  gb: 'GB',
  untitled: '（无标题）',
  paneTitle: '各会话负载',
  waiting: '正在等待首次采样…',
  samplerStarting: '采样器正在启动，几秒后将出现首次采样。',
  unsupported: 'claude-load 不支持此平台。',
  commandDescription: '各会话负载：每个 Claude Code 会话的 CPU 和内存、孤儿进程及其他进程 (claude-load)',
  bandUsage: '/load band on | off | auto — auto 仅在 CPU 达到 50% 或内存达到 85% 及以上时显示该行',
  bandSet: m => `输入框上方的负载行：${m === 'auto' ? '仅高负载时显示' : m === 'on' ? '始终显示' : '已关闭'}。`,
  samplerFailed: why => `claude-load：无法启动采样器：${why}`,
  samplerBlocked: '采样器无法启动。PowerShell 脚本可能被策略禁止（AllSigned、Constrained Language Mode）。',

  filterAll: '全部',
  filterActive: '活跃',
  filterHeavy: '高负载',
  filterOrphans: '孤儿进程',
  filterSelf: '当前窗口',
  groupLabel: '分组 ',
  groupSessions: '按会话',
  groupRepos: '按仓库',
  groupProcs: '按进程',
  sortLabel: '排序 ',
  sortCpu: '按 CPU',
  sortMem: '按内存',
  triage: '✨ 让 Claude 来整理',
  triageToast: 'Claude 正在整理负载，答复将显示在此会话中',

  sectionActive: '活跃',
  sectionSessions: '会话',
  sectionIdle: '空闲',
  sectionOrphans: '孤儿进程',
  orphansNote: '父进程已退出，进程仍在运行',
  sectionOutside: '会话之外',
  sectionProcs: '进程',
  names: { other: '个名称' },
  moreIdle: (n, mem) => `+ 另有 ${n} 个 · ${mem}`,
  empty: '没有符合此筛选条件的项目。',

  thisWindow: '当前窗口',
  procs: { other: '个进程' },
  sessions: { other: '个会话' },
  orphans: { other: '个孤儿进程' },
  threads: { other: '个线程' },
  inThisRepo: '本仓库中：',
  orphanOf: label => `孤儿进程 ${label}`,
  outsideWhere: '会话之外',
  open: '打开 ↗',
  showProcs: '进程',
  hideProcs: '收起',
  kill: '结束',
  killTitle: (name, pid) => `结束 ${name} #${pid}？`,
  killNote: '连同其子进程一起结束',
  killYes: '是，结束',
  killNo: '取消',
  killed: (name, pid, where) => `已结束 ${name} #${pid}（${where}）`,
  killFailed: (name, pid, why) => `无法结束 ${name} #${pid}：${why}`,
  cannotKill: (name, pid) => `${name} #${pid}：无法在此结束该进程`,
  openFailed: why => `无法打开会话：${why}`,

  headLine: (sessions, cpu, mem, threads, ageS) => `${sessions} · ${cpu} CPU · ${mem} · ${threads} · ${ageS} 秒前`,
  footer: m => `图表显示最近 ${m} 分钟的 CPU · /load band on|off|auto 控制输入框上方的负载行`,
  graphAlt: m => `最近 ${m} 分钟的 CPU`,
  bandLabel: '负载',
  reportClaude: (sessions, cpu, mem, ageS) => `Claude：${sessions} · ${cpu} CPU · ${mem} · ${ageS} 秒前采样`,
  memOf: (used, total) => `${used} / ${total}`,
  reportOrphans: '孤儿进程 — 父进程已退出，进程仍在运行',
  reportOutside: '会话之外：',
}

const ja: Dict = {
  decimal: '.',
  mb: 'MB',
  gb: 'GB',
  untitled: '（無題）',
  paneTitle: 'セッション別の負荷',
  waiting: '最初のサンプルを待っています…',
  samplerStarting: 'サンプラーを起動中です。最初のサンプルは数秒後に届きます。',
  unsupported: 'claude-load はこのプラットフォームに対応していません。',
  commandDescription: 'セッション別の負荷：各 Claude Code セッションの CPU とメモリ、孤立プロセス、その他のプロセス (claude-load)',
  bandUsage: '/load band on | off | auto — auto は CPU 50% 以上またはメモリ 85% 以上のときだけ表示します',
  bandSet: m => `入力欄の上の負荷行：${m === 'auto' ? '高負荷時のみ表示' : m === 'on' ? '常に表示' : 'オフ'}。`,
  samplerFailed: why => `claude-load：サンプラーを起動できませんでした：${why}`,
  samplerBlocked: 'サンプラーが起動しません。ポリシーで PowerShell スクリプトがブロックされている可能性があります（AllSigned、Constrained Language Mode）。',

  filterAll: 'すべて',
  filterActive: 'アクティブ',
  filterHeavy: '高負荷',
  filterOrphans: '孤立',
  filterSelf: 'このウィンドウ',
  groupLabel: 'グループ化 ',
  groupSessions: 'セッション別',
  groupRepos: 'リポジトリ別',
  groupProcs: 'プロセス別',
  sortLabel: '並べ替え ',
  sortCpu: 'CPU 順',
  sortMem: 'メモリ順',
  triage: '✨ Claude に整理してもらう',
  triageToast: 'Claude が負荷を整理しています。回答はこのセッションに表示されます',

  sectionActive: 'アクティブ',
  sectionSessions: 'セッション',
  sectionIdle: 'アイドル',
  sectionOrphans: '孤立プロセス',
  orphansNote: '親プロセスは終了、プロセスは実行中',
  sectionOutside: 'セッション外',
  sectionProcs: 'プロセス',
  names: { other: '種類' },
  moreIdle: (n, mem) => `他 ${n} 件 · ${mem}`,
  empty: 'このフィルターに一致する項目はありません。',

  thisWindow: 'このウィンドウ',
  procs: { other: 'プロセス' },
  sessions: { other: 'セッション' },
  orphans: { other: '孤立プロセス' },
  threads: { other: 'スレッド' },
  inThisRepo: 'このリポジトリ内：',
  orphanOf: label => `孤立プロセス ${label}`,
  outsideWhere: 'セッション外',
  open: '開く ↗',
  showProcs: 'プロセス',
  hideProcs: '折りたたむ',
  kill: '終了',
  killTitle: (name, pid) => `${name} #${pid} を終了しますか？`,
  killNote: '子プロセスも一緒に終了します',
  killYes: 'はい、終了',
  killNo: 'キャンセル',
  killed: (name, pid, where) => `${name} #${pid} を終了しました（${where}）`,
  killFailed: (name, pid, why) => `${name} #${pid} を終了できませんでした：${why}`,
  cannotKill: (name, pid) => `${name} #${pid}：このプロセスはここから終了できません`,
  openFailed: why => `セッションを開けませんでした：${why}`,

  headLine: (sessions, cpu, mem, threads, ageS) => `${sessions} · ${cpu} CPU · ${mem} · ${threads} · ${ageS} 秒前`,
  footer: m => `グラフは直近 ${m} 分の CPU を表示 · /load band on|off|auto で入力欄の上の行を切り替え`,
  graphAlt: m => `直近 ${m} 分の CPU`,
  bandLabel: '負荷',
  reportClaude: (sessions, cpu, mem, ageS) => `Claude：${sessions} · ${cpu} CPU · ${mem} · ${ageS} 秒前にサンプリング`,
  memOf: (used, total) => `${used} / ${total}`,
  reportOrphans: '孤立プロセス — 親プロセスは終了、プロセスは実行中',
  reportOutside: 'セッション外：',
}

export const STRINGS: Record<Lang, Dict> = { en, ru, de, es, fr, pt, zh, ja }

const PLURAL_FALLBACK: Record<Lang, (n: number) => keyof Forms> = {
  en: n => (n === 1 ? 'one' : 'other'),
  de: n => (n === 1 ? 'one' : 'other'),
  es: n => (n === 1 ? 'one' : 'other'),
  pt: n => (n === 1 ? 'one' : 'other'),
  fr: n => (n === 0 || n === 1 ? 'one' : 'other'),
  zh: () => 'other',
  ja: () => 'other',
  ru: n => {
    const d = n % 10
    const h = n % 100
    if (d === 1 && h !== 11) return 'one'
    if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'few'
    return 'many'
  },
}

/** "15 sessions", "2 сессии": the number and the word in the plural form the language asks for. */
export function plural(lang: Lang, n: number, forms: Forms): string {
  let cat: keyof Forms
  try {
    cat = new Intl.PluralRules(lang).select(n) as keyof Forms
  } catch {
    cat = PLURAL_FALLBACK[lang](n)
  }
  return `${n} ${forms[cat] ?? forms.other}`
}

export function fmtMem(lang: Lang, mb: number): string {
  const d = STRINGS[lang]
  return mb >= 1024 ? `${(mb / 1024).toFixed(1).replace('.', d.decimal)} ${d.gb}` : `${mb} ${d.mb}`
}

/** Maps a language name or locale ("russian", "ru-RU", "Deutsch", "zh_CN.UTF-8") to a supported language. */
export function matchLang(v: unknown): Lang | null {
  if (typeof v !== 'string') return null
  const s = v.trim().toLowerCase()
  if (!s) return null
  const table: Array<[Lang, RegExp]> = [
    ['ru', /^(ru|russian|рус)/],
    ['de', /^(de|german|deutsch)/],
    ['es', /^(es|spanish|español|espanol|castellano)/],
    ['fr', /^(fr|french|français|francais)/],
    ['pt', /^(pt|portuguese|português|portugues)/],
    ['zh', /^(zh|chinese|中文|汉语|漢語)/],
    ['ja', /^(ja|japanese|日本語)/],
    ['en', /^(en|english)/],
  ]
  for (const [lang, re] of table) if (re.test(s)) return lang
  return null
}

/** A label followed by its value: a space, except after a full-width colon (zh, ja). */
export function lead(label: string): string {
  return label.endsWith('：') ? label : `${label} `
}

/** The first supported language among the candidates, in order: the option, settings, env, Intl. */
export function pickLang(option: unknown, candidates: unknown[]): Lang {
  if (typeof option === 'string' && (LANGS as readonly string[]).includes(option)) return option as Lang
  for (const c of candidates) {
    const l = matchLang(c)
    if (l) return l
  }
  try {
    const fromIntl = matchLang(Intl.DateTimeFormat().resolvedOptions().locale)
    if (fromIntl) return fromIntl
  } catch {
    // A runtime without Intl: English.
  }
  return 'en'
}
