import type { CatalogSection } from "../../catalog"

export const options: CatalogSection<"options"> = {
  "options.documentTitle": "Ajustes de Katip",
  "options.title": "Ajustes",
  "options.loadFailed": "No se han podido cargar los ajustes. Vuelve a cargar la página.",
  "options.saved": "Guardado",
  "options.saveFailed":
    "No se ha podido guardar el cambio. Espera un momento y vuelve a intentarlo.",

  "options.general.heading": "General",
  "options.language.label": "Idioma",
  "options.language.automatic": "Automático ({language})",
  "options.language.footnote": "En automático, se usa el idioma del navegador.",
  "options.about.heading": "Acerca de Katip",
  "options.version.label": "Versión",
  "options.version.released": "Publicada el {date}",
  "options.updates.label": "Actualizaciones",
  "options.updates.check": "Buscar actualizaciones",
  "options.updates.checking": "Buscando…",
  "options.updates.upToDate": "Katip está actualizado.",
  "options.updates.available":
    "La versión {version} ya está disponible. Descárgala desde su página y cárgala sobre esta.",
  "options.updates.openRelease": "Abrir la página de la versión",
  "options.updates.failed":
    "No se pudo conectar con GitHub. Espera un momento y vuelve a intentarlo.",
  "options.updates.automatic.label": "Buscar actualizaciones automáticamente",
  "options.updates.automatic.description":
    "La primera vez que se abre el panel lateral tras iniciar el navegador, Katip consulta a GitHub su última versión y te avisa si es más reciente. No se envía ningún dato de Katip.",
  "options.github.label": "GitHub",

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

  "options.spotlight.heading": "Spotlight",
  "options.spotlight.history.label": "Buscar también en el historial",
  "options.spotlight.history.footnote":
    "Al activarlo, se solicita permiso para leer el historial de navegación. Al desactivarlo, se retira ese permiso.",
  "options.spotlight.history.denied": "No se permitió el acceso al historial de navegación.",

  "options.shortcuts.heading": "Atajos",
  "options.shortcuts.intro":
    "Las teclas se asignan en la página de combinaciones de teclas de extensiones de Chrome.",
  "options.shortcuts.open": "Cambiar en Chrome",
  "options.shortcuts.openFailed":
    "No se ha podido abrir la página de combinaciones de teclas de Chrome.",
  "options.shortcuts.notSet": "Sin asignar",
  "options.shortcuts.openAndMove.heading": "Abrir y moverse",
  "options.shortcuts.currentTab.heading": "Pestaña actual",
  "options.shortcuts.copy.footnote":
    "Un atajo de copia no hace nada mientras está desactivado. Para usar su tecla en otra cosa, quítala en la página de combinaciones de teclas de Chrome.",
  "options.commands.openSidePanel": "Abrir el panel lateral",
  "options.commands.openSpotlight": "Abrir Spotlight",
  "options.commands.nextTabInSpace": "Siguiente pestaña del espacio",
  "options.commands.previousTabInSpace": "Pestaña anterior del espacio",
  "options.commands.togglePin": "Fijar o dejar de fijar la pestaña",
  "options.commands.copyUrl": "Copiar URL",
  "options.commands.copyMarkdownLink": "Copiar URL como enlace Markdown",

  "options.data.heading": "Datos",
  "options.data.export.label": "Exportar tus datos",
  "options.data.export.button": "Exportar",
  "options.data.export.footnote":
    "Guarda tus espacios, pestañas fijadas, pestañas abiertas, Favoritos y ajustes en un archivo JSON. No incluye el token de GitHub ni las pestañas archivadas.",
  "options.data.exported": "Exportado",
  "options.data.exportFailed":
    "No se han podido exportar los datos. Espera un momento y vuelve a intentarlo.",

  "options.data.import.heading": "Importar",
  "options.data.import.arc.label": "Importar desde Arc",
  "options.data.import.arc.description":
    "Añade tus espacios de Arc con sus pestañas fijadas, carpetas y vistas divididas, y tus Favoritos.",
  "options.data.import.arc.file": "Archivo de la barra lateral de Arc",
  "options.data.import.katip.label": "Importar un archivo de Katip",
  "options.data.import.katip.description":
    "Añade los espacios, las pestañas fijadas y los Favoritos de un archivo exportado desde Katip.",
  "options.data.import.katip.file": "Archivo exportado de Katip",
  "options.data.import.choose": "Elegir archivo…",
  "options.data.import.footnote":
    "El archivo se lee en este dispositivo y nunca sale del navegador. Los espacios importados se añaden después de los tuyos, y no se cambia ni se elimina nada de lo que tienes.",
  "options.data.import.arcLocation.heading": "Dónde encontrar el archivo de Arc",
  "options.data.import.arcLocation.mac": "macOS",
  "options.data.import.arcLocation.macTip":
    "En el cuadro de diálogo de archivos, pulsa ⌘⇧G y pega esta ruta.",
  "options.data.import.arcLocation.windows": "Windows",
  "options.data.import.arcLocation.windowsTip":
    "En la carpeta de Packages cuyo nombre empieza por TheBrowserCompany.Arc_.",
  "options.data.import.arc.spaces": "Espacios que importar",
  "options.data.import.arc.untitledSpace": "Espacio sin nombre",
  "options.data.import.arc.profile.default": "Perfil predeterminado",
  "options.data.import.arc.profile.other": "Otro perfil",
  "options.data.import.arc.arrangement": "Cómo añadirlos",
  "options.data.import.arc.separate.label": "Espacios separados",
  "options.data.import.arc.separate.description":
    "Cada espacio de Arc pasa a ser un espacio propio.",
  "options.data.import.arc.combined.label": "Combinar en un solo espacio",
  "options.data.import.arc.combined.description":
    "Añade un espacio llamado {name}, con una carpeta para cada espacio de Arc. Si ya tienes un espacio llamado {name}, el nuevo lleva un número.",
  "options.data.import.preview.arcHeading": "Listo para importar desde Arc",
  "options.data.import.preview.katipHeading": "Listo para importar un archivo de Katip",
  "options.data.import.preview.added": "Se añadirá",
  "options.data.import.preview.adjusted": "Se adaptará a Katip",
  "options.data.import.preview.leftOut": "No se importará",
  "options.data.import.preview.spaces": { one: "{count} espacio", other: "{count} espacios" },
  "options.data.import.preview.pins": {
    one: "{count} pestaña fijada",
    other: "{count} pestañas fijadas",
  },
  "options.data.import.preview.folders": { one: "{count} carpeta", other: "{count} carpetas" },
  "options.data.import.preview.splits": {
    one: "{count} vista dividida",
    other: "{count} vistas divididas",
  },
  "options.data.import.preview.liveFolders": {
    one: "{count} carpeta en vivo",
    other: "{count} carpetas en vivo",
  },
  "options.data.import.preview.favorites": { one: "{count} Favorito", other: "{count} Favoritos" },
  "options.data.import.preview.flattenedFolders": {
    one: "{count} carpeta está anidada a más profundidad de la que permite Katip, así que su contenido pasa a la carpeta superior.",
    other:
      "{count} carpetas están anidadas a más profundidad de la que permite Katip, así que su contenido pasa a la carpeta superior.",
  },
  "options.data.import.preview.widerSplits": {
    one: "{count} vista dividida tiene más de dos pestañas. Las dos primeras siguen divididas y el resto pasan a ser pestañas fijadas justo después.",
    other:
      "{count} vistas divididas tienen más de dos pestañas. En cada una, las dos primeras siguen divididas y el resto pasan a ser pestañas fijadas justo después.",
  },
  "options.data.import.preview.temporaryTabs": {
    one: "{count} pestaña sin fijar, porque las pestañas sin fijar son temporales",
    other: "{count} pestañas sin fijar, porque las pestañas sin fijar son temporales",
  },
  "options.data.import.preview.favoritesAlreadySaved": {
    one: "{count} página que ya está en Favoritos",
    other: "{count} páginas que ya están en Favoritos",
  },
  "options.data.import.preview.nonWebLinks": {
    one: "{count} pestaña que no es una página web, porque solo se importan direcciones http y https",
    other:
      "{count} pestañas que no son páginas web, porque solo se importan direcciones http y https",
  },
  "options.data.import.preview.unsupportedItems": {
    one: "{count} elemento sin equivalente en Katip, como una nota o un tablero",
    other: "{count} elementos sin equivalente en Katip, como notas y tableros",
  },
  "options.data.import.preview.settings": "Los ajustes del archivo. Los tuyos no cambian.",
  "options.data.import.preview.nothing": "No hay nada que importar en este archivo.",
  "options.data.import.preview.noneChosen": "Elige al menos un espacio que importar.",
  "options.data.import.preview.addOnly":
    "Solo se añaden espacios nuevos. Ninguno de tus espacios se renombra, se combina con otro ni se elimina.",
  "options.data.import.addFavorites.label": "Añadir a Favoritos",
  "options.data.import.addFavorites.description":
    "Se añaden después de los Favoritos que ya tienes, cerrados hasta que los abras.",
  "options.data.import.addFavorites.descriptionByProfile":
    "Se añaden después de los Favoritos que ya tienes, cerrados hasta que los abras. Solo se añaden los Favoritos de los perfiles de los espacios que elegiste.",
  "options.data.import.confirm": "Importar",
  "options.data.import.cancel": "Cancelar",
  "options.data.import.problem.notArc":
    "Este no es el archivo de la barra lateral de Arc. Elige StorableSidebar.json.",
  "options.data.import.problem.katipFileChosen":
    "Este es un archivo exportado desde Katip. Usa Importar un archivo de Katip.",
  "options.data.import.problem.notKatip": "Este no es un archivo exportado desde Katip.",
  "options.data.import.problem.arcFileChosen":
    "Este es el archivo de la barra lateral de Arc. Usa Importar desde Arc.",
  "options.data.import.problem.newerVersion":
    "Este archivo se exportó desde una versión más reciente de Katip. Actualiza Katip y vuelve a intentarlo.",
  "options.data.import.problem.malformed": "Este archivo de Katip está dañado y no se puede leer.",
  "options.data.import.problem.unreadable": "No se ha podido leer el archivo.",
  "options.data.import.problem.unavailable":
    "No se ha podido preparar la importación. Espera un momento y vuelve a intentarlo.",
  "options.data.imported": "Importado",
  "options.data.importFailed":
    "No se ha podido terminar la importación. Los espacios añadidos antes de que se detuviera se conservan.",
}
