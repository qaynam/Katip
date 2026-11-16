import { Option } from "effect"
import { searchableTitle, searchableUrl, searchTerms, typoMatcherFor } from "#modules/spotlight"
import { sourceHostOf, type Download } from "./downloads"

export type DownloadKind = "Image" | "Video" | "Audio" | "Document" | "Archive" | "Other"

export const DOWNLOAD_KINDS: ReadonlyArray<DownloadKind> = [
  "Image",
  "Video",
  "Audio",
  "Document",
  "Archive",
  "Other",
]

/** Which downloads to list: those of one kind, or all. */
export type DownloadKindFilter = DownloadKind | "All"

const extensionsByKind: ReadonlyArray<readonly [DownloadKind, ReadonlyArray<string>]> = [
  [
    "Image",
    [
      "jpg",
      "jpeg",
      "png",
      "gif",
      "webp",
      "heic",
      "heif",
      "avif",
      "bmp",
      "tif",
      "tiff",
      "svg",
      "ico",
    ],
  ],
  ["Video", ["mp4", "m4v", "mov", "avi", "mkv", "webm", "wmv", "flv", "mpg", "mpeg", "3gp"]],
  [
    "Audio",
    ["mp3", "m4a", "aac", "wav", "flac", "ogg", "oga", "opus", "aif", "aiff", "wma", "mid"],
  ],
  [
    "Document",
    [
      "pdf",
      "doc",
      "docx",
      "xls",
      "xlsx",
      "ppt",
      "pptx",
      "odt",
      "ods",
      "odp",
      "rtf",
      "txt",
      "md",
      "csv",
      "tsv",
      "pages",
      "numbers",
      "key",
      "epub",
    ],
  ],
  ["Archive", ["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "zst", "dmg", "iso"]],
]

const kindByExtension: ReadonlyMap<string, DownloadKind> = new Map(
  extensionsByKind.flatMap(([kind, extensions]) =>
    extensions.map((extension) => [extension, kind] as const),
  ),
)

const documentMimes = [
  "application/pdf",
  "application/msword",
  "application/rtf",
  "application/epub+zip",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "text/plain",
  "text/csv",
  "text/markdown",
]

const documentMimePrefixes = [
  "application/vnd.openxmlformats-officedocument.",
  "application/vnd.oasis.opendocument.",
]

const archiveMimes = [
  "application/zip",
  "application/x-zip-compressed",
  "application/x-7z-compressed",
  "application/x-rar-compressed",
  "application/vnd.rar",
  "application/gzip",
  "application/x-gzip",
  "application/x-tar",
  "application/x-bzip2",
  "application/x-xz",
  "application/zstd",
  "application/x-apple-diskimage",
]

const kindOfMime = (mime: string): Option.Option<DownloadKind> => {
  const type = mime.toLowerCase().split(";")[0]?.trim() ?? ""
  if (type.startsWith("image/")) return Option.some("Image")
  if (type.startsWith("video/")) return Option.some("Video")
  if (type.startsWith("audio/")) return Option.some("Audio")
  if (documentMimes.includes(type) || documentMimePrefixes.some((p) => type.startsWith(p))) {
    return Option.some("Document")
  }
  return archiveMimes.includes(type) ? Option.some("Archive") : Option.none()
}

const extensionOf = (fileName: string) => {
  const dot = fileName.lastIndexOf(".")
  return dot <= 0 ? "" : fileName.slice(dot + 1).toLowerCase()
}

/**
 * What kind of file a download is, by its file name's extension, or by its MIME type when the
 * extension doesn't tell.
 *
 * @remarks
 * The extension comes first: servers often send a generic type, or a zip type for Office
 * documents, which are zip files inside.
 */
export const downloadKindOf = (download: Pick<Download, "fileName" | "mime">): DownloadKind =>
  Option.getOrElse(
    Option.orElse(Option.fromNullishOr(kindByExtension.get(extensionOf(download.fileName))), () =>
      kindOfMime(download.mime),
    ),
    () => "Other",
  )

const termMatcher = (term: string) => {
  const typoMatcher = typoMatcherFor(term)
  return (text: string) =>
    text.includes(term) || Option.exists(typoMatcher, (matchesTypo) => matchesTypo(text))
}

/**
 * The downloads of the kind whose file name or source host holds every word of the query,
 * forgiving a typo or two in longer words as the Command Palette does, in the order given.
 */
export const searchDownloads = (
  downloads: ReadonlyArray<Download>,
  query: string,
  kind: DownloadKindFilter,
): ReadonlyArray<Download> => {
  const matchers = searchTerms(query).map(termMatcher)
  return downloads.filter((download) => {
    if (kind !== "All" && downloadKindOf(download) !== kind) return false
    if (matchers.length === 0) return true
    const texts = [
      searchableTitle(download.fileName),
      searchableUrl(Option.getOrElse(sourceHostOf(download.url), () => "")),
    ]
    return matchers.every((matches) => texts.some(matches))
  })
}
