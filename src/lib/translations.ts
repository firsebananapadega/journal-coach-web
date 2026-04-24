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
  'common.back': { en: 'Back', es: 'Atrás' },
  'common.cancel': { en: 'Cancel', es: 'Cancelar' },
  'common.delete': { en: 'Delete', es: 'Eliminar' },
  'common.add': { en: 'Add', es: 'Agregar' },
  'common.save': { en: 'Save', es: 'Guardar' },
  'common.saving': { en: 'Saving...', es: 'Guardando...' },
  'common.edit': { en: 'Edit', es: 'Editar' },
  'common.change': { en: 'Change', es: 'Cambiar' },
  'common.next': { en: 'Next', es: 'Siguiente' },
  'common.previous': { en: 'Previous', es: 'Anterior' },
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
  'tab.groceries': { en: 'Groceries', es: 'Despensa' },
  'tab.pulse': { en: 'Pulse', es: 'Pulso' },
  'tab.history': { en: 'History', es: 'Historial' },
  'tab.patterns': { en: 'Patterns', es: 'Patrones' },
  'tab.capture': { en: 'Capture', es: 'Capturar' },
  'tab.guide': { en: 'Guide', es: 'Guía' },
  'tab.journal': { en: 'Journal', es: 'Diario' },
  'tab.notebooks': { en: 'Notebooks', es: 'Cuadernos' },

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
  'matrix.q1.title': { en: 'Do', es: 'Hacer' },
  'matrix.q1.subtitle': { en: 'Urgent + Important', es: 'Urgente + Importante' },
  'matrix.q2.title': { en: 'Schedule', es: 'Programar' },
  'matrix.q2.subtitle': { en: 'Important, not urgent', es: 'Importante, no urgente' },
  'matrix.q3.title': { en: 'Delegate', es: 'Delegar' },
  'matrix.q3.subtitle': { en: 'Urgent, not important', es: 'Urgente, no importante' },
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
    en: 'Talk freely — priorities, plans, groceries, ideas…',
    es: 'Habla libremente — tareas, eventos, despensa, ideas…',
  },
  'groceries.placeholder': { en: 'Add a grocery item…', es: 'Agregar artículo…' },
  'groceries.empty': {
    en: 'Your grocery list is empty. Add an item below or tap the mic to speak.',
    es: 'Tu lista de compras está vacía. Agrega un artículo abajo o toca el micrófono para hablar.',
  },
  'groceries.addToStore': {
    en: 'Add to {store}',
    es: 'Agregar a {store}',
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
  // Morning pulse
  'pulse.morning.q1': { en: "What's the one thing that would make today feel like a win?", es: '¿Cuál es la cosa que haría que hoy se sienta como un logro?' },
  'pulse.morningDone': { en: 'Morning Pulse', es: 'Pulso matutino' },
  'pulse.morningSaved': { en: 'Morning intention saved', es: 'Intención matutina guardada' },
  'pulse.eveningSaved': { en: 'Evening reflection saved', es: 'Reflexión nocturna guardada' },
  'pulse.intentionLabel': { en: 'Intention', es: 'Intención' },
  // Evening pulse
  'pulse.evening.q1': { en: 'What went right today?', es: '¿Qué salió bien hoy?' },
  'pulse.evening.q2': { en: 'What could you have done better today?', es: '¿Qué podrías haber hecho mejor hoy?' },
  'pulse.eveningDone': { en: 'Evening Pulse', es: 'Pulso nocturno' },
  'pulse.wentRightLabel': { en: 'Went right', es: 'Salió bien' },
  'pulse.doneBetterLabel': { en: 'Done better', es: 'Mejorar' },

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

  // ─── Plans ───
  'plans.title': { en: 'Plans', es: 'Planes' },
  'plans.today': { en: 'Today', es: 'Hoy' },
  'plans.placeholder': { en: 'Add a plan...', es: 'Agrega un plan...' },
  'plans.addPlans': { en: 'Add Plans', es: 'Agregar planes' },
  'plans.processing': { en: 'Processing...', es: 'Procesando...' },
  'plans.empty': { en: 'No plans for today yet.', es: 'Aún no hay planes para hoy.' },
  'plans.noTime': { en: 'No time set', es: 'Sin hora' },
  'plans.plans': { en: 'Plans', es: 'Planes' },
  'plans.editPlan': { en: 'Edit Plan', es: 'Editar plan' },
  'plans.time': { en: 'Time', es: 'Hora' },
  'plans.titleLabel': { en: 'Title', es: 'Título' },
  'plans.locationLabel': { en: 'Location', es: 'Ubicación' },
  'plans.subtasks': { en: 'Subtasks', es: 'Subtareas' },
  'plans.addSubtask': { en: 'Add subtask', es: 'Agregar subtarea' },
  'plans.saveChanges': { en: 'Save Changes', es: 'Guardar cambios' },
  'plans.noTimeSet': { en: 'No time', es: 'Sin hora' },
  'plans.subtaskPlaceholder': { en: 'Subtask...', es: 'Subtarea...' },
  'plans.monthView': { en: 'Monthly', es: 'Mensual' },
  'plans.weekView': { en: 'Weekly', es: 'Semanal' },

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

  // ─── Onboarding v3: welcome / install / tour ───
  'onboarding.welcome.headline': { en: 'Welcome to your practice.', es: 'Bienvenido a tu práctica.' },
  'onboarding.welcome.body': {
    en: 'Journaling is a quiet art. The page is yours — nobody reads it. That’s what makes it honest.',
    es: 'El diario es un arte silencioso. La página es tuya — nadie la lee. Por eso puede ser honesta.',
  },
  'onboarding.welcome.cta': { en: 'Continue', es: 'Continuar' },
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
  'onboarding.install.iosTitle': { en: 'Add me to your home screen', es: 'Agrégame a tu pantalla de inicio' },
  'onboarding.install.iosBody': {
    en: 'Tap the Share icon, then "Add to Home Screen." Open it from there and we’re set.',
    es: 'Toca el ícono de Compartir y luego "Añadir a pantalla de inicio". Ábrelo desde ahí y listo.',
  },
  'onboarding.install.iosStep1': { en: 'Tap the Share icon', es: 'Toca Compartir' },
  'onboarding.install.iosStep2': { en: '"Add to Home Screen"', es: '"Añadir a pantalla de inicio"' },
  'onboarding.install.iosStep3': { en: 'Tap Add', es: 'Toca Añadir' },
  'onboarding.install.androidTitle': { en: 'Install as an app', es: 'Instala como app' },
  'onboarding.install.androidBody': {
    en: 'Your phone will ask permission — say yes.',
    es: 'Tu teléfono te pedirá permiso — di que sí.',
  },
  'onboarding.install.androidCta': { en: 'Install', es: 'Instalar' },
  'onboarding.install.androidStep1': { en: 'Open the Chrome menu', es: 'Abre el menú de Chrome' },
  'onboarding.install.androidStep2': { en: 'Tap "Install app"', es: 'Toca "Instalar app"' },
  'onboarding.install.added': { en: 'I added it', es: 'Ya lo agregué' },
  'onboarding.install.skip': { en: 'Skip for now', es: 'Saltar por ahora' },
  'onboarding.install.installed': { en: 'Already installed — nice.', es: 'Ya está instalado — qué bien.' },
  'onboarding.name.title': { en: 'And you are?', es: '¿Y tú eres?' },
  'onboarding.name.subtitle': {
    en: 'Just a first name. You can change it later.',
    es: 'Solo tu nombre. Puedes cambiarlo después.',
  },
  'tour.showMe': { en: 'Show me', es: 'Muéstrame' },
  'tour.skip': { en: 'Skip', es: 'Saltar' },
  'tour.next': { en: 'Next', es: 'Siguiente' },
  'tour.done': { en: 'Thanks', es: 'Gracias' },
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
