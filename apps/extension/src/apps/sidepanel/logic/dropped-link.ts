import { Option } from "effect"

/** The data of a drag, by type, as `DataTransfer.getData` gives it: empty for a missing type. */
export interface DraggedData {
  readonly uriList: string
  readonly html: string
  readonly text: string
}

export interface DroppedLink {
  readonly url: string
  /** Blank when the drag tells of no text for the link, as for an image. */
  readonly title: string
}

/** Whether a drag carries a link, as from a page; told by its types alone, as during a drag. */
export const carriesLink = (types: ReadonlyArray<string>): boolean =>
  types.includes("text/uri-list")

const firstAddressOf = (uriList: string) =>
  Option.fromNullishOr(
    uriList
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line !== "" && !line.startsWith("#")),
  )

const linkTextOf = (html: string) =>
  new DOMParser().parseFromString(html, "text/html").querySelector("a")?.textContent?.trim() ?? ""

/**
 * The link a drag carries: the first address of its URI list, named by the text of the link in its
 * HTML, or by its plain text when that isn't the address again.
 */
export const droppedLinkOf = (data: DraggedData): Option.Option<DroppedLink> =>
  Option.map(firstAddressOf(data.uriList), (url) => {
    const linkText = linkTextOf(data.html)
    const text = data.text.trim()
    return { url, title: linkText !== "" ? linkText : text === url ? "" : text }
  })
