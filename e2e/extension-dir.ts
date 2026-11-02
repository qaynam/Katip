import { fileURLToPath } from "node:url"

/** E2E テストで Chrome に読み込ませる、本番ビルドの拡張の置き場所。 */
export const EXTENSION_DIR = fileURLToPath(new URL("../.e2e/extension", import.meta.url))

/** ブラウザ API の契約を本物の Chrome で確かめる、テスト専用の拡張の置き場所。 */
export const CONTRACT_EXTENSION_DIR = fileURLToPath(
  new URL("../.e2e/contract-extension", import.meta.url),
)
