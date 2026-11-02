import type { CatalogSection } from "../../catalog"

export const manifest: CatalogSection<"manifest"> = {
  "manifest.description": "Organiza tus pestañas en espacios desde el panel lateral",
  "manifest.command.openSidePanel": "Abrir el panel lateral",
  "manifest.command.openSpotlight":
    "Abrir Spotlight para buscar pestañas, elementos fijados y espacios",
  "manifest.command.copyUrl":
    "Copiar la URL de la pestaña activa (actívalo en los ajustes de Katip)",
  "manifest.command.copyMarkdownLink":
    "Copiar la URL de la pestaña activa como enlace Markdown (actívalo en los ajustes de Katip)",
  "manifest.command.togglePin": "Fijar o dejar de fijar la pestaña activa",
  "manifest.command.nextTabInSpace": "Ir a la siguiente pestaña del espacio",
  "manifest.command.previousTabInSpace": "Ir a la pestaña anterior del espacio",
}
