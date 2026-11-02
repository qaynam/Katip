import type { CatalogSection } from "../../catalog"

export const options: CatalogSection<"options"> = {
  "options.documentTitle": "Ajustes de Katip",
  "options.title": "Ajustes",
  "options.loadFailed": "No se han podido cargar los ajustes. Vuelve a cargar la página.",
  "options.saved": "Guardado",
  "options.saveFailed":
    "No se ha podido guardar el cambio. Espera un momento y vuelve a intentarlo.",

  "options.language.label": "Idioma",
  "options.language.automatic": "Automático ({language})",
  "options.language.footnote": "En automático, se usa el idioma del navegador.",

  "options.tabs.heading": "Pestañas",
  "options.newTabsOnTop.label": "Mostrar las pestañas nuevas arriba",
  "options.newTabsOnTop.description":
    "Si se desactiva, las pestañas temporales siguen el orden de la barra de pestañas de Chrome y las nuevas se añaden al final.",
  "options.collapsedFolders.label":
    "Mostrar todas las pestañas abiertas en las carpetas contraídas",
  "options.collapsedFolders.description":
    "Si se desactiva, una carpeta contraída solo muestra su pestaña activa y las pestañas que hayas visto mientras estaba contraída.",
  "options.syncTabGroups.label": "Sincronizar los espacios con los grupos de pestañas de Chrome",
  "options.syncTabGroups.description":
    "Muestra cada espacio como un grupo de pestañas en cada ventana. Si cambias el nombre o el color de un grupo, el espacio no cambia y el grupo se restablece en la siguiente sincronización. Mientras se sincroniza, no se pueden crear carpetas dentro de otras carpetas.",
  "options.splitView.label": "Vista dividida",
  "options.splitView.available": "Disponible",
  "options.splitView.unavailable":
    "No disponible en este navegador (requiere Chrome 155 o posterior)",

  "options.autoArchive.heading": "Archivo",
  "options.autoArchive.label": "Archivar automáticamente las pestañas inactivas",
  "options.autoArchive.idleTime.label": "Archivar tras",
  "options.autoArchive.footnote":
    "Las pestañas temporales que no hayas visto durante este tiempo se cierran y se guardan en el archivo, desde donde puedes volver a abrirlas. Las pestañas fijadas, los Favoritos, las pestañas que reproducen audio y la pestaña que estás viendo nunca se cierran.",

  "options.shortcuts.label": "Combinaciones de teclas",
  "options.shortcuts.open": "Cambiar en Chrome",
  "options.shortcuts.openFailed":
    "No se ha podido abrir la página de combinaciones de teclas de Chrome.",
  "options.shortcuts.footnote":
    "Asigna teclas para abrir el panel lateral, Spotlight y otras acciones en la página de combinaciones de teclas de extensiones de Chrome.",

  "options.pageShortcuts.heading": "Atajos",
  "options.pageShortcuts.footnote":
    "Disponibles mientras ves una página web. Al activar uno, se solicita acceso a todos los sitios, que solo se usa para recibir estas teclas. No funcionan en las páginas chrome://, en la página Nueva pestaña ni en Chrome Web Store.",
  "options.pageShortcuts.denied":
    "No se permitió el acceso a todos los sitios, así que el atajo sigue desactivado.",

  "options.spotlight.heading": "Spotlight",
  "options.spotlight.history.label": "Buscar también en el historial",
  "options.spotlight.history.footnote":
    "Al activarlo, se solicita permiso para leer el historial de navegación. Al desactivarlo, se retira ese permiso.",
  "options.spotlight.history.denied": "No se permitió el acceso al historial de navegación.",

  "options.data.heading": "Datos",
  "options.data.export.label": "Exportar tus datos",
  "options.data.export.button": "Exportar",
  "options.data.export.footnote":
    "Guarda tus espacios, pestañas fijadas, pestañas abiertas, Favoritos y ajustes en un archivo JSON. No incluye el token de GitHub ni las pestañas archivadas.",
  "options.data.exported": "Exportado",
  "options.data.exportFailed":
    "No se han podido exportar los datos. Espera un momento y vuelve a intentarlo.",

  "options.version.label": "Versión",
  "options.sourceCode.label": "Código fuente",
}
