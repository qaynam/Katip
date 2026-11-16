import { describe, expect, it } from "vitest"
import {
  type ChromeWebStore,
  publishItem,
  STATUS_CHECK_INTERVAL_MS,
  STATUS_CHECKS,
  uploadPackage,
} from "./chrome-web-store.ts"

interface Reply {
  readonly status?: number
  readonly body: unknown
}

interface SentRequest {
  readonly url: string
  readonly method: string | undefined
  readonly headers: HeadersInit | undefined
  readonly body: unknown
}

/** A store answering each request with the next of `replies`, and the last one from then on. */
const storeAnswering = (...replies: ReadonlyArray<Reply>) => {
  const requests: Array<SentRequest> = []
  const sleeps: Array<number> = []
  const store: ChromeWebStore = {
    publisherId: "1234-publisher",
    itemId: "abcdefghijklmnopabcdefghijklmnop",
    accessToken: "token-from-google",
    fetch: (url, { method, headers, body }) => {
      requests.push({ url, method, headers, body })
      const { status = 200, body: replyBody } = replies[
        Math.min(requests.length, replies.length) - 1
      ] ?? {
        body: {},
      }
      return Promise.resolve(new Response(JSON.stringify(replyBody), { status }))
    },
    sleep: (milliseconds) => {
      sleeps.push(milliseconds)
      return Promise.resolve()
    },
  }
  return { store, requests, sleeps }
}

const ITEM = "publishers/1234-publisher/items/abcdefghijklmnopabcdefghijklmnop"
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04])

describe("uploadPackage", () => {
  it("posts the zip to the item's upload URI with the access token", async () => {
    const { store, requests } = storeAnswering({
      body: { uploadState: "SUCCEEDED", crxVersion: "1.9.0" },
    })

    await uploadPackage(store, ZIP, "1.9.0")

    expect(requests).toStrictEqual([
      {
        url: `https://chromewebstore.googleapis.com/upload/v2/${ITEM}:upload`,
        method: "POST",
        headers: { "content-type": "application/zip", authorization: "Bearer token-from-google" },
        body: ZIP,
      },
    ])
  })

  it("waits for a package the store is still processing, checking until the upload succeeds", async () => {
    const { store, requests, sleeps } = storeAnswering(
      { body: { uploadState: "IN_PROGRESS" } },
      { body: { lastAsyncUploadState: "IN_PROGRESS" } },
      { body: { lastAsyncUploadState: "SUCCEEDED" } },
    )

    await uploadPackage(store, ZIP, "1.9.0")

    expect([requests.slice(1).map(({ url, method }) => `${method} ${url}`), sleeps]).toStrictEqual([
      [
        `GET https://chromewebstore.googleapis.com/v2/${ITEM}:fetchStatus`,
        `GET https://chromewebstore.googleapis.com/v2/${ITEM}:fetchStatus`,
      ],
      [STATUS_CHECK_INTERVAL_MS, STATUS_CHECK_INTERVAL_MS],
    ])
  })

  it("fails when the store couldn't process the package", async () => {
    const { store } = storeAnswering({ body: { uploadState: "FAILED" } })

    await expect(uploadPackage(store, ZIP, "1.9.0")).rejects.toThrow("its upload is FAILED")
  })

  it("fails when a status check finds that the upload failed", async () => {
    const { store } = storeAnswering(
      { body: { uploadState: "IN_PROGRESS" } },
      { body: { lastAsyncUploadState: "FAILED" } },
    )

    await expect(uploadPackage(store, ZIP, "1.9.0")).rejects.toThrow("its upload is FAILED")
  })

  it("gives up on a package still being processed after the last status check", async () => {
    const { store, requests } = storeAnswering(
      { body: { uploadState: "IN_PROGRESS" } },
      { body: { lastAsyncUploadState: "IN_PROGRESS" } },
    )

    await expect(uploadPackage(store, ZIP, "1.9.0")).rejects.toThrow("its upload is IN_PROGRESS")
    expect(requests).toHaveLength(1 + STATUS_CHECKS)
  })

  it("fails with the store's reason when it refuses the package", async () => {
    const { store } = storeAnswering({
      status: 400,
      body: { error: { code: 400, message: "The version must be greater than 1.9.0." } },
    })

    await expect(uploadPackage(store, ZIP, "1.9.0")).rejects.toThrow(
      "400 The version must be greater than 1.9.0.",
    )
  })

  it("fails when the store read another version from the package than the one built", async () => {
    const { store } = storeAnswering({ body: { uploadState: "SUCCEEDED", crxVersion: "1.8.0" } })

    await expect(uploadPackage(store, ZIP, "1.9.0")).rejects.toThrow(
      "read version 1.8.0 from the package, not 1.9.0",
    )
  })
})

describe("publishItem", () => {
  it("submits the package for review, to be published once approved", async () => {
    const { store, requests } = storeAnswering({ body: { state: "PENDING_REVIEW" } })

    await publishItem(store, { staged: false })

    expect(requests).toStrictEqual([
      {
        url: `https://chromewebstore.googleapis.com/v2/${ITEM}:publish`,
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer token-from-google" },
        body: JSON.stringify({ publishType: "DEFAULT_PUBLISH" }),
      },
    ])
  })

  it("asks for the package to be staged once approved, when staged", async () => {
    const { store, requests } = storeAnswering({ body: { state: "PENDING_REVIEW" } })

    await publishItem(store, { staged: true })

    expect(requests.map(({ body }) => body)).toStrictEqual([
      JSON.stringify({ publishType: "STAGED_PUBLISH" }),
    ])
  })

  it("succeeds with a submission waiting for review", async () => {
    const { store } = storeAnswering({ body: { state: "PENDING_REVIEW" } })

    expect(await publishItem(store, { staged: false })).toStrictEqual({
      state: "PENDING_REVIEW",
      warnings: [],
    })
  })

  it("passes on what the store warns about", async () => {
    const { store } = storeAnswering({
      body: {
        state: "PENDING_REVIEW",
        warningInfo: {
          warnings: [{ reason: "SOME_REASON", description: "Something to look at." }],
        },
      },
    })

    expect((await publishItem(store, { staged: false })).warnings).toStrictEqual([
      "Something to look at.",
    ])
  })

  it.each(["REJECTED", "CANCELLED", "ITEM_STATE_UNSPECIFIED"])(
    "fails when the store leaves the submission %s",
    async (state) => {
      const { store } = storeAnswering({ body: { state } })

      await expect(publishItem(store, { staged: false })).rejects.toThrow(`it is ${state}`)
    },
  )

  it("fails with the store's reason when it refuses the submission", async () => {
    const { store } = storeAnswering({
      status: 400,
      body: { error: { code: 400, message: "Item is not ready to be published." } },
    })

    await expect(publishItem(store, { staged: false })).rejects.toThrow(
      "400 Item is not ready to be published.",
    )
  })
})
