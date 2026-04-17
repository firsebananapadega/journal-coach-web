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
  'settings.templates': { en: 'Templates', es: 'Plantillas' },
  'settings.manageTemplates': { en: 'Manage Templates', es: 'Administrar plantillas' },
  'settings.activeOnHome': { en: '{count} active on home screen', es: '{count} activas en la pantalla de inicio' },
  'settings.appearance': { en: 'Appearance', es: 'Apariencia' },
  'settings.theme': { en: 'Theme', es: 'Tema' },
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
  'journal.yesterday': { en: 'yesterday', es: 'ayer' },
  'journal.dAgo': { en: '{n}d ago', es: 'hace {n}d' },

  // ─── Pulse ───
  'pulse.title': { en: 'Daily Pulse', es: 'Pulso del día' },
  'pulse.alive': { en: 'What moment today made you feel most alive?', es: '¿Qué momento de hoy te hizo sentir más vivo?' },
  'pulse.drained': { en: 'What moment today drained you?', es: '¿Qué momento de hoy te agotó?' },
  'pulse.save': { en: 'Save', es: 'Guardar' },
  'pulse.saved': { en: "Today's Pulse", es: 'Pulso de hoy' },
  'pulse.tapToRead': { en: 'tap to read', es: 'toca para leer' },
  'pulse.viewPatterns': { en: 'View your patterns', es: 'Ver tus patrones' },
  'pulse.patternsTitle': { en: 'Pulse Patterns', es: 'Patrones del pulso' },
  'pulse.analyzing': { en: 'Analyzing your patterns...', es: 'Analizando tus patrones...' },
  'pulse.aliveLabel': { en: 'Alive', es: 'Vivo' },
  'pulse.drainedLabel': { en: 'Drained', es: 'Agotado' },
  'pulse.entries': { en: '{count} entries', es: '{count} entradas' },

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
  'write.placeholder': { en: "What's on your mind?", es: '¿Qué tienes en mente?' },

  // ─── Priorities / Tasks ───
  'priorities.title': { en: 'Tasks & Groceries', es: 'Tareas y compras' },
  'priorities.today': { en: 'Today', es: 'Hoy' },
  'priorities.priorities': { en: 'Priorities', es: 'Prioridades' },
  'priorities.habits': { en: 'Habits', es: 'Hábitos' },
  'priorities.groceries': { en: 'Groceries', es: 'Compras' },
  'priorities.addTasks': { en: 'Add Tasks', es: 'Agregar tareas' },
  'priorities.processing': { en: 'Processing...', es: 'Procesando...' },
  'priorities.placeholder': { en: 'Add a priority...', es: 'Agrega una prioridad...' },
  'priorities.empty': { en: 'No tasks for today yet.', es: 'Aún no hay tareas para hoy.' },
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
