const escapeLinkText = (text: string): string => text.replace(/[\\[\]]/g, (char) => `\\${char}`)

// encodeURIComponent は丸括弧をエンコードしないので、文字コードから組み立てる
const percentEncoded = (char: string): string =>
  `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`

const escapeLinkDestination = (url: string): string => url.replace(/[() \t\n]/g, percentEncoded)

/** ページを `[タイトル](URL)` の形の Markdown のリンクにする。 */
export const markdownLinkOf = (page: { readonly title: string; readonly url: string }): string => {
  const text = page.title.trim() === "" ? page.url : page.title
  return `[${escapeLinkText(text)}](${escapeLinkDestination(page.url)})`
}
