import { preferredLanguage } from "./preferred-language.ts"

export interface Env {
  /** The built site, served by Cloudflare's static assets. */
  readonly ASSETS: { readonly fetch: (request: Request) => Promise<Response> }
}

/** A request as Cloudflare hands it to the Worker, with the visitor's country looked up from their IP. */
export type IncomingRequest = Request & { readonly cf?: { readonly country?: string } }

const redirectToPreferredLanguage = (request: IncomingRequest, url: URL) => {
  const language = preferredLanguage(
    request.headers.get("Accept-Language"),
    request.cf?.country ?? null,
  )
  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL(`/${language}/${url.search}`, url).href,
      Vary: "Accept-Language",
      // Vary can name the header but not the country, so a cache keyed by it could hand one
      // country's answer to another
      "Cache-Control": "private, no-store",
    },
  })
}

export default {
  fetch: async (request: IncomingRequest, env: Env): Promise<Response> => {
    const url = new URL(request.url)
    return url.pathname === "/"
      ? redirectToPreferredLanguage(request, url)
      : env.ASSETS.fetch(request)
  },
}
