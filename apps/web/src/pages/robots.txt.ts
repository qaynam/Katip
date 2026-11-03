import type { APIRoute } from "astro"
import { absoluteUrl } from "../routes.ts"

export const GET: APIRoute = () =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl("/sitemap-index.xml")}\n`)
