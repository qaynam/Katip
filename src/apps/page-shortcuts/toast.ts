import { showPageToast } from "#modules/page-shortcuts"

/** ページの下中央に、短い知らせをしばらく出す。前の知らせが残っていれば置き換える。 */
export const showToast = (document: Document, text: string) => showPageToast(text, document)
