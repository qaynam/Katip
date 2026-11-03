const escapeLinkText = (text: string): string => text.replace(/[\\[\]]/g, (char) => `\\${char}`)

// Not encodeURIComponent: it leaves parentheses unencoded
const percentEncoded = (char: string): string =>
  `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`

const escapeLinkDestination = (url: string): string => url.replace(/[() \t\n]/g, percentEncoded)

/** Formats the page as a Markdown link of the form `[title](URL)`. */
export const markdownLinkOf = (page: { readonly title: string; readonly url: string }): string => {
  const text = page.title.trim() === "" ? page.url : page.title
  return `[${escapeLinkText(text)}](${escapeLinkDestination(page.url)})`
}
