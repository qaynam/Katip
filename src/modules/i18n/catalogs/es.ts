import type { Catalog } from "../catalog"

export const es: Catalog = {
  "common.home": "Inicio",
  "common.spaceNumbered": "Espacio {n}",
  "common.newFolder": "Nueva carpeta",
  "common.newTab": "Nueva pestaña",
  "common.tabCount": { one: "{count} pestaña", other: "{count} pestañas" },
  "common.cancel": "Cancelar",
  "common.close": "Cerrar",
  "common.delete": "Eliminar",
  "common.rename": "Cambiar nombre",
  "common.duration.minute": { one: "{count} minuto", other: "{count} minutos" },
  "common.duration.hour": { one: "{count} hora", other: "{count} horas" },
  "common.duration.day": { one: "{count} día", other: "{count} días" },
  "common.duration.week": { one: "{count} semana", other: "{count} semanas" },

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

  "options.version.label": "Versión",

  "actions.copyUrl": "Copiar URL",
  "actions.copyMarkdownLink": "Copiar URL como enlace Markdown",
  "actions.pinTab": "Fijar pestaña",
  "actions.unpinTab": "Dejar de fijar pestaña",
  "actions.duplicateTab": "Duplicar pestaña",
  "actions.closeTab": "Cerrar pestaña",
  "actions.muteTab": "Silenciar pestaña",
  "actions.unmuteTab": "Activar sonido de la pestaña",
  "actions.moveTabToSpace": "Mover pestaña a {space}",
  "actions.closeTemporaryTabs": "Cerrar todas las pestañas temporales",
  "actions.openSettings": "Abrir ajustes",
  "actions.copied.url": "URL copiada",
  "actions.copied.markdownLink": "Enlace Markdown copiado",
  "actions.copyFailed": "No se pudo copiar",
}
