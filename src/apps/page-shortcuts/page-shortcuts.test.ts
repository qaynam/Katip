// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { ENABLED_PAGE_SHORTCUTS_KEY, PAGE_SHORTCUT_PORT_NAME } from "#modules/page-shortcuts"
import {
  type ExtensionApi,
  type ExtensionPort,
  installPageShortcuts,
  keyboardPlatformOf,
} from "./page-shortcuts"

interface OpenedPort {
  readonly name: string
  readonly posted: Array<unknown>
  reply(message: unknown): void
}

const fakeExtension = (stored: unknown) => {
  const ports: Array<OpenedPort> = []
  const changeListeners = new Set<(changes: Record<string, { newValue?: unknown }>) => void>()
  const runtime: { id: string | undefined; connect: ExtensionApi["runtime"]["connect"] } = {
    id: "katip",
    connect: ({ name }) => {
      const posted: Array<unknown> = []
      const listeners: Array<(message: unknown) => void> = []
      const port: ExtensionPort = {
        postMessage: (message) => posted.push(message),
        disconnect: () => {},
        onMessage: { addListener: (listener) => listeners.push(listener) },
      }
      ports.push({
        name,
        posted,
        reply: (message) => listeners.forEach((listener) => listener(message)),
      })
      return port
    },
  }
  const extension: ExtensionApi = {
    runtime,
    storage: {
      local: {
        get: async (key) =>
          key === ENABLED_PAGE_SHORTCUTS_KEY && stored !== undefined ? { [key]: stored } : {},
        onChanged: {
          addListener: (listener) => changeListeners.add(listener),
          removeListener: (listener) => changeListeners.delete(listener),
        },
      },
    },
  }
  return {
    extension,
    ports,
    changeEnabled: (value: unknown) =>
      changeListeners.forEach((listener) =>
        listener({ [ENABLED_PAGE_SHORTCUTS_KEY]: { newValue: value } }),
      ),
    invalidate: () => {
      runtime.id = undefined
    },
  }
}

const installed: Array<() => void> = []

const install = async (extension: ExtensionApi) => {
  installed.push(installPageShortcuts({ extension, window, platform: "mac" }))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

afterEach(() => {
  installed.splice(0).forEach((uninstall) => uninstall())
  document.querySelectorAll("katip-toast").forEach((toast) => toast.remove())
  vi.useRealTimers()
})

const press = (keys: KeyboardEventInit) => {
  const event = new KeyboardEvent("keydown", {
    code: "KeyC",
    bubbles: true,
    cancelable: true,
    ...keys,
  })
  document.body.dispatchEvent(event)
  return event
}

const copyUrlKeys = { metaKey: true, shiftKey: true } as const
const copyMarkdownKeys = { metaKey: true, shiftKey: true, altKey: true } as const

const shownToast = () => document.querySelector("katip-toast")?.shadowRoot?.textContent ?? null

describe("有効なショートカットを押したとき", () => {
  it("ページの既定の動作を止めて、background にそのショートカットを送る", async () => {
    const fake = fakeExtension(["CopyUrl"])
    await install(fake.extension)

    const event = press(copyUrlKeys)

    expect(event.defaultPrevented).toBe(true)
    expect(fake.ports.map(({ name, posted }) => ({ name, posted }))).toStrictEqual([
      { name: PAGE_SHORTCUT_PORT_NAME, posted: [{ _tag: "Run", shortcut: "CopyUrl" }] },
    ])
  })

  it("返ってきた知らせをページに表示する", async () => {
    const fake = fakeExtension(["CopyUrl"])
    await install(fake.extension)
    press(copyUrlKeys)

    fake.ports[0]?.reply({ _tag: "Done", notice: "URL をコピーしました" })

    expect(shownToast()).toContain("URL をコピーしました")
  })

  it("コピーできなかったときは、その理由を表示する", async () => {
    const fake = fakeExtension(["CopyUrl"])
    await install(fake.extension)
    press(copyUrlKeys)

    fake.ports[0]?.reply({ _tag: "Failed", reason: "コピーできませんでした" })

    expect(shownToast()).toContain("コピーできませんでした")
  })

  it("知らせはしばらくすると消える", async () => {
    const fake = fakeExtension(["CopyUrl"])
    await install(fake.extension)
    vi.useFakeTimers()
    press(copyUrlKeys)
    fake.ports[0]?.reply({ _tag: "Done", notice: "URL をコピーしました" })

    vi.advanceTimersByTime(2_000)

    expect(shownToast()).toBeNull()
  })
})

describe("受け取らないキー", () => {
  it("無効にしているショートカットは、止めずにページに任せる", async () => {
    const fake = fakeExtension(["CopyUrl"])
    await install(fake.extension)

    const event = press(copyMarkdownKeys)

    expect(event.defaultPrevented).toBe(false)
    expect(fake.ports).toStrictEqual([])
  })

  it("ショートカットでないキーは、止めずにページに任せる", async () => {
    const fake = fakeExtension(["CopyUrl", "CopyMarkdownLink"])
    await install(fake.extension)

    const event = press({ metaKey: true })

    expect(event.defaultPrevented).toBe(false)
    expect(fake.ports).toStrictEqual([])
  })

  it("押しっぱなしの繰り返しや、日本語入力の変換中のキーは送らない", async () => {
    const fake = fakeExtension(["CopyUrl"])
    await install(fake.extension)

    press({ ...copyUrlKeys, repeat: true })
    press({ ...copyUrlKeys, isComposing: true })

    expect(fake.ports).toStrictEqual([])
  })

  it("有効な一覧を読み終えるまでは、何も受け取らない", () => {
    const fake = fakeExtension(["CopyUrl"])
    installed.push(installPageShortcuts({ extension: fake.extension, window, platform: "mac" }))

    const event = press(copyUrlKeys)

    expect(event.defaultPrevented).toBe(false)
  })
})

describe("有効な一覧が変わったとき", () => {
  it("新しく有効にしたショートカットを、次に押したときから受け取る", async () => {
    const fake = fakeExtension([])
    await install(fake.extension)

    fake.changeEnabled(["CopyMarkdownLink"])
    const event = press(copyMarkdownKeys)

    expect(event.defaultPrevented).toBe(true)
  })

  it("一覧が空になると、それまで有効だったショートカットもページに任せる", async () => {
    const fake = fakeExtension(["CopyUrl"])
    await install(fake.extension)

    fake.changeEnabled([])
    const event = press(copyUrlKeys)

    expect(event.defaultPrevented).toBe(false)
  })
})

describe("拡張機能が無効になった後", () => {
  it("有効だったショートカットも横取りせず、background にも送らない", async () => {
    const fake = fakeExtension(["CopyUrl"])
    await install(fake.extension)

    fake.invalidate()
    const event = press(copyUrlKeys)

    expect(event.defaultPrevented).toBe(false)
    expect(fake.ports).toStrictEqual([])
  })
})

describe("同じページに二重に入れたとき", () => {
  it("後から入れたものだけが送り、1 回だけコピーする", async () => {
    const older = fakeExtension(["CopyUrl"])
    const newer = fakeExtension(["CopyUrl"])
    await install(older.extension)
    await install(newer.extension)

    press(copyUrlKeys)

    expect([older.ports.length, newer.ports.length]).toStrictEqual([0, 1])
  })
})

describe("keyboardPlatformOf", () => {
  it("Mac では Command を主な修飾キーにする", () => {
    expect(keyboardPlatformOf("MacIntel")).toBe("mac")
  })

  it("Windows や Linux では Ctrl を主な修飾キーにする", () => {
    expect(keyboardPlatformOf("Win32")).toBe("other")
    expect(keyboardPlatformOf("Linux x86_64")).toBe("other")
  })
})
