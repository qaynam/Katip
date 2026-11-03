import { describe, expect, it, vi } from "vitest"
import worker, { type Env } from "./index.ts"

const assetsAnswering = (body: string) => ({
  ASSETS: { fetch: vi.fn(async (_request: Request) => new Response(body)) },
})

const get = (url: string, env: Env, headers: Record<string, string> = {}) =>
  worker.fetch(new Request(url, { headers }), env)

describe("the site's Worker", () => {
  it("sends a visitor at the root to the Japanese pages when they prefer Japanese", async () => {
    const response = await get("https://katip.example/", assetsAnswering(""), {
      "Accept-Language": "ja,en;q=0.8",
    })

    expect(response.status).toBe(302)
    expect(response.headers.get("Location")).toBe("https://katip.example/ja/")
  })

  it("sends everyone else at the root to the English pages", async () => {
    const response = await get("https://katip.example/", assetsAnswering(""), {
      "Accept-Language": "de-DE,de;q=0.9",
    })

    expect(response.status).toBe(302)
    expect(response.headers.get("Location")).toBe("https://katip.example/en/")
  })

  it("redirects a visitor whose browser sends no Accept-Language to the English pages", async () => {
    const response = await get("https://katip.example/", assetsAnswering(""))

    expect(response.headers.get("Location")).toBe("https://katip.example/en/")
  })

  it("tells caches that the redirect depends on Accept-Language", async () => {
    const response = await get("https://katip.example/", assetsAnswering(""))

    expect(response.headers.get("Vary")).toBe("Accept-Language")
  })

  it("keeps the query string, so campaign links survive the redirect", async () => {
    const response = await get("https://katip.example/?ref=store", assetsAnswering(""), {
      "Accept-Language": "ja",
    })

    expect(response.headers.get("Location")).toBe("https://katip.example/ja/?ref=store")
  })

  it("leaves every other path to the static assets", async () => {
    const env = assetsAnswering("privacy page")

    const response = await get("https://katip.example/en/privacy/", env, {
      "Accept-Language": "ja",
    })

    expect(await response.text()).toBe("privacy page")
    expect(env.ASSETS.fetch).toHaveBeenCalledOnce()
  })
})
