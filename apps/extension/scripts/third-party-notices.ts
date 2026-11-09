import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

/**
 * The directory of the npm package a bundled module came from, or null for Katip's own modules.
 *
 * @param moduleId - A module ID as the bundler reports it, possibly with a query such as `?url`.
 */
export const packageRootOf = (moduleId: string): string | null => {
  const path = moduleId.split("?")[0] ?? ""
  const marker = "/node_modules/"
  const at = path.lastIndexOf(marker)
  if (at === -1) return null
  const rest = path.slice(at + marker.length).split("/")
  const nameParts = rest[0]?.startsWith("@") ? rest.slice(0, 2) : rest.slice(0, 1)
  if (nameParts.length === 0 || nameParts.some((part) => part === "")) return null
  return path.slice(0, at + marker.length) + nameParts.join("/")
}

interface PackageInfo {
  readonly name: string
  readonly version: string
  readonly license: string
  readonly licenseText: string | null
}

const LICENSE_FILE = /^(licen[cs]e|copying)(\.(md|txt))?$/i

const packageInfoOf = (root: string): PackageInfo => {
  const manifest: { name?: string; version?: string; license?: string } = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  )
  const licenseFile = readdirSync(root).find((file) => LICENSE_FILE.test(file))
  return {
    name: manifest.name ?? root,
    version: manifest.version ?? "unknown",
    license: manifest.license ?? "see the package",
    licenseText:
      licenseFile === undefined ? null : readFileSync(join(root, licenseFile), "utf8").trim(),
  }
}

/** Data bundled into the extension that isn't an npm package, such as the list of bangs. */
export interface DataNotice {
  /** What the data is and where it comes from. */
  readonly name: string
  readonly licenseText: string
}

/**
 * The notices for the npm packages bundled into the extension: each package's name, version,
 * license, and the license text it ships, sorted by name. The notices of bundled data follow, in
 * the order given.
 *
 * @remarks
 * Most of these licenses (MIT among them) require their copyright and permission notice to travel
 * with every copy of the code, and the zip uploaded to the Chrome Web Store is such a copy.
 */
export const thirdPartyNotices = (
  packageRoots: Iterable<string>,
  data: ReadonlyArray<DataNotice> = [],
): string => {
  const packages = [...new Set(packageRoots)]
    .filter((root) => existsSync(join(root, "package.json")))
    .map(packageInfoOf)
    .sort((left, right) => left.name.localeCompare(right.name))
  const sections = packages.map((info) =>
    [
      `${info.name} ${info.version} (${info.license})`,
      info.licenseText ??
        `No license file is included in the package; its license is ${info.license}.`,
    ].join("\n\n"),
  )
  const dataSections = data.map((notice) => `${notice.name}\n\n${notice.licenseText.trim()}`)
  return `${[
    "Katip includes the following third-party software.",
    ...sections,
    ...dataSections,
  ].join(`\n\n${"-".repeat(72)}\n\n`)}\n`
}
