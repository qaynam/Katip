// Nothing but Node's own modules: the workflow that holds the store's access token runs this
// without installing dependencies, so no package's code shares a job with the token

/** The item to change, and what to reach the Chrome Web Store API with. */
export interface ChromeWebStore {
  readonly publisherId: string
  readonly itemId: string
  /** An OAuth 2.0 access token with the `https://www.googleapis.com/auth/chromewebstore` scope. */
  readonly accessToken: string
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>
  readonly sleep: (milliseconds: number) => Promise<void>
}

const API_ORIGIN = "https://chromewebstore.googleapis.com"

export const STATUS_CHECK_INTERVAL_MS = 5_000
export const STATUS_CHECKS = 60

// Not just refusing REJECTED and CANCELLED: a state the API adds later mustn't pass for a submission
const SUBMITTED_STATES: ReadonlyArray<unknown> = [
  "PENDING_REVIEW",
  "STAGED",
  "PUBLISHED",
  "PUBLISHED_TO_TESTERS",
]

type Reply = Readonly<Record<string, unknown>>

const replyOf = (body: string): Reply => {
  try {
    const parsed: unknown = JSON.parse(body)
    return typeof parsed === "object" && parsed !== null ? (parsed as Reply) : {}
  } catch {
    return {}
  }
}

const errorMessageOf = (reply: Reply): string | undefined => {
  const { error } = reply
  return typeof error === "object" && error !== null && "message" in error
    ? String(error.message)
    : undefined
}

const itemPathOf = ({ publisherId, itemId }: ChromeWebStore) =>
  `publishers/${encodeURIComponent(publisherId)}/items/${encodeURIComponent(itemId)}`

interface Call {
  readonly method: "GET" | "POST"
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: BodyInit | null
}

const call = async (
  store: ChromeWebStore,
  attempt: string,
  url: string,
  { method, headers = {}, body = null }: Call,
): Promise<Reply> => {
  const response = await store.fetch(url, {
    method,
    headers: { ...headers, authorization: `Bearer ${store.accessToken}` },
    body,
  })
  const text = await response.text()
  const reply = replyOf(text)
  if (!response.ok) {
    throw new Error(
      `The Chrome Web Store refused to ${attempt}: ${response.status} ${errorMessageOf(reply) ?? text}`,
    )
  }
  return reply
}

const settledUploadState = async (
  store: ChromeWebStore,
  state: unknown,
  checksLeft: number,
): Promise<unknown> => {
  if (state !== "IN_PROGRESS" || checksLeft === 0) return state
  await store.sleep(STATUS_CHECK_INTERVAL_MS)
  const status = await call(
    store,
    "tell how the upload went",
    `${API_ORIGIN}/v2/${itemPathOf(store)}:fetchStatus`,
    { method: "GET" },
  )
  return settledUploadState(store, status["lastAsyncUploadState"], checksLeft - 1)
}

/**
 * Uploads `zip` as the item's new package, resolving once the store has taken it in. The package
 * waits in the Developer Dashboard until it is submitted for review, as {@link publishItem} does.
 *
 * @param version - The version the package's manifest gives, checked against the one the store
 * read from it.
 * @throws Error when the store refuses the package, fails to process it or reads another version
 * from it, or is still processing it after {@link STATUS_CHECKS} checks.
 */
export const uploadPackage = async (
  store: ChromeWebStore,
  zip: Uint8Array<ArrayBuffer>,
  version: string,
): Promise<void> => {
  const uploaded = await call(
    store,
    "take the package",
    `${API_ORIGIN}/upload/v2/${itemPathOf(store)}:upload`,
    { method: "POST", headers: { "content-type": "application/zip" }, body: zip },
  )
  const state = await settledUploadState(store, uploaded["uploadState"], STATUS_CHECKS)
  if (state !== "SUCCEEDED") {
    throw new Error(`The Chrome Web Store didn't take the package: its upload is ${String(state)}`)
  }
  const { crxVersion } = uploaded
  if (crxVersion !== undefined && crxVersion !== version) {
    throw new Error(
      `The Chrome Web Store read version ${String(crxVersion)} from the package, not ${version}`,
    )
  }
}

export interface Submission {
  /** The item's state after the submission, such as `PENDING_REVIEW`. */
  readonly state: string
  /** What the store warns about without refusing the submission. */
  readonly warnings: ReadonlyArray<string>
}

const warningsOf = ({ warningInfo }: Reply): ReadonlyArray<string> => {
  const warnings =
    typeof warningInfo === "object" && warningInfo !== null && "warnings" in warningInfo
      ? warningInfo.warnings
      : []
  return Array.isArray(warnings)
    ? warnings.map((warning) =>
        typeof warning === "object" && warning !== null && "description" in warning
          ? String(warning.description)
          : JSON.stringify(warning),
      )
    : []
}

/**
 * Submits the uploaded package for review. Once approved it is published, or with `staged` kept
 * until it is published by hand from the Developer Dashboard.
 *
 * @returns The submission as the store has it, usually waiting for review.
 * @throws Error when the store refuses the submission, or rejects or cancels it at once.
 */
export const publishItem = async (
  store: ChromeWebStore,
  { staged }: { readonly staged: boolean },
): Promise<Submission> => {
  const published = await call(
    store,
    "submit the package",
    `${API_ORIGIN}/v2/${itemPathOf(store)}:publish`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ publishType: staged ? "STAGED_PUBLISH" : "DEFAULT_PUBLISH" }),
    },
  )
  const { state } = published
  if (!SUBMITTED_STATES.includes(state)) {
    throw new Error(`The Chrome Web Store didn't take the submission: it is ${String(state)}`)
  }
  return { state: String(state), warnings: warningsOf(published) }
}
