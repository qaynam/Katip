import type { CatalogSection } from "../../catalog"

export const onboarding: CatalogSection<"onboarding"> = {
  "onboarding.documentTitle": "Te damos la bienvenida a Katip",
  "onboarding.progress": "Paso {current} de {total}",
  "onboarding.continue": "Continuar",
  "onboarding.back": "Atrás",
  "onboarding.skip": "Omitir",

  "onboarding.welcome.title": "Te damos la bienvenida a Katip",
  "onboarding.welcome.lead":
    "Espacios, pestañas fijadas y Spotlight, en el panel lateral de Chrome. Configurarlo lleva un minuto.",
  "onboarding.welcome.start": "Empezar",

  "onboarding.sidePanel.title": "Katip vive en el panel lateral",
  "onboarding.sidePanel.body":
    "Haz clic en el icono de Katip en la barra de herramientas para abrirlo. Para tenerlo siempre a la vista, fíjalo desde el menú de extensiones, el de la pieza de puzle.",
  "onboarding.sidePanel.shortcut": "O pulsa",
  "onboarding.sidePanel.open": "Abrir el panel lateral",

  "onboarding.shortcuts.title": "Revisa tus atajos",
  "onboarding.shortcuts.body":
    "Chrome solo da una tecla a la primera extensión que la pide. Si otra extensión llegó antes, el atajo de Katip queda sin asignar, aunque la página de atajos de Chrome lo siga mostrando.",
  "onboarding.shortcuts.notSet": "Sin asignar",
  "onboarding.shortcuts.refused":
    "Chrome no le dio {key} a Katip, seguramente porque otra extensión la usa.",
  "onboarding.shortcuts.copyNote":
    "Los atajos para copiar no hacen nada hasta que los activas aquí.",
  "onboarding.shortcuts.edit": "Editar en Chrome",

  "onboarding.arcImport.title": "¿Vienes de Arc?",
  "onboarding.arcImport.body":
    "Trae tus espacios con sus pestañas fijadas, carpetas y vistas divididas, y tus Favoritos. Eliges el archivo de la barra lateral de Arc en la configuración y se lee en tu propio navegador.",
  "onboarding.arcImport.open": "Importar de Arc…",

  "onboarding.favorites.title": "Favoritos, en todos los espacios",
  "onboarding.favorites.body":
    "Arrastra una pestaña a la parte superior del panel lateral, o haz clic derecho y elige Añadir a Favoritos. Los Favoritos siguen ahí en cualquier espacio.",

  "onboarding.themes.title": "Un color para cada espacio",
  "onboarding.themes.body":
    "Abre el menú del espacio junto a su nombre y elige Editar tema. El panel lateral toma el color que elijas, así distingues tus espacios de un vistazo.",

  "onboarding.liveFolders.title": "Carpetas que se mantienen al día solas",
  "onboarding.liveFolders.body":
    "Elige Añadir carpeta en vivo en el menú del espacio para seguir tu correo sin leer de Gmail, o tus solicitudes de revisión, pull requests, issues y menciones de GitHub. Se actualizan solas.",

  "onboarding.bangs.title": "Busca en cualquier sitio con un bang",
  "onboarding.bangs.body":
    "En Spotlight, escribe ! y el atajo de un sitio, como !gh katip para GitHub o !w para Wikipedia. Puedes añadir tus propios comandos en la configuración.",

  "onboarding.done.title": "Todo listo",
  "onboarding.done.body": "Puedes volver a ver este recorrido desde la configuración de Katip.",
  "onboarding.done.openKatip": "Abrir Katip",
  "onboarding.done.close": "Cerrar",
}
