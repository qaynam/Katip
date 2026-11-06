import { Option, Schema } from "effect"

/** A version of Katip published on GitHub. */
export const Release = Schema.Struct({
  /** Like the manifest's version, such as `1.2.0`, without the tag's leading `v`. */
  version: Schema.String,
  /** The release's page on GitHub, with its notes and its zip. */
  pageUrl: Schema.String,
  /** An ISO 8601 date and time. Null for a release GitHub gives no date. */
  publishedAt: Schema.NullOr(Schema.String),
})
export type Release = typeof Release.Type

export const REPOSITORY_URL = "https://github.com/qaynam/Katip"

/** GitHub's API for the latest release that is neither a draft nor a pre-release. */
export const LATEST_RELEASE_API_URL = "https://api.github.com/repos/qaynam/Katip/releases/latest"

// The page is opened from Katip's own UI, so a response pointing anywhere else is refused
const RELEASE_PAGE_PREFIX = `${REPOSITORY_URL}/releases/`

const VERSION = /^v?(\d+(?:\.\d+){0,3})$/

const GitHubRelease = Schema.Struct({
  tag_name: Schema.String,
  html_url: Schema.String,
  published_at: Schema.NullOr(Schema.String),
})

const decodeGitHubRelease = Schema.decodeUnknownOption(Schema.fromJsonString(GitHubRelease))

/**
 * The release in the body of a reply from {@link LATEST_RELEASE_API_URL}. None when the body isn't
 * a release, its tag isn't a version, or its page isn't on Katip's repository.
 */
export const releaseOfResponse = (body: string): Option.Option<Release> =>
  Option.flatMap(decodeGitHubRelease(body), (release) => {
    const version = VERSION.exec(release.tag_name)?.[1]
    return version === undefined || !release.html_url.startsWith(RELEASE_PAGE_PREFIX)
      ? Option.none()
      : Option.some({ version, pageUrl: release.html_url, publishedAt: release.published_at })
  })

const partsOf = (version: string) => version.split(".").map(Number)

/**
 * Whether `candidate` is a later version than `installed`. Versions are compared part by part as
 * numbers, a missing part counting as 0, so `1.10` is later than `1.9` and `1.2` equals `1.2.0`.
 */
export const isLaterVersion = (candidate: string, installed: string): boolean => {
  const [later, earlier] = [partsOf(candidate), partsOf(installed)]
  for (let index = 0; index < Math.max(later.length, earlier.length); index++) {
    const difference = (later[index] ?? 0) - (earlier[index] ?? 0)
    if (difference !== 0) return difference > 0
  }
  return false
}
