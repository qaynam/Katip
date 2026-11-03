import { preferredLanguage } from "./preferred-language.ts"

export interface Env {
  /** The built site, served by Cloudflare's static assets. */
  readonly ASSETS: { readonly fetch: (request: Request) => Promise<Response> }
}

const redirectToPreferredLanguage = (request: Request, url: URL) => {
  const language = preferredLanguage(request.headers.get("Accept-Language"))
  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL(`/${language}/${url.search}`, url).href,
      // The same URL answers differently per language, so caches must keep one answer per header
      Vary: "Accept-Language",
    },
  })
}

export default {
  fetch: async (request: Request, env: Env): Promise<Response> => {
    const url = new URL(request.url)
    return url.pathname === "/"
      ? redirectToPreferredLanguage(request, url)
      : env.ASSETS.fetch(request)
  },
}
