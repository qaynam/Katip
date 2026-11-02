import { fileURLToPath } from "node:url"

/** E2E テストで Chrome に読み込ませる、本番ビルドの拡張の置き場所。 */
export const EXTENSION_DIR = fileURLToPath(new URL("../.e2e/extension", import.meta.url))
