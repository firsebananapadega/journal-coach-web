// UI string translations — English + Mexican Spanish
// Mexican Spanish: tú form, no vosotros, warm/natural tone

import { getLocale, type Locale } from './language';

const translations: Record<string, Record<Locale, string>> = {
  // ─── Navigation ───
  'nav.home': { en: 'Home', es: 'Inicio' },
  'nav.tasks': { en: 'Tasks', es: 'Tareas' },
  'nav.journal': { en: 'Journal', es: 'Diario' },
  'nav.plans': { en: 'Plans', es: 'Planes' },
  'nav.settings': { en: 'Settings', es: 'Ajustes' },

  // ─── Common ───
  'common.loading': { en: 'Loading...', es: 'Cargando...' },
  'common.done': { en: 'Done', es: 'Listo' },
  'common.reorder': { en: 'Reorder', es: 'Reordenar' },
  'common.deleteStore': { en: 'Delete this store', es: 'Eliminar esta tienda' },
  'common.deleteStoreConfirm': {
    en: 'Delete the entire {store} store and all its items? This cannot be undone.',
    es: '¿Eliminar toda la tienda {store} y sus artículos? No se puede deshacer.',
  },
  'common.back': { en: 'Back', es: 'Atrás' },
  'common.cancel': { en: 'Cancel', es: 'Cancelar' },
  'common.delete': { en: 'Delete', es: 'Eliminar' },
  'common.remove': { en: 'Remove', es: 'Quitar' },
  'common.add': { en: 'Add', es: 'Agregar' },
  'common.save': { en: 'Save', es: 'Guardar' },
  'common.saving': { en: 'Saving...', es: 'Guardando...' },
  'common.edit': { en: 'Edit', es: 'Editar' },
  'common.change': { en: 'Change', es: 'Cambiar' },
  'common.next': { en: 'Next', es: 'Siguiente' },
  'common.previous': { en: 'Previous', es: 'Anterior' },
  'common.continue': { en: 'Continue', es: 'Continuar' },
  'common.skip': { en: 'Skip', es: 'Omitir' },
  'common.yes': { en: 'Yes', es: 'Sí' },
  'common.or': { en: 'or', es: 'o' },
  'common.clear': { en: 'Clear', es: 'Limpiar' },
  'common.retry': { en: 'Retry', es: 'Reintentar' },
  'common.send': { en: 'Send', es: 'Enviar' },
  'common.morning': { en: 'Morning', es: 'Mañana' },
  'common.afternoon': { en: 'Afternoon', es: 'Tarde' },
  'common.evening': { en: 'Evening', es: 'Noche' },
  'common.anytime': { en: 'Anytime', es: 'Cualquier hora' },
  'common.noContent': { en: 'No content', es: 'Sin contenido' },
  'common.words': { en: 'words', es: 'palabras' },

  // ─── Home ───
  'home.goodMorning': { en: 'Good morning{name}.', es: 'Buenos días{name}.' },
  'home.goodAfternoon': { en: 'Good afternoon{name}.', es: 'Buenas tardes{name}.' },
  'home.goodEvening': { en: 'Good evening{name}.', es: 'Buenas noches{name}.' },
  'home.freeThought': { en: 'Free Thought', es: 'Pensamiento libre' },
  'home.priorities': { en: 'Priorities', es: 'Prioridades' },
  'home.dragHint': { en: 'Drag bubbles to rearrange', es: 'Arrastra las burbujas para reorganizar' },

  // ─── Settings ───
  'settings.title': { en: 'Settings', es: 'Ajustes' },
  'settings.homeScreen': { en: 'Home Screen', es: 'Pantalla de inicio' },
  'settings.guidedJournal': { en: 'Guided Journal', es: 'Diario guiado' },
  'settings.yourGuide': { en: 'Your Guide', es: 'Tu guía' },
  'settings.guideChanged': { en: 'Your guide is now {name}', es: 'Tu guía ahora es {name}' },
  'common.error': { en: 'Something went wrong', es: 'Algo salió mal' },
  'settings.templates': { en: 'Templates', es: 'Plantillas' },
  'settings.manageTemplates': { en: 'Manage Templates', es: 'Administrar plantillas' },
  'settings.activeOnHome': { en: '{count} active on home screen', es: '{count} activas en la pantalla de inicio' },
  'settings.appearance': { en: 'Appearance', es: 'Apariencia' },
  'settings.theme': { en: 'Theme', es: 'Tema' },
  'settings.guideTheme': { en: 'Match theme to my guide', es: 'Tema según mi guía' },
  'settings.guideThemeDesc': { en: 'App accent color follows your selected guide.', es: 'El color principal sigue al guía elegido.' },
  'settings.dark': { en: 'Dark', es: 'Oscuro' },
  'settings.light': { en: 'Light', es: 'Claro' },
  'settings.language': { en: 'Language', es: 'Idioma' },
  'settings.privacy': { en: 'Privacy', es: 'Privacidad' },
  'settings.privacyMessage': {
    en: 'Your journal data is stored securely in Supabase with row-level security. Only you can access your entries.',
    es: 'Tus datos del diario se guardan de forma segura en Supabase con seguridad a nivel de fila. Solo tú puedes ver tus entradas.',
  },
  'settings.intentions': { en: 'Intentions', es: 'Intenciones' },
  'settings.noIntentions': { en: 'No intentions set yet.', es: 'Aún no tienes intenciones.' },
  'settings.addIntentionPlaceholder': { en: 'Add an intention...', es: 'Agrega una intención...' },
  'settings.browseIntentions': { en: 'Browse Intentions', es: 'Explorar intenciones' },
  'settings.habits': { en: 'Habits', es: 'Hábitos' },
  'settings.noHabits': { en: 'No habits yet.', es: 'Aún no tienes hábitos.' },
  'settings.manageHabits': { en: 'Manage Habits', es: 'Administrar hábitos' },
  'settings.signOut': { en: 'Sign out', es: 'Cerrar sesión' },
  'settings.signingOut': { en: 'Signing out...', es: 'Cerrando sesión...' },
  'settings.confirmSignOut': { en: 'Are you sure you want to sign out?', es: '¿Estás seguro de que quieres cerrar sesión?' },
  'settings.confirmDeleteHabit': { en: 'Delete "{name}"?', es: '¿Eliminar "{name}"?' },

  // ─── Guided Session ───
  'guided.sessionWith': { en: 'Session with {name}', es: 'Sesión con {name}' },
  'guided.end': { en: 'End', es: 'Terminar' },
  'guided.reflecting': { en: 'Reflecting...', es: 'Reflexionando...' },
  'guided.connectionError': { en: "Couldn't reach your guide. Check your connection.", es: 'No se pudo conectar con tu guía. Revisa tu conexión.' },
  'guided.deepSession': { en: 'You went somewhere real today. That takes courage. Take a moment before you move on.', es: 'Hoy fuiste a un lugar real. Eso requiere valentía. Tómate un momento antes de seguir.' },
  'guided.normalSession': { en: 'Thanks for sharing. You covered {count} topic{plural}. How are you feeling now?', es: 'Gracias por compartir. Cubriste {count} tema{plural}. ¿Cómo te sientes ahora?' },
  'guided.takeABreath': { en: 'Take a breath', es: 'Respira un momento' },
  'guided.breathDescription': { en: "Processing heavy stuff can leave you drained. Try a slow exhale — breathe in through your nose, then let out a long sigh. Do that twice.", es: 'Procesar cosas difíciles puede dejarte agotado. Intenta exhalar lentamente: inhala por la nariz y suelta un suspiro largo. Hazlo dos veces.' },
  'guided.saveSession': { en: 'Save Session', es: 'Guardar sesión' },
  'guided.holdIntention': { en: 'Hold "{goal}" as an intention?', es: '¿Quieres guardar "{goal}" como intención?' },
  'guided.notNow': { en: 'Not now', es: 'Ahora no' },
  'guided.typePlaceholder': { en: 'Type or tap mic to speak...', es: 'Escribe o toca el micrófono para hablar...' },
  'guided.listeningPlaceholder': { en: 'Listening...', es: 'Escuchando...' },
  'guided.leaveConfirm': { en: 'Leave session? Your progress is saved.', es: '¿Salir de la sesión? Tu progreso está guardado.' },
  // Debug timeline (shown after 10s if guide hasn't responded)
  'guided.debugCopy': { en: 'Copy', es: 'Copiar' },
  'guided.debugCopied': { en: 'Copied', es: 'Copiado' },
  'guided.debugHeader': { en: 'debug — tap copy and share with support', es: 'depuración — copia y comparte con soporte' },
  // Rate limit (both engines exhausted)
  'guided.rateLimitTitle': { en: 'Daily limit reached', es: 'Límite diario alcanzado' },
  'guided.rateLimitResetNote': { en: 'Resets at midnight Pacific. Your draft is saved.', es: 'Se reinicia a la medianoche del Pacífico. Tu borrador está guardado.' },
  'guided.rateLimitGoHome': { en: 'Go home', es: 'Ir al inicio' },

  // ─── Journal ───
  'journal.title': { en: 'Journal', es: 'Diario' },
  'journal.journal': { en: 'Journal', es: 'Diario' },
  'journal.ideas': { en: 'Ideas', es: 'Ideas' },
  'journal.gratitude': { en: 'Gratitude', es: 'Gratitud' },
  'journal.all': { en: 'All', es: 'Todas' },
  'journal.favorites': { en: 'Favorites', es: 'Favoritas' },
  'journal.loadingEntries': { en: 'Loading entries...', es: 'Cargando entradas...' },
  'journal.noFavorites': { en: 'No favorites yet.', es: 'Aún no tienes favoritas.' },
  'journal.noEntries': { en: 'No entries yet. Start journaling!', es: '¡Aún no hay entradas. Comienza a escribir!' },
  'journal.noIdeas': { en: 'No ideas yet. Capture your first one!', es: '¡Aún no tienes ideas. Captura la primera!' },
  'journal.noGratitude': { en: 'No gratitude items yet. What are you thankful for?', es: '¿Aún no tienes agradecimientos? ¿Por qué estás agradecido hoy?' },
  'journal.addIdea': { en: 'Add an idea...', es: 'Agrega una idea...' },
  'journal.addGratitude': { en: 'Add a gratitude...', es: 'Agrega un agradecimiento...' },
  'journal.typeVoice': { en: '🎙️ Voice', es: '🎙️ Voz' },
  'journal.typeGuided': { en: '💬 Guided', es: '💬 Guiada' },
  'journal.typeTemplate': { en: '📋 Template', es: '📋 Plantilla' },
  'journal.typeFreeform': { en: '✏️ Free Write', es: '✏️ Escritura libre' },
  'journal.typePulse': { en: '✨ Pulse', es: '✨ Pulso' },
  // Relative dates
  'journal.justNow': { en: 'just now', es: 'ahora' },
  'journal.mAgo': { en: '{n}m ago', es: 'hace {n}m' },
  'journal.hAgo': { en: '{n}h ago', es: 'hace {n}h' },
  'journal.yesterday': { en: 'Yesterday', es: 'Ayer' },
  'journal.today': { en: 'Today', es: 'Hoy' },
  'journal.dAgo': { en: '{n}d ago', es: 'hace {n}d' },
  'journal.draft': { en: 'Draft', es: 'Borrador' },
  'journal.tapToResume': { en: 'Tap to resume', es: 'Toca para continuar' },

  // ─── Categories ───
  'category.groceries': { en: 'Groceries', es: 'Despensa' },
  'category.medications': { en: 'Medications', es: 'Medicamentos' },
  'category.errands': { en: 'Errands', es: 'Recados' },
  'category.work': { en: 'Work', es: 'Trabajo' },
  'category.home': { en: 'Home', es: 'Hogar' },
  'category.bills': { en: 'Bills', es: 'Cuentas' },
  'category.other': { en: 'Other', es: 'Otros' },

  // ─── Capture preview sheet ───
  'preview.title': { en: 'Review and save', es: 'Revisar y guardar' },
  'preview.confirm': { en: 'Save these', es: 'Guardar' },
  'preview.cancel': { en: 'Cancel', es: 'Cancelar' },
  'preview.markDone': { en: 'Mark as done', es: 'Marcar como hecho' },
  'preview.matched': { en: 'matched', es: 'coincide con' },
  'preview.noMatch': { en: 'no match — will be ignored', es: 'sin coincidencia — se ignorará' },
  'preview.willSkip': { en: 'will be removed', es: 'se eliminará' },
  'preview.tasks': { en: 'Tasks', es: 'Tareas' },
  'preview.plans': { en: 'Plans', es: 'Eventos' },
  'preview.intentions': { en: 'Intentions', es: 'Intenciones' },
  'preview.habits': { en: 'Habits', es: 'Hábitos' },
  'preview.ideas': { en: 'Ideas', es: 'Ideas' },
  'preview.gratitude': { en: 'Gratitude', es: 'Gratitud' },
  'preview.journal': { en: 'Journal entry', es: 'Entrada del diario' },
  'preview.empty': { en: 'Nothing detected — write a bit more.', es: 'Nada detectado — escribe un poco más.' },
  'preview.saving': { en: 'Saving...', es: 'Guardando...' },
  'preview.addItemToStore': {
    en: 'Add to {store}',
    es: 'Agregar a {store}',
  },
  'preview.fallbackBanner': {
    en: "Couldn't fully parse your capture — here's our best guess.",
    es: 'No pudimos interpretar por completo tu captura — esta es nuestra mejor suposición.',
  },
  'preview.fallbackHint': {
    en: 'Review and edit below before saving, or tap Retry to run the classifier again.',
    es: 'Revisa y edita abajo antes de guardar, o toca Reintentar para volver a clasificar.',
  },
  'preview.retryClassify': {
    en: 'Retry classification',
    es: 'Reintentar clasificación',
  },
  'preview.routingSummary': {
    en: 'Where it\u2019ll go',
    es: 'A dónde irá',
  },
  'preview.saveTimeout': {
    en: 'Save took too long — try again.',
    es: 'Guardar tardó demasiado — intenta de nuevo.',
  },
  'preview.saveFailed': {
    en: 'Couldn\u2019t save. Try again.',
    es: 'No se pudo guardar. Intenta de nuevo.',
  },

  // ─── Voice check-off ───
  'checkoff.marked': { en: 'Marked done: {item}', es: 'Marcado: {item}' },
  'checkoff.removed': { en: 'Removed: {item}', es: 'Eliminado: {item}' },

  // ─── Two-wall navigation ───
  'wall.tasks': { en: 'Tasks', es: 'Tareas' },
  'wall.journal': { en: 'Journal', es: 'Diario' },
  'wall.flipTo': { en: '{wall}', es: '{wall}' },
  'tab.today': { en: 'Today', es: 'Hoy' },
  'tab.plans': { en: 'Plans', es: 'Eventos' },
  'tab.lists': { en: 'Lists', es: 'Listas' },
  'tab.upcoming': { en: 'Upcoming', es: 'Próximo' },
  'tab.intentions': { en: 'Intentions', es: 'Intenciones' },
  'tab.presence': { en: 'Presence', es: 'Presencia' },
  'tab.guided': { en: 'Guided', es: 'Guiada' },
  'tab.groceries': { en: 'Groceries', es: 'Despensa' },
  'tab.pulse': { en: 'Pulse', es: 'Pulso' },
  'tab.history': { en: 'History', es: 'Historial' },
  'tab.patterns': { en: 'Patterns', es: 'Patrones' },
  'tab.capture': { en: 'Capture', es: 'Capturar' },
  'tab.guide': { en: 'Guide', es: 'Guía' },
  'tab.journal': { en: 'Journal', es: 'Diario' },
  'tab.notebooks': { en: 'Notebooks', es: 'Cuadernos' },

  // ─── Voice-mic FAB / inline capture button ───
  'capture.mic.aria': {
    en: 'Voice capture',
    es: 'Captura por voz',
  },

  // ─── Notebooks tab ───
  'notebooks.title': { en: 'Notebooks', es: 'Cuadernos' },
  'notebooks.subtitle': {
    en: 'Your collections. Tap one to read or add to it.',
    es: 'Tus colecciones. Toca una para leer o escribir.',
  },
  'notebooks.entry': { en: 'entry', es: 'entrada' },
  'notebooks.entries': { en: 'entries', es: 'entradas' },
  'notebooks.systemTag': { en: 'System', es: 'Sistema' },
  'notebooks.addNew': { en: 'New notebook', es: 'Nuevo cuaderno' },
  'notebooks.namePlaceholder': { en: 'Notebook name…', es: 'Nombre del cuaderno…' },

  // ─── Entry card ───
  'entry.raw': { en: 'Raw', es: 'Crudo' },
  'entry.structured': { en: 'Structured', es: 'Estructurado' },
  'entry.editingStructured': { en: 'Editing structured', es: 'Editando estructurado' },
  'entry.editingStructuredHint': {
    en: 'Raw transcript stays untouched — your edits live here.',
    es: 'El texto original se mantiene sin cambios — tus ediciones viven aquí.',
  },
  'entry.repolishFromRaw': { en: '↻ Re-polish from raw', es: '↻ Volver a pulir desde el original' },
  'entry.repolishing': { en: 'Polishing…', es: 'Puliendo…' },
  'entry.repolishConfirm': {
    en: 'This will replace your edits with a fresh polish from your original transcript. Continue?',
    es: 'Esto reemplazará tus ediciones con un nuevo pulido del texto original. ¿Continuar?',
  },
  'entry.structuring': { en: 'Structuring…', es: 'Estructurando…' },
  'entry.empty': { en: 'No content.', es: 'Sin contenido.' },

  // ─── Day headers / feed ───
  'journal.daysAgo': { en: 'days ago', es: 'días' },

  // ─── Preview sheet ───
  'preview.notebookLabel': { en: 'Notebook', es: 'Cuaderno' },

  // ─── Push reminders ───
  'push.title': { en: 'Want reminders on your phone?', es: '¿Quieres recordatorios en tu teléfono?' },
  'push.body': {
    en: 'When you say "remind me tomorrow at 10," we can buzz you at 10. You can turn this off anytime in Settings.',
    es: 'Cuando digas "recuérdame mañana a las 10", te avisamos a las 10. Puedes desactivar esto en Ajustes.',
  },
  'push.enable': { en: 'Turn on reminders', es: 'Activar recordatorios' },
  'push.later': { en: 'Not now', es: 'Ahora no' },
  'push.iosHint': {
    en: 'Add me to your home screen first — iOS only sends push notifications from installed apps.',
    es: 'Añádeme primero a tu pantalla de inicio — iOS solo envía notificaciones desde apps instaladas.',
  },
  'push.unsupported': { en: 'Push notifications aren\'t supported on this browser.', es: 'Este navegador no admite notificaciones push.' },
  'push.denied': { en: 'Notifications are blocked. You can re-enable from your browser settings.', es: 'Las notificaciones están bloqueadas. Puedes reactivarlas desde los ajustes del navegador.' },
  'push.installGateTitle': {
    en: 'Add JournalCoach to your home screen',
    es: 'Añade JournalCoach a tu pantalla de inicio',
  },
  'push.installGateBody': {
    en: 'iOS only sends reminder notifications to installed apps. Tap the Share button in Safari, then "Add to Home Screen." Open the app from there and we\'ll re-ask.',
    es: 'iOS solo envía notificaciones a apps instaladas. Toca Compartir en Safari y "Añadir a pantalla de inicio". Abre la app desde ahí y te lo preguntamos de nuevo.',
  },
  'push.installGateCta': { en: 'Got it', es: 'Entendido' },
  'push.retry': { en: 'Couldn’t set up — try again soon.', es: 'No se pudo configurar — intenta de nuevo.' },
  'push.blockedTitle': { en: 'Reminders are blocked', es: 'Los recordatorios están bloqueados' },
  'push.blockedBody': {
    en: 'iOS has notifications turned off for JournalCoach. Open iOS Settings → JournalCoach → Notifications and turn Allow Notifications on, then come back and capture a reminder.',
    es: 'iOS tiene las notificaciones desactivadas para JournalCoach. Abre Ajustes de iOS → JournalCoach → Notificaciones y activa Permitir notificaciones; luego vuelve y captura un recordatorio.',
  },
  'push.blockedCta': { en: 'Got it', es: 'Entendido' },
  'push.unsupportedTitle': { en: 'This browser can’t do push', es: 'Este navegador no admite push' },
  'push.unsupportedBody': {
    en: 'Reminders need iOS 16.4+ (installed PWA) or modern Chrome / Edge / Safari. Try re-opening from your home-screen icon, or update iOS.',
    es: 'Los recordatorios requieren iOS 16.4+ (PWA instalada) o Chrome/Edge/Safari modernos. Intenta reabrir desde el ícono de la pantalla de inicio o actualiza iOS.',
  },
  'push.retryTitle': { en: 'Finish setting up reminders', es: 'Termina de configurar los recordatorios' },
  'push.retryBody': {
    en: 'Permission is granted but your device hasn’t finished registering. Tap below to sync — should take a second.',
    es: 'El permiso está concedido pero tu dispositivo no terminó de registrarse. Toca abajo para sincronizar — tarda un segundo.',
  },
  'push.retryCta': { en: 'Finish setup', es: 'Terminar configuración' },
  'push.resyncTitle': { en: 'Re-sync reminders', es: 'Volver a sincronizar recordatorios' },
  'push.resyncBody': {
    en: 'Push is active on this device but the server hasn’t seen it yet. Tap to sync — your next reminder should land.',
    es: 'Push está activo en este dispositivo pero el servidor aún no lo ha visto. Toca para sincronizar — tu próximo recordatorio debería llegar.',
  },
  'push.resyncCta': { en: 'Sync now', es: 'Sincronizar ahora' },

  // ─── Journal writing surface (/journal) ───
  'journalWrite.placeholder': {
    en: 'Start writing, or tap the mic…',
    es: 'Empieza a escribir, o toca el mic…',
  },
  'journalWrite.micStart': { en: 'Tap to speak', es: 'Toca para hablar' },
  'journalWrite.micStop': { en: 'Stop recording', es: 'Detener grabación' },
  'journalWrite.save': { en: 'Save entry', es: 'Guardar entrada' },

  // ─── Ask Jane (/ask) ───
  'ask.title': { en: 'Ask Jane', es: 'Pregúntale a Jane' },
  'ask.placeholder': {
    en: 'Ask anything — quick answers, no persona.',
    es: 'Pregunta lo que quieras — respuestas rápidas, sin personaje.',
  },
  'ask.prompt': { en: 'Message Jane…', es: 'Escríbele a Jane…' },

  // ─── Pulse-tab bubbles ───
  'home.guidedSession': { en: 'Guided session', es: 'Sesión guiada' },
  'home.askJane': { en: 'Ask Jane', es: 'Pregúntale a Jane' },
  'view.list': { en: 'List', es: 'Lista' },
  'view.matrix': { en: 'Matrix', es: 'Matriz' },
  'view.week': { en: 'Week', es: 'Semana' },
  'view.month': { en: 'Month', es: 'Mes' },

  // ─── Eisenhower matrix quadrants ───
  'matrix.q1.title': { en: 'Urgent + Important', es: 'Urgente + Importante' },
  'matrix.q1.subtitle': { en: 'Do', es: 'Hacer' },
  'matrix.q2.title': { en: 'Important, not urgent', es: 'Importante, no urgente' },
  'matrix.q2.subtitle': { en: 'Schedule', es: 'Programar' },
  'matrix.q3.title': { en: 'Urgent, not important', es: 'Urgente, no importante' },
  'matrix.q3.subtitle': { en: 'Delegate', es: 'Delegar' },
  'matrix.q4.title': { en: 'Drop', es: 'Eliminar' },
  'matrix.q4.subtitle': { en: 'Neither urgent nor important', es: 'Ni urgente ni importante' },
  'matrix.unsorted': { en: 'Unsorted', es: 'Sin clasificar' },
  'matrix.unsortedHint': {
    en: 'Tap a task to set urgency and importance.',
    es: 'Toca una tarea para asignar urgencia e importancia.',
  },
  'matrix.urgent': { en: 'Urgent', es: 'Urgente' },
  'matrix.important': { en: 'Important', es: 'Importante' },
  'matrix.tooMany': {
    en: 'Heavy quadrant — consider trimming.',
    es: 'Cuadrante cargado — considera reducirlo.',
  },
  'matrix.empty': {
    en: "Today's list is empty. Capture a task to get started.",
    es: 'La lista de hoy está vacía. Captura una tarea para empezar.',
  },

  // ─── Lists / Inbox / Upcoming (stubs in Phase 1) ───
  'lists.comingSoon': {
    en: 'Project lists are coming soon. Voice captures will route here when you mention a project name.',
    es: 'Las listas de proyectos llegarán pronto. Las capturas por voz se dirigirán aquí cuando menciones un proyecto.',
  },
  'upcoming.comingSoon': {
    en: 'Your weekly + monthly calendar is coming soon. Add events with a future date and they will appear here.',
    es: 'Tu calendario semanal y mensual llegará pronto. Agrega eventos con una fecha futura y aparecerán aquí.',
  },
  'inbox.empty': { en: 'Nothing to triage. ✨', es: 'Nada por triar. ✨' },
  'inbox.label': { en: 'Inbox', es: 'Bandeja' },
  // Voice / capture page
  // ─── Body & Mind daily check-in ───
  'checkin.title': { en: 'Body & Mind', es: 'Cuerpo y mente' },
  'checkin.body': { en: 'Body', es: 'Cuerpo' },
  'checkin.mind': { en: 'Mind', es: 'Mente' },
  'checkin.saved': { en: 'Saved', es: 'Guardado' },
  'checkin.savedAgo': { en: 'Saved {n}m ago', es: 'Guardado hace {n}m' },
  'checkin.body.heavy': { en: 'Heavy', es: 'Pesado' },
  'checkin.body.tired': { en: 'Tired', es: 'Cansado' },
  'checkin.body.steady': { en: 'Steady', es: 'Estable' },
  'checkin.body.strong': { en: 'Strong', es: 'Fuerte' },
  'checkin.body.vibrant': { en: 'Vibrant', es: 'Encendido' },
  // Pulse-step prompts shown as the question above each emoji row
  'pulse.bodyPrompt': { en: 'How does your body feel?', es: '¿Cómo se siente tu cuerpo?' },
  'pulse.mindPrompt': { en: 'How is your mind?', es: '¿Cómo está tu mente?' },
  'pulse.skip': { en: 'Skip', es: 'Saltar' },
  'checkin.mind.foggy': { en: 'Foggy', es: 'Confuso' },
  'checkin.mind.hazy': { en: 'Hazy', es: 'Disperso' },
  'checkin.mind.steady': { en: 'Steady', es: 'Presente' },
  'checkin.mind.clear': { en: 'Clear', es: 'Claro' },
  'checkin.mind.sharp': { en: 'Sharp', es: 'Agudo' },

  'voice.capturePlaceholder': {
    en: 'Talk freely — tasks, groceries, reminders, ideas…',
    es: 'Habla libremente — tareas, despensa, recordatorios, ideas…',
  },
  'voice.capture': { en: 'Capture', es: 'Capturar' },
  'groceries.placeholder': { en: 'Add a grocery item…', es: 'Agregar artículo…' },
  'groceries.empty': {
    en: 'Your grocery list is empty. Add an item below or tap the mic to speak.',
    es: 'Tu lista de compras está vacía. Agrega un artículo abajo o toca el micrófono para hablar.',
  },
  'groceries.addToStore': {
    en: 'Add to {store}',
    es: 'Agregar a {store}',
  },
  'groceries.shareAria': { en: 'Share grocery list', es: 'Compartir lista de compras' },
  'groceries.joinedTitle': { en: 'You joined a shared list', es: 'Te uniste a una lista compartida' },
  'groceries.joinedBody': {
    en: 'Move your existing items into the shared list?',
    es: '¿Mover tus artículos existentes a la lista compartida?',
  },
  'groceries.joinedYes': { en: 'Move them', es: 'Moverlos' },
  'groceries.joinedNo': { en: 'No, keep them separate', es: 'No, mantenlos aparte' },

  // ─── Share sheet (grocery sharing)
  'share.title': { en: 'Share grocery list', es: 'Compartir lista de compras' },
  'share.subtitle': {
    en: 'Anyone with the link can view and edit this list.',
    es: 'Cualquiera con el enlace puede ver y editar esta lista.',
  },
  'share.generate': { en: 'Create share link', es: 'Crear enlace para compartir' },
  'share.generateFailed': {
    en: "Couldn't create the link. Try again.",
    es: 'No se pudo crear el enlace. Intenta de nuevo.',
  },
  'share.copy': { en: 'Copy link', es: 'Copiar enlace' },
  'share.copied': { en: 'Copied ✓', es: 'Copiado ✓' },
  'share.copyFailed': { en: "Couldn't copy.", es: 'No se pudo copiar.' },
  'share.whatsapp': { en: 'WhatsApp', es: 'WhatsApp' },
  'share.sms': { en: 'Messages', es: 'Mensajes' },
  'share.more': { en: 'More…', es: 'Más…' },
  'share.nativeTitle': { en: 'Grocery list', es: 'Lista de compras' },
  'share.message': {
    en: "I'm sharing my grocery list with you: {url}",
    es: 'Te estoy compartiendo mi lista de compras: {url}',
  },
  'share.linkDisclaimer': {
    en: 'Link works for 7 days, up to 10 joins. Revoke any time.',
    es: 'El enlace funciona por 7 días, hasta 10 personas. Puedes revocarlo en cualquier momento.',
  },
  'share.membersHeading': { en: 'In this list', es: 'En esta lista' },
  'share.unnamedMember': { en: 'Member', es: 'Miembro' },
  'share.ownerBadge': { en: 'Owner', es: 'Dueño' },
  'share.youBadge': { en: '(you)', es: '(tú)' },
  'share.activeInvitesHeading': { en: 'Active links', es: 'Enlaces activos' },
  'share.invitesUsage': {
    en: '{uses} / {max} joins',
    es: '{uses} / {max} entradas',
  },
  'share.revoke': { en: 'Revoke', es: 'Revocar' },
  'share.leave': { en: 'Leave shared list', es: 'Salir de la lista compartida' },
  'share.acceptInvalidTitle': { en: 'Link expired', es: 'Enlace caducado' },
  'share.acceptInvalidBody': {
    en: 'This share link is no longer valid. Ask the person who sent it for a fresh link.',
    es: 'Este enlace ya no es válido. Pídele a quien te lo envió un enlace nuevo.',
  },
  'share.acceptInvalidCta': { en: 'Go to my groceries', es: 'Ir a mi lista' },

  // ─── Share sheet v2: email invite + polished UI
  'share.emailHeading': { en: 'Send to email', es: 'Enviar por correo' },
  'share.emailPlaceholder': { en: 'their@email.com', es: 'su@correo.com' },
  'share.emailSend': { en: 'Send', es: 'Enviar' },
  'share.emailSending': { en: 'Sending…', es: 'Enviando…' },
  'share.emailSent': { en: 'Sent ✓ to {email}', es: 'Enviado ✓ a {email}' },
  'share.emailFailed': {
    en: "Couldn't send. Try copying the link instead.",
    es: 'No se pudo enviar. Copia el enlace en su lugar.',
  },
  'share.emailDescription': {
    en: 'They tap once and join — no password to type.',
    es: 'Toca una vez y se une, sin escribir contraseña.',
  },
  'share.linkHeading': { en: 'Or share a link', es: 'O comparte un enlace' },
  'share.linkExpiry': { en: 'Link works for 7 days', es: 'El enlace funciona por 7 días' },
  'share.resetLink': { en: 'Reset link', es: 'Restablecer enlace' },
  'share.confirmReset': {
    en: 'Reset the link? The current one will stop working.',
    es: '¿Restablecer el enlace? El actual dejará de funcionar.',
  },
  'share.acceptHomeScreenBanner': {
    en: 'All set. Open the app from your home screen to keep using your shared list.',
    es: 'Listo. Abre la app desde tu pantalla de inicio para seguir usando tu lista compartida.',
  },
  'share.acceptSuccessTitle': { en: 'You\'re in.', es: 'Ya entraste.' },
  'share.acceptOpenList': { en: 'Open my groceries', es: 'Abrir mi lista' },

  // ─── Share sheet v3: in-app pending invites + recent-contacts quick pick
  'share.shareWithHeading': { en: 'Share with…', es: 'Compartir con…' },
  'share.searchPlaceholder': {
    en: 'Name or email',
    es: 'Nombre o correo',
  },
  'share.recentContactsHeading': { en: 'Recent contacts', es: 'Contactos recientes' },
  'share.noRecentContacts': {
    en: 'No one yet — type an email to invite someone.',
    es: 'Aún no hay nadie — escribe un correo para invitar.',
  },
  'share.successInApp': {
    en: '{name} will see it in their grocery tab. ✓',
    es: '{name} lo verá en su pestaña de compras. ✓',
  },
  'share.successInAppFallback': {
    en: 'They\'ll see it in their grocery tab. ✓',
    es: 'Lo verán en su pestaña de compras. ✓',
  },
  'share.successEmail': {
    en: 'Email sent ✓ — they\'ll join when they tap the link.',
    es: 'Correo enviado ✓ — se unirán al tocar el enlace.',
  },
  'share.successAlreadyMember': {
    en: '{name} is already in this list. 🙂',
    es: '{name} ya está en esta lista. 🙂',
  },
  'share.successAlreadyMemberFallback': {
    en: 'They\'re already in this list. 🙂',
    es: 'Ya están en esta lista. 🙂',
  },
  'share.fallbackEmailHint': {
    en: 'Or send to "{value}" as an email — keep typing to add a domain.',
    es: 'O envía a "{value}" como correo — sigue escribiendo el dominio.',
  },
  'share.sendInvite': { en: 'Send invite', es: 'Enviar invitación' },

  // Pending-invite banner on /groceries
  'pendingInvite.title': {
    en: '{name} wants to share their grocery list with you.',
    es: '{name} quiere compartir su lista de compras contigo.',
  },
  'pendingInvite.titleFallback': {
    en: 'You\'ve been invited to a shared grocery list.',
    es: 'Te invitaron a una lista de compras compartida.',
  },
  'pendingInvite.accept': { en: 'Accept', es: 'Aceptar' },
  'pendingInvite.decline': { en: 'Decline', es: 'Rechazar' },

  // ─── Presence pause (mid-day surface)
  'presence.title': { en: '30-second pause', es: 'Pausa de 30 segundos' },
  'presence.intro': {
    en: 'Where\'s your attention right now?',
    es: '¿Dónde está tu atención ahora mismo?',
  },
  'presence.attentionPlaceholder': {
    en: 'what\'s on your mind…',
    es: 'lo que tienes en mente…',
  },
  'presence.bodyPrompt': {
    en: 'How does your body feel right now?',
    es: '¿Cómo se siente tu cuerpo ahora?',
  },
  'presence.oneWordPrompt': {
    en: 'One word for this moment',
    es: 'Una palabra para este momento',
  },
  'presence.oneWordPlaceholder': {
    en: 'calm, scattered, warm…',
    es: 'tranquilo, disperso, cálido…',
  },
  'presence.next': { en: 'Next', es: 'Siguiente' },
  'presence.skip': { en: 'Skip', es: 'Saltar' },
  'presence.save': { en: 'Save', es: 'Guardar' },
  'presence.done': { en: 'Done. Take another whenever.', es: 'Listo. Toma otra cuando quieras.' },
  'presence.addAnother': { en: 'Add another pause', es: 'Agregar otra pausa' },
  'presence.takeAnother': { en: 'Take another pause', es: 'Tomar otra pausa' },
  'presence.attentionLabel': { en: 'Attention', es: 'Atención' },
  'presence.bodyLabel': { en: 'Body', es: 'Cuerpo' },
  'presence.wordLabel': { en: 'Word', es: 'Palabra' },
  'presence.label': { en: 'Mid-day Pause', es: 'Pausa de mediodía' },
  'presence.oneWordLabel': { en: 'One word', es: 'Una palabra' },
  'presence.empty': {
    en: 'A 30-second mid-day pause. Three quick prompts to come back to your body and your mind.',
    es: 'Una pausa de 30 segundos a media tarde. Tres preguntas breves para volver a tu cuerpo y tu mente.',
  },
  'presence.start': { en: 'Begin', es: 'Comenzar' },

  // Settings — presence reminder row
  'settings.presenceReminder': { en: 'Presence pause', es: 'Pausa de presencia' },
  'settings.presenceReminderDesc': {
    en: 'A mid-day reminder to take a 30-second pause.',
    es: 'Un recordatorio a media tarde para hacer una pausa de 30 segundos.',
  },

  // ─── Intention practices (Patterns play button)
  'practice.skip': { en: 'Skip step', es: 'Saltar paso' },
  'practice.end': { en: 'End', es: 'Terminar' },
  'practice.comingSoon': {
    en: "Practice coming soon for this intention.",
    es: 'Práctica próximamente para esta intención.',
  },
  'practice.complete': { en: 'Well done.', es: 'Bien hecho.' },
  'practice.pause': { en: 'Pause', es: 'Pausa' },
  'practice.resume': { en: 'Resume', es: 'Continuar' },
  'practice.timeLeft': { en: 'left', es: 'restante' },

  // ─── Pulse ───
  'pulse.save': { en: 'Save', es: 'Guardar' },
  'pulse.placeholder': { en: 'Speak or type your answer...', es: 'Habla o escribe tu respuesta...' },
  'pulse.viewPatterns': { en: 'View your patterns', es: 'Ver tus patrones' },
  'pulse.patternsTitle': { en: 'Pulse Patterns', es: 'Patrones del pulso' },
  'pulse.analyzing': { en: 'Analyzing your patterns...', es: 'Analizando tus patrones...' },
  'pulse.entries': { en: '{count} entries', es: '{count} entradas' },
  'guided.liteMode': { en: 'lite mode today', es: 'modo ligero hoy' },
  'guided.takingAMoment': { en: 'Taking a moment — composing a thoughtful reply.', es: 'Un momento — redactando una respuesta cuidadosa.' },
  'pulse.emptyTitle': { en: 'No patterns yet', es: 'Aún no hay patrones' },
  'pulse.emptyMessage': { en: 'Check in daily and patterns will appear here.', es: 'Regístrate a diario y los patrones aparecerán aquí.' },
  // Morning pulse — single key kept for back-compat (used as the
  // first entry in the rotating pool). Pool itself is in
  // src/lib/morningPrompts.ts; per-day rotation is deterministic by
  // date hash so two devices show the same prompt on the same day.
  'pulse.morning.q1': { en: "What's the one thing that would make today feel like a win?", es: '¿Cuál es la cosa que haría que hoy se sienta como un logro?' },
  'pulse.morning.q2': {
    en: 'What state of mind do you want to bring today?',
    es: '¿Qué estado mental quieres llevar hoy?',
  },
  'pulse.morning.q3': {
    en: "What's the most likely obstacle today, and how will you handle it?",
    es: '¿Cuál es el obstáculo más probable hoy, y cómo lo manejarás?',
  },
  'pulse.morning.q4': {
    en: 'If today goes well, what will be true at the end of it?',
    es: 'Si hoy va bien, ¿qué será cierto al final del día?',
  },
  'pulse.morning.q5': {
    en: "What's one thing you're looking forward to today?",
    es: '¿Qué es algo que esperas con ilusión hoy?',
  },
  'pulse.morning.q6': {
    en: 'What energy are you starting with — and what do you want to protect it from?',
    es: '¿Con qué energía empiezas — y de qué quieres protegerla?',
  },
  'pulse.morning.q7': {
    en: "What's one small kindness you can offer someone today?",
    es: '¿Cuál es una pequeña amabilidad que puedes ofrecer hoy a alguien?',
  },
  'pulse.morning.q8': {
    en: "What's one thing you can do today for your future self?",
    es: '¿Qué es una cosa que puedes hacer hoy por tu yo futuro?',
  },
  'pulse.morning.q9': {
    en: 'What do you want to feel less of today? More of?',
    es: '¿De qué quieres sentir menos hoy? ¿De qué más?',
  },
  'pulse.morning.q10': {
    en: 'Who do you want to be in your hardest moment today?',
    es: '¿Quién quieres ser en tu momento más difícil hoy?',
  },
  'pulse.morning.q11': {
    en: "What's been on your mind that you want to set down before the day starts?",
    es: '¿Qué ha estado en tu mente que quieres soltar antes de que empiece el día?',
  },
  'pulse.morning.q12': {
    en: "What's one thing that's gone well lately you don't want to take for granted?",
    es: '¿Qué es algo que ha ido bien últimamente que no quieres dar por sentado?',
  },
  'pulse.morning.subtext': {
    en: 'Not a to-do list — those go on Today.',
    es: 'No es una lista de tareas — esas van en Hoy.',
  },
  'pulse.morningDone': { en: 'Morning Pulse', es: 'Pulso matutino' },
  'pulse.morningSaved': { en: 'Morning intention saved', es: 'Intención matutina guardada' },
  'pulse.eveningSaved': { en: 'Evening reflection saved', es: 'Reflexión nocturna guardada' },
  'pulse.intentionLabel': { en: 'Intention', es: 'Intención' },
  // Evening pulse
  'pulse.evening.q1': { en: 'What went right today?', es: '¿Qué salió bien hoy?' },
  'pulse.evening.q2': { en: 'What could you have done better today?', es: '¿Qué podrías haber hecho mejor hoy?' },
  'pulse.eveningDone': { en: 'Evening Pulse', es: 'Pulso nocturno' },
  'pulse.presenceDone': { en: 'Mid-day Pause', es: 'Pausa de mediodía' },
  'pulse.wentRightLabel': { en: 'Went right', es: 'Salió bien' },
  'pulse.doneBetterLabel': { en: 'Done better', es: 'Mejorar' },
  'pulse.priorIntentionLabel': {
    en: "Yesterday's intention",
    es: 'Intención de ayer',
  },

  // ─── Voice Entry ───
  'voice.title': { en: 'Voice Entry', es: 'Entrada de voz' },
  'voice.save': { en: 'Save Entry', es: 'Guardar entrada' },
  'voice.listening': { en: 'Listening...', es: 'Escuchando...' },
  'voice.tapMic': { en: 'Tap the mic and start talking.', es: 'Toca el micrófono y empieza a hablar.' },
  'voice.placeholder': { en: 'Your transcript will appear here...', es: 'Tu transcripción aparecerá aquí...' },
  'voice.browserWarning': { en: 'Voice input is not supported in this browser. Try Chrome or Edge for the best experience.', es: 'La entrada de voz no es compatible con este navegador. Prueba Chrome o Edge para la mejor experiencia.' },

  // ─── Free Write ───
  'write.title': { en: 'Free Write', es: 'Escritura libre' },
  'write.save': { en: 'Save Entry', es: 'Guardar entrada' },
  'write.saving': { en: 'Saving...', es: 'Guardando...' },
  'write.saved': { en: 'Entry saved', es: 'Entrada guardada' },
  'write.placeholder': { en: "What's on your mind?", es: '¿Qué tienes en mente?' },

  // ─── Priorities / Tasks ───
  'priorities.title': { en: 'Tasks', es: 'Tareas' },
  'priorities.today': { en: 'Today', es: 'Hoy' },
  'priorities.priorities': { en: 'Priorities', es: 'Prioridades' },
  'priorities.habits': { en: 'Habits', es: 'Hábitos' },
  'priorities.scheduledToday': { en: 'Scheduled today', es: 'Programadas hoy' },
  'priorities.groceries': { en: 'Groceries', es: 'Compras' },
  'priorities.addTasks': { en: 'Add Tasks', es: 'Agregar tareas' },
  'priorities.processing': { en: 'Processing...', es: 'Procesando...' },
  'priorities.placeholder': { en: 'Add a priority...', es: 'Agrega una prioridad...' },
  'priorities.empty': { en: 'No tasks for today yet.', es: 'Aún no hay tareas para hoy.' },
  'priorities.allDone': { en: 'All done — nice work!', es: '¡Todo listo, buen trabajo!' },
  'priorities.activityLog': { en: 'Activity Log', es: 'Registro de actividad' },

  // ─── WOOP Plans v1 ───
  // Entry-point + active-plan card
  'plans.makeAChange': { en: 'Make a change', es: 'Haz un cambio' },
  'plans.deletePlan': { en: 'Delete plan', es: 'Eliminar plan' },
  'plans.deleteConfirm': {
    en: 'Delete this plan? Your check-in history stays in your Plans notebook.',
    es: '¿Eliminar este plan? Tu historial seguirá en el cuaderno de Planes.',
  },
  'plans.deletedToast': { en: 'Plan deleted', es: 'Plan eliminado' },
  'plans.optimize': { en: 'Optimize', es: 'Optimizar' },
  'plans.optimizeLocked': {
    en: '{remaining} more check-ins to unlock Optimize',
    es: '{remaining} marcas más para desbloquear Optimizar',
  },

  // WOOP creation sheet — 4 steps
  'plans.wishTitle': { en: 'What do you wish for?', es: '¿Qué deseas?' },
  'plans.wishHint': {
    en: 'One sentence. The thing you want to change about your life.',
    es: 'Una frase. Lo que quieres cambiar en tu vida.',
  },
  'plans.wishPlaceholder': {
    en: 'I wish I…',
    es: 'Quiero…',
  },
  'plans.outcomeTitle': { en: 'What’s the best outcome?', es: '¿Cuál sería el mejor resultado?' },
  'plans.outcomeHint': {
    en: 'Picture it for a moment. How would your day or week look different?',
    es: 'Imagínalo por un momento. ¿Cómo se vería tu día o semana?',
  },
  'plans.outcomePlaceholder': {
    en: 'I’d feel… / I’d be able to…',
    es: 'Me sentiría… / Podría…',
  },
  'plans.obstaclesTitle': { en: 'What gets in the way?', es: '¿Qué se interpone?' },
  'plans.obstaclesHint': {
    en: 'Up to 3 obstacles you keep running into. Be specific.',
    es: 'Hasta 3 obstáculos que se repiten. Sé específico.',
  },
  'plans.obstaclePlaceholder1': {
    en: 'When I sit down to work, I…',
    es: 'Cuando me siento a trabajar, yo…',
  },
  'plans.obstaclePlaceholderMore': {
    en: 'Another obstacle…',
    es: 'Otro obstáculo…',
  },
  'plans.addObstacle': { en: 'Add another', es: 'Agregar otro' },
  'plans.planTitle': { en: 'Your if-then plan', es: 'Tu plan si-entonces' },
  'plans.planHint': {
    en: 'When the obstacle shows up, this is what you’ll do. Edit any line that doesn’t fit.',
    es: 'Cuando aparezca el obstáculo, esto es lo que harás. Edita cualquier línea.',
  },
  'plans.obstacleLabel': { en: 'Obstacle', es: 'Obstáculo' },
  'plans.differentIdea': { en: 'Different idea', es: 'Otra idea' },
  'plans.regenerating': { en: 'Regenerating…', es: 'Regenerando…' },
  'plans.disclaimer': {
    en: 'Plans, not therapy. This is a tool for habits and follow-through, not a replacement for professional support.',
    es: 'Planes, no terapia. Es una herramienta para hábitos y constancia, no sustituye apoyo profesional.',
  },
  'plans.savePlan': { en: 'Save plan', es: 'Guardar plan' },
  'plans.remindMe': { en: 'Remind me at', es: 'Recuérdame a' },
  'plans.clearReminder': { en: 'Clear reminder', es: 'Quitar recordatorio' },
  'plans.dailyReminderAt': { en: 'Daily reminder at {time}', es: 'Recordatorio diario a las {time}' },
  'plans.savedToast': { en: 'Plan saved — start checking off today', es: 'Plan guardado — empieza a marcar hoy' },
  'plans.saveFailed': { en: 'Couldn’t save the plan. Try again.', es: 'No se pudo guardar. Inténtalo otra vez.' },
  'plans.generating': { en: 'Generating your plan…', es: 'Generando tu plan…' },

  // Optimize sheet
  'plans.optimizeTitle': { en: 'Optimize your plan', es: 'Optimiza tu plan' },
  'plans.optimizeSubtitle': {
    en: 'Based on what you’ve actually been checking off, here’s where you are.',
    es: 'Según lo que has marcado, aquí estás.',
  },
  'plans.working': { en: 'Working', es: 'Funciona' },
  'plans.notWorking': { en: 'Not working yet', es: 'Aún no funciona' },
  'plans.notEnoughData': {
    en: 'Not enough check-ins yet to tell — keep going for a few more days.',
    es: 'Aún no hay suficientes marcas — continúa unos días más.',
  },
  'plans.pickDirection': { en: 'Pick a direction:', es: 'Elige una dirección:' },
  'plans.tighten': { en: 'Tighten', es: 'Ajustar' },
  'plans.tightenHint': {
    en: 'Drop what isn’t working. Keep what is.',
    es: 'Suelta lo que no funciona. Conserva lo que sí.',
  },
  'plans.newAngle': { en: 'New angle', es: 'Nuevo enfoque' },
  'plans.newAngleHint': {
    en: 'Re-write the if-thens that aren’t landing.',
    es: 'Reescribe los si-entonces que no funcionan.',
  },
  'plans.startOver': { en: 'Start over', es: 'Empezar de cero' },
  'plans.startOverHint': {
    en: 'Regenerate every if-then from scratch.',
    es: 'Genera todos los si-entonces de nuevo.',
  },
  'plans.tightenedHeader': { en: 'Tightened plan', es: 'Plan ajustado' },
  'plans.newAngleHeader': { en: 'Fresh angles', es: 'Nuevos enfoques' },
  'plans.startedOverHeader': { en: 'Fresh plan', es: 'Plan nuevo' },
  'plans.optimizedToast': { en: 'Plan updated', es: 'Plan actualizado' },

  // ─── Habits ───
  'habits.title': { en: 'Habit Gallery', es: 'Galería de hábitos' },
  'habits.createNew': { en: '+ Create a new habit', es: '+ Crear un nuevo hábito' },
  'habits.createNewTitle': { en: 'Create a new habit', es: 'Crea un nuevo hábito' },
  'habits.habitName': { en: 'Habit name...', es: 'Nombre del hábito...' },
  'habits.addHabit': { en: 'Add Habit', es: 'Agregar hábito' },
  'habits.adding': { en: 'Adding...', es: 'Agregando...' },

  // ─── Intentions ───
  'intentions.title': { en: 'Intention Gallery', es: 'Galería de intenciones' },
  'intentions.placeholder': { en: 'Add a custom intention...', es: 'Agrega una intención personalizada...' },

  // ─── Templates ───
  'templates.title': { en: 'Manage Templates', es: 'Administrar plantillas' },
  'templates.subtitle': { en: 'Toggle templates to show on your home screen', es: 'Activa las plantillas que quieras en tu pantalla de inicio' },
  'templates.loading': { en: 'Loading templates...', es: 'Cargando plantillas...' },
  'templates.noTemplates': { en: 'No templates available yet.', es: 'Aún no hay plantillas disponibles.' },
  'templates.activeCount': { en: '{count} template{plural} active on home screen', es: '{count} plantilla{plural} activa{pluralEs} en la pantalla de inicio' },
  // Category labels
  'templates.cat.daily': { en: 'Daily', es: 'Diarias' },
  'templates.cat.weekly': { en: 'Weekly', es: 'Semanales' },
  'templates.cat.monthly': { en: 'Monthly', es: 'Mensuales' },
  'templates.cat.quarterly': { en: 'Quarterly', es: 'Trimestrales' },
  'templates.cat.yearly': { en: 'Yearly', es: 'Anuales' },
  'templates.cat.anytime': { en: 'Anytime', es: 'Cualquier momento' },
  'templates.cat.activity': { en: 'Guided Activities', es: 'Actividades guiadas' },
  'templates.cat.processing': { en: 'Processing', es: 'Procesamiento' },
  'templates.cat.growth': { en: 'Growth', es: 'Crecimiento' },
  'templates.cat.planning': { en: 'Planning', es: 'Planeación' },
  'templates.cat.mindset': { en: 'Mindset', es: 'Mentalidad' },
  'templates.cat.inner_work': { en: 'Inner Work', es: 'Trabajo interior' },
  'templates.cat.science': { en: 'Science', es: 'Ciencia' },

  // ─── Template Use ───
  'template.notFound': { en: 'Template not found.', es: 'Plantilla no encontrada.' },
  'template.loadingTemplate': { en: 'Loading template...', es: 'Cargando plantilla...' },
  'template.stopRecording': { en: 'Stop Recording', es: 'Dejar de grabar' },
  'template.tapToSpeak': { en: 'Tap to Speak', es: 'Toca para hablar' },
  'template.review': { en: 'Review', es: 'Revisión' },
  'template.skipped': { en: '(skipped)', es: '(omitida)' },
  'template.yourAnswer': { en: 'Your answer...', es: 'Tu respuesta...' },
  'template.goHome': { en: 'Go home', es: 'Ir al inicio' },

  // ─── Entry Detail ───
  'entry.notFound': { en: 'Entry not found.', es: 'Entrada no encontrada.' },
  'entry.goBack': { en: 'Go back', es: 'Regresar' },
  'entry.guide': { en: 'Guide', es: 'Guía' },
  'entry.titlePlaceholder': { en: 'Entry title (optional)', es: 'Título de la entrada (opcional)' },
  'entry.typeVoice': { en: '🎙️ Voice Entry', es: '🎙️ Entrada de voz' },
  'entry.typeGuided': { en: '💬 Guided Session', es: '💬 Sesión guiada' },
  'entry.typeTemplate': { en: '📋 Template', es: '📋 Plantilla' },
  'entry.typeFreeform': { en: '✏️ Free Write', es: '✏️ Escritura libre' },

  // ─── Mood ───
  'mood.howFeeling': { en: 'How are you feeling?', es: '¿Cómo te sientes?' },
  'mood.great': { en: 'great', es: 'genial' },
  'mood.good': { en: 'good', es: 'bien' },
  'mood.okay': { en: 'okay', es: 'regular' },
  'mood.low': { en: 'low', es: 'bajo' },
  'mood.tough': { en: 'tough', es: 'difícil' },

  // ─── Weekly Reflection ───
  'reflection.title': { en: "{name}'s Weekly Reflection", es: 'Reflexión semanal de {name}' },
  'reflection.tapToRead': { en: 'tap to read', es: 'toca para leer' },
  'reflection.tapToCollapse': { en: 'tap to collapse', es: 'toca para cerrar' },

  // ─── Auth: Welcome ───
  'welcome.tagline': { en: 'Tap and talk. Science-backed journaling with AI guidance.', es: 'Toca y habla. Diario con respaldo científico y guía de IA.' },
  'welcome.continueGoogle': { en: 'Continue with Google', es: 'Continuar con Google' },
  'welcome.connectingGoogle': { en: 'Connecting...', es: 'Conectando...' },
  'welcome.signInEmail': { en: 'Sign In with Email', es: 'Iniciar sesión con correo' },
  'welcome.createAccount': { en: 'Create Account', es: 'Crear cuenta' },
  'welcome.footer': { en: "Voice-first journaling. Your guide asks the questions.\nYou do the thinking.", es: 'Diario de voz. Tu guía hace las preguntas.\nTú haces la reflexión.' },

  // ─── Auth: Sign In ───
  'signIn.title': { en: 'Welcome back', es: 'Bienvenido de vuelta' },
  'signIn.subtitle': { en: 'Sign in to continue journaling.', es: 'Inicia sesión para seguir con tu diario.' },
  'signIn.email': { en: 'Email', es: 'Correo electrónico' },
  'signIn.password': { en: 'Password', es: 'Contraseña' },
  'signIn.button': { en: 'Sign In', es: 'Iniciar sesión' },
  'signIn.loading': { en: 'Signing in...', es: 'Iniciando sesión...' },
  'signIn.noAccount': { en: "Don't have an account?", es: '¿No tienes cuenta?' },
  'signIn.signUp': { en: 'Sign up', es: 'Regístrate' },
  'signIn.forgotPassword': { en: 'Forgot password?', es: '¿Olvidaste tu contraseña?' },

  // ─── Auth: Forgot Password ───
  'forgotPassword.title': { en: 'Reset your password', es: 'Restablece tu contraseña' },
  'forgotPassword.subtitle': {
    en: "Enter the email you signed up with and we'll send you a link to set a new password.",
    es: 'Ingresa el correo con el que te registraste y te enviaremos un enlace para crear una nueva contraseña.',
  },
  'forgotPassword.email': { en: 'Email', es: 'Correo electrónico' },
  'forgotPassword.button': { en: 'Send reset link', es: 'Enviar enlace de restablecimiento' },
  'forgotPassword.loading': { en: 'Sending...', es: 'Enviando...' },
  'forgotPassword.sentTitle': { en: 'Check your email', es: 'Revisa tu correo' },
  'forgotPassword.sentBody': {
    en: "We've sent a link to reset your password. If you don't see it, check your spam folder.",
    es: 'Te enviamos un enlace para restablecer tu contraseña. Si no lo ves, revisa tu carpeta de spam.',
  },
  'forgotPassword.backToSignIn': { en: 'Back to sign in', es: 'Volver a iniciar sesión' },

  // ─── Auth: Reset Password (new-password landing from email) ───
  'resetPassword.title': { en: 'Set a new password', es: 'Crea una nueva contraseña' },
  'resetPassword.subtitle': {
    en: 'Enter your new password below. You will be signed in automatically.',
    es: 'Escribe tu nueva contraseña abajo. Iniciarás sesión automáticamente.',
  },
  'resetPassword.newPassword': { en: 'New password', es: 'Nueva contraseña' },
  'resetPassword.confirmPassword': { en: 'Confirm password', es: 'Confirma la contraseña' },
  'resetPassword.mismatch': { en: 'Passwords do not match.', es: 'Las contraseñas no coinciden.' },
  'resetPassword.tooShort': { en: 'Password must be at least 6 characters.', es: 'La contraseña debe tener al menos 6 caracteres.' },
  'resetPassword.button': { en: 'Update password', es: 'Actualizar contraseña' },
  'resetPassword.loading': { en: 'Updating...', es: 'Actualizando...' },
  'resetPassword.success': { en: 'Password updated. Welcome back.', es: 'Contraseña actualizada. Bienvenido de vuelta.' },
  'resetPassword.invalidLink': {
    en: 'This reset link is invalid or has expired. Request a new one from the sign-in page.',
    es: 'Este enlace es inválido o ha expirado. Solicita uno nuevo desde la página de inicio de sesión.',
  },

  // ─── Auth: Email confirmation landing ───
  'confirm.loading': { en: 'Confirming your email...', es: 'Confirmando tu correo...' },
  'confirm.error': {
    en: "We couldn't confirm your email. The link may have expired — try signing up again or contact support.",
    es: 'No pudimos confirmar tu correo. El enlace puede haber expirado — intenta registrarte de nuevo o contacta a soporte.',
  },

  // ─── Auth: Sign Up ───
  'signUp.title': { en: 'Create your account', es: 'Crea tu cuenta' },
  'signUp.subtitle': { en: 'Start your journaling practice.', es: 'Comienza tu práctica de diario.' },
  'signUp.email': { en: 'Email', es: 'Correo electrónico' },
  'signUp.password': { en: 'Password', es: 'Contraseña' },
  'signUp.button': { en: 'Create Account', es: 'Crear cuenta' },
  'signUp.loading': { en: 'Creating account...', es: 'Creando cuenta...' },
  'signUp.hasAccount': { en: 'Already have an account?', es: '¿Ya tienes cuenta?' },
  'signUp.signIn': { en: 'Sign in', es: 'Inicia sesión' },
  'signUp.checkEmail': { en: 'Check your email', es: 'Revisa tu correo' },
  'signUp.confirmationSent': { en: 'We sent a confirmation link to', es: 'Enviamos un enlace de confirmación a' },
  'signUp.clickToActivate': { en: 'Click it to activate your account.', es: 'Haz clic para activar tu cuenta.' },
  'signUp.goToSignIn': { en: 'Go to Sign In', es: 'Ir a iniciar sesión' },
  'signUp.passwordMin': { en: 'Password must be at least 6 characters.', es: 'La contraseña debe tener al menos 6 caracteres.' },

  // ─── Auth: Onboarding ───
  'onboarding.chooseLanguage': { en: 'Choose your language', es: 'Elige tu idioma' },
  'onboarding.changeLater': { en: 'You can change this later in Settings.', es: 'Puedes cambiarlo después en Ajustes.' },
  'onboarding.whatName': { en: 'What should we call you?', es: '¿Cómo te llamamos?' },
  'onboarding.changeNameLater': { en: 'You can always change this later.', es: 'Siempre puedes cambiarlo después.' },
  'onboarding.yourName': { en: 'Your name', es: 'Tu nombre' },
  'onboarding.chooseGuide': { en: 'Choose your guide', es: 'Elige tu guía' },
  'onboarding.guideSubtitle': { en: 'Each guide has a different style. You can switch anytime.', es: 'Cada guía tiene un estilo diferente. Puedes cambiar cuando quieras.' },
  'onboarding.pickTemplates': { en: 'Pick your templates', es: 'Elige tus plantillas' },
  'onboarding.templateSubtitle': { en: 'These show on your home screen. Tap to toggle.', es: 'Estas aparecen en tu pantalla de inicio. Toca para activar.' },
  'onboarding.settingUp': { en: 'Setting up...', es: 'Configurando...' },
  'onboarding.startJournaling': { en: 'Start Journaling', es: 'Comenzar a escribir' },

  // ─── Onboarding: Primary use (intent-led, not feature-led) ───
  // Lead with the user's GOAL on each card, not the feature name —
  // a new user knows whether they came to "get organized" or
  // "understand themselves" before they know what we mean by Tasks
  // or Journal. The feature names live in the subtext as a hint.
  'onboarding.primaryUse.headline': {
    en: 'What do you want to do first?',
    es: '¿Qué quieres hacer primero?',
  },
  'onboarding.primaryUse.helper': {
    en: 'You can change this anytime.',
    es: 'Puedes cambiarlo cuando quieras.',
  },
  'onboarding.primaryUse.bothHint': {
    en: 'Both sides, with a switch at the top to flip between them.',
    es: 'Ambos lados, con un selector arriba para alternar.',
  },
  'onboarding.primaryUse.tasks.title': {
    en: 'Capture tasks',
    es: 'Capturar tareas',
  },
  'onboarding.primaryUse.tasks.subtext': {
    en: 'Tasks, lists, what to do today',
    es: 'Tareas, listas, qué hacer hoy',
  },
  'onboarding.primaryUse.journal.title': {
    en: 'Reflect daily',
    es: 'Reflexionar diariamente',
  },
  'onboarding.primaryUse.journal.subtext': {
    en: 'Daily check-ins, free writing, patterns',
    es: 'Revisiones diarias, escritura libre, patrones',
  },
  'onboarding.primaryUse.continue': { en: 'Start', es: 'Empezar' },

  // ─── Onboarding v4: brought-you-here intent chips ───
  'onboarding.broughtYouHere.title': {
    en: 'What brought you here?',
    es: '¿Qué te trajo aquí?',
  },
  'onboarding.broughtYouHere.subtitle': {
    en: 'Pick anything that fits. We’ll set things up around what you want.',
    es: 'Elige lo que aplique. Vamos a configurar la app para lo que buscas.',
  },
  'onboarding.broughtYouHere.habit.label': {
    en: 'Build a daily reflection habit',
    es: 'Crear un hábito diario de reflexión',
  },
  'onboarding.broughtYouHere.habit.hint': {
    en: 'A small check-in every day.',
    es: 'Una pequeña pausa cada día.',
  },
  'onboarding.broughtYouHere.goals.label': {
    en: 'Get clearer about my goals',
    es: 'Tener más claridad sobre mis metas',
  },
  'onboarding.broughtYouHere.goals.hint': {
    en: 'Turn vague intentions into something concrete.',
    es: 'Convierte intenciones vagas en algo concreto.',
  },
  'onboarding.broughtYouHere.gratitude.label': {
    en: 'Track gratitude',
    es: 'Llevar un registro de gratitud',
  },
  'onboarding.broughtYouHere.gratitude.hint': {
    en: 'Three good things, daily.',
    es: 'Tres cosas buenas, a diario.',
  },
  'onboarding.broughtYouHere.feelings.label': {
    en: 'Process what I’m feeling',
    es: 'Procesar lo que estoy sintiendo',
  },
  'onboarding.broughtYouHere.feelings.hint': {
    en: 'Talk it out with a guide that listens.',
    es: 'Habla con una guía que te escucha.',
  },
  'onboarding.broughtYouHere.plans.label': {
    en: 'Plan small changes',
    es: 'Planear cambios pequeños',
  },
  'onboarding.broughtYouHere.plans.hint': {
    en: 'Wish, obstacle, plan. Backed by research.',
    es: 'Deseo, obstáculo, plan. Respaldado por la ciencia.',
  },
  'onboarding.broughtYouHere.exploring.label': {
    en: 'Just exploring',
    es: 'Solo explorando',
  },
  'onboarding.broughtYouHere.exploring.hint': {
    en: 'No agenda. Look around.',
    es: 'Sin prisa. Echa un vistazo.',
  },

  // ─── Onboarding v4: reflection-time chip ───
  'onboarding.reflectionTime.title': {
    en: 'When do you usually reflect?',
    es: '¿Cuándo sueles reflexionar?',
  },
  'onboarding.reflectionTime.subtitle': {
    en: 'We’ll suggest a daily nudge for that window. You can change it later.',
    es: 'Te sugeriremos un recordatorio para ese momento. Puedes cambiarlo después.',
  },
  'onboarding.reflectionTime.morning.label': { en: 'Morning', es: 'Mañana' },
  'onboarding.reflectionTime.morning.hint': {
    en: 'Set the day before it sets you.',
    es: 'Marca el día antes de que el día te marque a ti.',
  },
  'onboarding.reflectionTime.midday.label': { en: 'Mid-day', es: 'Mediodía' },
  'onboarding.reflectionTime.midday.hint': {
    en: 'A pause to come back to yourself.',
    es: 'Una pausa para volver a ti.',
  },
  'onboarding.reflectionTime.evening.label': { en: 'Evening', es: 'Noche' },
  'onboarding.reflectionTime.evening.hint': {
    en: 'Close the loop on your day.',
    es: 'Cierra el día.',
  },
  'onboarding.reflectionTime.anytime.label': { en: 'Anytime', es: 'A cualquier hora' },
  'onboarding.reflectionTime.anytime.hint': {
    en: 'I’ll find my own moment.',
    es: 'Encontraré mi propio momento.',
  },

  // ─── Onboarding v4: first-win prompt ───
  'onboarding.firstWin.subtitle': {
    en: 'Just a sentence is enough. We’ll save it where it belongs.',
    es: 'Con una frase basta. Lo guardamos donde corresponde.',
  },
  'onboarding.firstWin.saveCta': {
    en: 'Save and continue',
    es: 'Guardar y seguir',
  },
  'onboarding.firstWin.gratitude.prompt': {
    en: 'One thing you’re grateful for today',
    es: 'Una cosa por la que estás agradecido hoy',
  },
  'onboarding.firstWin.gratitude.placeholder': {
    en: 'A small specific moment beats a vague category.',
    es: 'Un momento pequeño y específico vale más que algo vago.',
  },
  'onboarding.firstWin.plan.prompt': {
    en: 'What’s one thing you want to change?',
    es: '¿Qué es una cosa que quieres cambiar?',
  },
  'onboarding.firstWin.plan.placeholder': {
    en: 'In one sentence. We’ll help you build the plan later.',
    es: 'En una frase. Te ayudamos a armar el plan después.',
  },
  'onboarding.firstWin.feelings.prompt': {
    en: 'How are you feeling right now?',
    es: '¿Cómo te sientes en este momento?',
  },
  'onboarding.firstWin.feelings.placeholder': {
    en: 'Whatever’s present. No editing.',
    es: 'Lo que esté presente. Sin editar.',
  },
  'onboarding.firstWin.habit.prompt': {
    en: 'How is your day starting?',
    es: '¿Cómo está empezando tu día?',
  },
  'onboarding.firstWin.habit.placeholder': {
    en: 'A short sentence is plenty.',
    es: 'Una frase corta es suficiente.',
  },
  'onboarding.firstWin.default.prompt': {
    en: 'What’s on your mind today?',
    es: '¿Qué tienes en mente hoy?',
  },
  'onboarding.firstWin.default.placeholder': {
    en: 'Just a sentence to get started.',
    es: 'Una frase para empezar.',
  },

  // ─── Onboarding v4: permission primer ───
  'onboarding.primer.headlineTimed': {
    en: 'Mind if we ping you at {time}?',
    es: '¿Te molesta si te recordamos a las {time}?',
  },
  'onboarding.primer.headlineAnytime': {
    en: 'Mind if we send a gentle daily nudge?',
    es: '¿Te molesta un recordatorio amable a diario?',
  },
  'onboarding.primer.subtitle': {
    en: 'A small reminder helps the habit stick. You can change it any time.',
    es: 'Un pequeño recordatorio ayuda a que el hábito se quede. Puedes cambiarlo cuando quieras.',
  },
  'onboarding.primer.detail': {
    en: 'No spam. No promo. One quiet nudge that opens straight to today’s reflection.',
    es: 'Sin spam ni promos. Solo un aviso discreto que te lleva directo a la reflexión del día.',
  },
  'onboarding.primer.sure': { en: 'Sure', es: 'Claro' },
  'onboarding.primer.notYet': { en: 'Not yet', es: 'Ahora no' },

  // ─── Onboarding v3: welcome / install / tour ───
  'onboarding.welcome.headline': {
    en: 'Capture tasks. Reflect daily. See your patterns.',
    es: 'Captura tareas. Reflexiona a diario. Mira tus patrones.',
  },
  'onboarding.welcome.body': {
    en: 'Talk into your phone. We’ll structure it. Your first entry in under a minute.',
    es: 'Habla a tu teléfono. Nosotros lo estructuramos. Tu primera entrada en menos de un minuto.',
  },
  'onboarding.welcome.cta': { en: 'Start', es: 'Empezar' },
  'onboarding.guide.title': { en: 'Choose your guide', es: 'Elige tu guía' },
  'onboarding.guide.subtitle': {
    en: 'Each has their own voice. You can switch anytime.',
    es: 'Cada uno tiene su voz. Puedes cambiar cuando quieras.',
  },
  'onboarding.guide.awake': { en: 'Hey. I’m {name}.', es: 'Hey. Soy {name}.' },
  'onboarding.install.teaser': {
    en: 'Let’s make this a home-screen habit, not a browser tab.',
    es: 'Hagamos esto un hábito en tu pantalla de inicio, no una pestaña del navegador.',
  },
  'onboarding.install.iosTitle': { en: 'Add to home screen — 3 taps.', es: 'Añade a la pantalla de inicio — 3 toques.' },
  'onboarding.install.iosBody': {
    en: 'Feels like a real app. Reminders work better. Opens instantly.',
    es: 'Se siente como una app real. Los recordatorios funcionan mejor. Abre al instante.',
  },
  'onboarding.install.iosStep1': {
    en: 'Tap the ••• menu at the bottom of Safari',
    es: 'Toca el menú ••• abajo de Safari',
  },
  'onboarding.install.iosStep2': {
    en: 'Tap Share',
    es: 'Toca Compartir',
  },
  'onboarding.install.iosStep3': {
    en: 'Tap View More',
    es: 'Toca Ver más',
  },
  'onboarding.install.iosStep4': {
    en: 'Tap "Add to Home Screen"',
    es: 'Toca "Añadir a pantalla de inicio"',
  },
  'onboarding.install.iosStep5': {
    en: 'Tap Add — done',
    es: 'Toca Añadir — listo',
  },
  // ── Generic 3-step captions for the SVG carousel (iOS non-Safari
  //    browsers — Chrome / DDG / Firefox / Edge). They all surface
  //    the same iOS share sheet underneath, so the language stays
  //    share-icon → Add to Home Screen → Add. ────────────────────
  'onboarding.install.svgStep1': {
    en: 'Tap the share icon in your browser toolbar',
    es: 'Toca el ícono de compartir en la barra del navegador',
  },
  'onboarding.install.svgStep2': {
    en: 'Tap "Add to Home Screen"',
    es: 'Toca "Añadir a pantalla de inicio"',
  },
  'onboarding.install.svgStep3': {
    en: 'Tap Add — done',
    es: 'Toca Añadir — listo',
  },
  // Overview steps shown to iOS non-Safari users (the 3-step list
  // before they tap "I'll add it now"). Slightly different from the
  // Safari version below since their toolbar isn't Safari's.
  'onboarding.install.iosOtherOverview1': {
    en: 'Tap the share icon in your browser toolbar.',
    es: 'Toca el ícono de compartir en la barra de tu navegador.',
  },
  'onboarding.install.iosOtherOverview2': {
    en: 'Choose "Add to Home Screen" from the share sheet.',
    es: 'Elige "Añadir a pantalla de inicio" en el menú de compartir.',
  },
  'onboarding.install.iosOtherOverview3': {
    en: 'Tap "Add" — done.',
    es: 'Toca "Añadir" — listo.',
  },
  'onboarding.install.androidTitle': { en: 'Install as an app', es: 'Instala como app' },
  'onboarding.install.androidBody': {
    en: 'Your phone will ask permission — say yes.',
    es: 'Tu teléfono te pedirá permiso — di que sí.',
  },
  'onboarding.install.androidCta': { en: 'Install', es: 'Instalar' },
  'onboarding.install.androidStep1': { en: 'Open the Chrome menu', es: 'Abre el menú de Chrome' },
  'onboarding.install.androidStep2': { en: 'Tap "Install app"', es: 'Toca "Instalar app"' },
  'onboarding.install.added': { en: 'I added it', es: 'Ya lo agregué' },
  'onboarding.install.skip': { en: 'Skip', es: 'Saltar' },
  'onboarding.install.installed': { en: 'Already installed — nice.', es: 'Ya está instalado — qué bien.' },
  'onboarding.name.title': { en: 'And you are?', es: '¿Y tú eres?' },
  'onboarding.name.subtitle': {
    en: 'Just a first name. You can change it later.',
    es: 'Solo tu nombre. Puedes cambiarlo después.',
  },
  'tour.showMe': { en: 'Show me', es: 'Muéstrame' },
  'tour.skip': { en: 'Skip', es: 'Saltar' },
  'tour.next': { en: 'Next', es: 'Siguiente' },
  'tour.done': { en: 'Got it', es: 'Listo' },

  // ── Tour body copy (≤2 sentences each, generic voice) ─────────
  'tour.journalWelcome': {
    en: 'This is where you reflect. Pulse twice a day, free writing anytime.',
    es: 'Aquí reflexionas. Pulso dos veces al día, escritura libre cuando quieras.',
  },
  'tour.freeWriteButton': {
    en: 'Tap to write anything. We’ll structure it for you.',
    es: 'Toca para escribir lo que sea. Nosotros lo estructuramos.',
  },
  'tour.wallSwitchToTasks': {
    en: 'Tap to switch to tasks.',
    es: 'Toca para cambiar a tareas.',
  },
  'tour.tasksWelcome': {
    en: 'This is where you capture. Mic below — talk and we sort it.',
    es: 'Aquí capturas. Micrófono abajo — habla y lo organizamos.',
  },
  'tour.captureMic': {
    en: 'Tap and talk. Try: “milk from Whole Foods”, “proposal Thursday”, “remind me Friday at 5.”',
    es: 'Toca y habla. Prueba: "leche de Whole Foods", "propuesta el jueves", "recuérdame el viernes a las 5".',
  },
  'tour.wallSwitchToJournal': {
    en: 'Tap to switch back. Flip anytime.',
    es: 'Toca para volver. Cambia cuando quieras.',
  },
  'tour.outro': {
    en: "You're set. Replay from Settings if you want.",
    es: 'Listo. Repite desde Ajustes si quieres.',
  },

  // ── First-visit tab popups (1 sentence each, "Got it" dismiss) ─
  'tabPopup.notebooks': {
    en: 'Past entries live here. Each one auto-structured.',
    es: 'Entradas pasadas viven aquí. Cada una se estructura sola.',
  },
  'tabPopup.patterns': {
    en: 'Themes from your entries. Refreshed weekly.',
    es: 'Temas de tus entradas. Se actualiza cada semana.',
  },
  'tabPopup.guided': {
    en: 'Guided writing. Useful when something needs unpacking.',
    es: 'Escritura guiada. Útil cuando algo necesita salir.',
  },
  'tabPopup.upcoming': {
    en: 'Tasks scheduled for later, sorted by date.',
    es: 'Tareas programadas, ordenadas por fecha.',
  },
  'tabPopup.lists': {
    en: 'Group tasks into projects.',
    es: 'Agrupa tareas en proyectos.',
  },
  'tabPopup.groceries': {
    en: 'Shared grocery list. Works offline.',
    es: 'Lista de compras compartida. Funciona sin conexión.',
  },
  'tabPopup.gotIt': { en: 'Got it', es: 'Listo' },

  // ── Overdue section ──────────────────────────────────────────
  'overdue.label': { en: 'Overdue', es: 'Atrasadas' },
  'overdue.moveAll': { en: 'Move all to today →', es: 'Mover todas a hoy →' },
  'overdue.today': { en: 'Today', es: 'Hoy' },
  'overdue.tomorrow': { en: 'Tomorrow', es: 'Mañana' },
  'overdue.archive': { en: 'Archive', es: 'Archivar' },
  'overdue.stillRelevant': { en: 'Still relevant?', es: '¿Sigue siendo relevante?' },
  'overdue.expand': {
    en: '+ {count} more (tap to expand)',
    es: '+ {count} más (toca para expandir)',
  },
  'overdue.collapse': { en: 'Show less', es: 'Mostrar menos' },
  'overdue.bankruptcyTitle': {
    en: 'You have {count} overdue tasks',
    es: 'Tienes {count} tareas atrasadas',
  },
  'overdue.bankruptcyHint': {
    en: 'Archive them all to start fresh.',
    es: 'Archívalas todas para empezar de nuevo.',
  },
  'overdue.archiveAll': { en: 'Archive all', es: 'Archivar todas' },
  'overdue.archiveAllConfirm': {
    en: 'Archive all {count} overdue tasks? This hides them — they won’t show in Today anymore.',
    es: '¿Archivar las {count} tareas atrasadas? Esto las oculta — ya no aparecerán en Hoy.',
  },
  'overdue.movedToast': {
    en: 'Moved {count} {label} to today',
    es: 'Se movieron {count} {label} a hoy',
  },
  'overdue.archivedToast': {
    en: 'Archived {count} tasks',
    es: 'Se archivaron {count} tareas',
  },
  'overdue.taskWord': { en: 'task', es: 'tarea' },
  'overdue.tasksWord': { en: 'tasks', es: 'tareas' },
  'overdue.reschedule': { en: 'Reschedule', es: 'Reprogramar' },
  'overdue.rescheduledToast': { en: 'Rescheduled', es: 'Reprogramada' },

  // ── Gratitude suggestion sheet ───────────────────────────────
  'gratitude.introTitle': {
    en: 'Saving gratitude is a nice habit',
    es: 'Guardar gratitud es un buen hábito',
  },
  'gratitude.introBody': {
    en: 'When you mention something you’re thankful for in any entry, we’ll offer to save it to your Gratitude notebook. You always see the suggestion first — never automatic.',
    es: 'Cuando menciones algo por lo que estés agradecido en cualquier entrada, te ofreceremos guardarlo en tu cuaderno de Gratitud. Siempre verás la sugerencia primero — nunca automático.',
  },
  'gratitude.suggestionTitle': {
    en: 'Save these to Gratitude?',
    es: '¿Guardar esto en Gratitud?',
  },
  'gratitude.suggestionHint': {
    en: 'Tap to deselect anything that doesn’t fit. We’ll save the rest to your Gratitude notebook.',
    es: 'Toca para deseleccionar lo que no encaje. Guardaremos el resto en tu cuaderno de Gratitud.',
  },
  'gratitude.save': { en: 'Save to Gratitude', es: 'Guardar en Gratitud' },
  'gratitude.skip': { en: 'Skip', es: 'Saltar' },
  'gratitude.settingsHint': {
    en: 'You can turn this off any time in Settings → Auto-detect gratitude.',
    es: 'Puedes desactivar esto cuando quieras en Ajustes → Detectar gratitud automáticamente.',
  },
  'gratitude.savedToast': {
    en: 'Saved to Gratitude',
    es: 'Guardado en Gratitud',
  },

  // ── Daily gratitude card (Three Good Things) ─────────────────
  'gratitude.daily.title': {
    en: 'Three good things',
    es: 'Tres cosas buenas',
  },
  'gratitude.daily.prompt': {
    en: 'What are you grateful for today? A small specific moment beats a vague category.',
    es: '¿Por qué estás agradecido hoy? Un momento pequeño y específico vale más que una categoría vaga.',
  },
  'gratitude.daily.placeholderSingle': {
    en: "One thing you're grateful for today (small + specific)",
    es: 'Una cosa por la que estás agradecido hoy (pequeña y específica)',
  },
  'gratitude.daily.soFar': {
    en: "Today's so far",
    es: 'Hasta ahora hoy',
  },
  'gratitude.daily.placeholder1': {
    en: "Maria made me orange juice this morning",
    es: 'María me preparó jugo de naranja esta mañana',
  },
  'gratitude.daily.placeholder2': {
    en: 'a small thing today, not "my family"',
    es: 'algo pequeño de hoy, no "mi familia"',
  },
  'gratitude.daily.placeholder3': {
    en: 'one more if it comes to you',
    es: 'una más si se te ocurre',
  },
  'gratitude.daily.whyPlaceholder': {
    en: 'why this mattered (optional)',
    es: 'por qué importó (opcional)',
  },
  'gratitude.daily.save': {
    en: "Save today's three",
    es: 'Guardar las tres de hoy',
  },
  'gratitude.daily.savedToast': {
    en: 'Saved your gratitude',
    es: 'Guardamos tu gratitud',
  },
  'gratitude.daily.saveFailed': {
    en: "Couldn't save. Try again?",
    es: 'No se pudo guardar. ¿Reintentar?',
  },
  'gratitude.daily.done': {
    en: "Today's three",
    es: 'Tus tres de hoy',
  },
  'gratitude.daily.edit': { en: 'Edit', es: 'Editar' },
  'gratitude.daily.entryBadge': {
    en: 'Three good things',
    es: 'Tres cosas buenas',
  },
  'gratitude.daily.startPractice': {
    en: 'Start a daily gratitude practice',
    es: 'Empieza una práctica diaria de gratitud',
  },
  'gratitude.daily.startPracticeHint': {
    en: 'Three small things, every day. No streaks, no pressure.',
    es: 'Tres cosas pequeñas, cada día. Sin rachas, sin presión.',
  },

  // ── Settings: gratitude auto-detect ──────────────────────────
  'settings.gratitude.title': { en: 'Gratitude', es: 'Gratitud' },
  'settings.gratitude.toggleLabel': {
    en: 'Auto-detect gratitude',
    es: 'Detectar gratitud automáticamente',
  },
  'settings.gratitude.toggleHint': {
    en: 'When you mention gratitude in an entry, we’ll suggest saving it to your Gratitude notebook (you always confirm first).',
    es: 'Cuando menciones gratitud en una entrada, te sugeriremos guardarla en tu cuaderno de Gratitud (siempre confirmas primero).',
  },

  // ── Settings: Plans (WOOP) ────────────────────────────────────
  'settings.plans.title': { en: 'Plans', es: 'Planes' },
  'settings.plans.toggleLabel': {
    en: 'Enable plans',
    es: 'Activar planes',
  },
  'settings.plans.toggleHint': {
    en: 'Turn a wish into action with WOOP — wish, outcome, obstacle, plan. A small, science-backed nudge for changing one thing at a time.',
    es: 'Convierte un deseo en acción con WOOP: deseo, resultado, obstáculo, plan. Un empujón pequeño y respaldado por la ciencia para cambiar una cosa a la vez.',
  },
  'settings.plans.openNotebook': {
    en: 'Open Plans notebook',
    es: 'Abrir cuaderno de Planes',
  },

  // ── Settings: Patterns link (replaces journal-wall Patterns tab) ─
  'settings.patterns.title': { en: 'Reflections archive', es: 'Archivo de reflexiones' },
  'settings.patterns.linkLabel': {
    en: 'Patterns & letters',
    es: 'Patrones y cartas',
  },
  'settings.patterns.linkHint': {
    en: 'Weekly letters, monthly patterns, and quarterly reviews from your guide.',
    es: 'Cartas semanales, patrones mensuales y revisiones trimestrales de tu guía.',
  },

  // ── Settings: Guided sessions toggle ────────────────────────
  'settings.guided.title': { en: 'Guided sessions', es: 'Sesiones guiadas' },
  'settings.guided.toggleLabel': {
    en: 'Enable guided sessions',
    es: 'Activar sesiones guiadas',
  },
  'settings.guided.toggleHint': {
    en: 'Conversational reflection with your guide (Naikan, NVC, AAR). On-demand — no daily reminders.',
    es: 'Reflexión conversacional con tu guía (Naikan, CNV, AAR). A pedido — sin recordatorios diarios.',
  },
  'settings.guided.openSession': {
    en: 'Open Guided sessions',
    es: 'Abrir sesiones guiadas',
  },
  'guided.entry.cta': {
    en: 'Start a guided session',
    es: 'Comenzar sesión guiada',
  },

  // ── Plans notebook hero ──────────────────────────────────────
  'plans.notebookHero.title': { en: 'Plans', es: 'Planes' },
  'plans.notebookHero.description': {
    en: 'WOOP turns a wish into a plan in four steps: name your Wish, picture the Outcome, spot the Obstacle, write a small If-then. Mental contrasting + a concrete trigger is what separates intention from action.',
    es: 'WOOP convierte un deseo en un plan en cuatro pasos: nombra tu Deseo, imagina el Resultado, identifica el Obstáculo y escribe un pequeño Si-entonces. El contraste mental + un detonador concreto es lo que separa la intención de la acción.',
  },

  // ── Reschedule sheet ─────────────────────────────────────────
  'reschedule.title': { en: 'Reschedule task', es: 'Reprogramar tarea' },
  'reschedule.today': { en: 'Today', es: 'Hoy' },
  'reschedule.tomorrow': { en: 'Tomorrow', es: 'Mañana' },
  'reschedule.nextWeek': { en: 'Next week', es: 'Próxima semana' },
  'reschedule.pickDate': { en: 'Pick a date', es: 'Elige una fecha' },
  'reschedule.confirm': { en: 'Reschedule', es: 'Reprogramar' },

  // ── Settings: onboarding replay action + tools ───────────────
  'settings.tutorial.title': { en: 'Tutorial', es: 'Tutorial' },
  'settings.tutorial.replayAction': {
    en: 'Replay onboarding',
    es: 'Repetir bienvenida',
  },
  'settings.tutorial.replayHint': {
    en: 'Walk through the welcome tour and tab tips again.',
    es: 'Vuelve a recorrer el tour de bienvenida y las pistas de las pestañas.',
  },
  'settings.tools.title': { en: 'Tools', es: 'Herramientas' },
  'settings.tools.pulseReflection': {
    en: 'Pulse Reflection',
    es: 'Reflexión del Pulso',
  },
  'settings.tools.pulseReflectionHint': {
    en: 'Patterns and themes from your morning and evening Pulse entries.',
    es: 'Patrones y temas de tus entradas de Pulso matutinas y nocturnas.',
  },
  'settings.tools.habits': { en: 'Habits', es: 'Hábitos' },
  'settings.tools.habitsHint': {
    en: 'Track recurring practices.',
    es: 'Lleva el seguimiento de prácticas recurrentes.',
  },
  'settings.tools.templates': { en: 'Templates', es: 'Plantillas' },
  'settings.tools.templatesHint': {
    en: 'Browse and try guided journal templates.',
    es: 'Explora y prueba plantillas guiadas de diario.',
  },

  // ─── Ritual demo (post-onboarding 3-card walkthrough) ───
  'ritualDemo.skip': { en: 'Skip', es: 'Saltar' },
  'ritualDemo.next': { en: 'Next', es: 'Siguiente' },
  'ritualDemo.start': { en: "Let's begin", es: 'Comencemos' },
  'ritualDemo.stepOf': { en: '{cur} of {total}', es: '{cur} de {total}' },

  // Morning card
  'ritualDemo.morning.title': { en: 'Start with a question.', es: 'Empieza con una pregunta.' },
  'ritualDemo.morning.caption': {
    en: 'Each morning, set the tone for your day. One question. Two minutes.',
    es: 'Cada mañana, marca el tono de tu día. Una pregunta. Dos minutos.',
  },
  'ritualDemo.morning.exampleAnswer': {
    en: 'Today I want to feel focused, not scattered. The likely obstacle is interruption — when it comes, I close it for ninety minutes.',
    es: 'Hoy quiero sentirme concentrado, no disperso. El obstáculo probable es la interrupción — cuando llegue, la apago por noventa minutos.',
  },

  // Tasks card
  'ritualDemo.tasks.title': { en: 'Capture concrete actions.', es: 'Captura acciones concretas.' },
  'ritualDemo.tasks.caption': {
    en: 'Real to-dos go here — not in your morning Pulse. Keeps reflection from becoming a task list.',
    es: 'Las tareas reales van aquí — no en tu Pulso matutino. Evita que la reflexión se convierta en una lista de pendientes.',
  },
  'ritualDemo.tasks.example1': { en: 'Send the proposal to client', es: 'Enviar la propuesta al cliente' },
  'ritualDemo.tasks.example2': { en: 'Call mom', es: 'Llamar a mamá' },
  'ritualDemo.tasks.example3': { en: 'Block 90 min for deep work', es: 'Reservar 90 min para trabajo profundo' },

  // Evening card
  'ritualDemo.evening.title': { en: 'Close the loop.', es: 'Cierra el día.' },
  'ritualDemo.evening.caption': {
    en: 'End your day by noticing what fed you and what wasted you.',
    es: 'Termina el día notando qué te nutrió y qué te desgastó.',
  },
  'ritualDemo.evening.exampleWentRight': {
    en: 'Got the proposal out before lunch. Felt clear.',
    es: 'Saqué la propuesta antes del almuerzo. Me sentí claro.',
  },
  'ritualDemo.evening.exampleDoneBetter': {
    en: 'Lost an hour to email I could have batched at 5pm.',
    es: 'Perdí una hora con correos que pude haber agrupado a las 5pm.',
  },

  // Journal-only freeform card (replaces tasks card for journal-only users)
  'ritualDemo.journal.title': { en: 'Write what needs writing.', es: 'Escribe lo que necesita salir.' },
  'ritualDemo.journal.caption': {
    en: 'Beyond the daily Pulse, your Journal is for longer pieces — anything you want to think through.',
    es: 'Más allá del Pulso diario, tu Diario es para textos más largos — lo que quieras procesar.',
  },

  // Tasks-only single card
  'ritualDemo.tasksOnly.title': { en: 'Plan your day in one place.', es: 'Planifica tu día en un solo lugar.' },
  'ritualDemo.tasksOnly.caption': {
    en: 'Capture today\'s actions, organize them into lists, and let the day take shape.',
    es: 'Captura las acciones de hoy, organízalas en listas, y deja que el día tome forma.',
  },
};

export function t(key: string, params?: Record<string, string | number>): string {
  const locale = getLocale();
  let text = translations[key]?.[locale] ?? translations[key]?.en ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}
