import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { buildLocaleMessages, buildManifest } from "./manifest"

describe("the manifest's version", () => {
  it.each(["1", "0.1.0", "1.2.3.4", "65535.65535.65535.65535"])(
    "is the given version %s as is",
    (version) => {
      expect(buildManifest("production", version).version).toBe(version)
    },
  )

  it("is the given version in a development build too", () => {
    expect(buildManifest("development", "0.2.0").version).toBe("0.2.0")
  })

  it.each(["1.2.3-beta.1", "1.2.3+build.5", "01.2.3", "1.2.3.4.5", "65536.0.0", "1..2", ""])(
    "is refused, naming it, when Chrome can't load version %j",
    (version) => {
      expect(() => buildManifest("production", version)).toThrow(`"${version}"`)
    },
  )
})

describe("the manifest's keyboard shortcuts", () => {
  it("suggest keys for no more than 4 commands, the most Chrome loads", () => {
    const { commands = {} } = buildManifest("production", "1.0.0")

    const withKeys = Object.values(commands).filter((command) => command.suggested_key)

    expect(withKeys.length).toBeLessThanOrEqual(4)
  })
})

describe("the manifest's translations", () => {
  const manifest = buildManifest("production", "1.0.0")
  const messages = buildLocaleMessages()
  const placeholderNames = [...JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g)].flatMap(
    ([, name]) => (name === undefined ? [] : [name]),
  )

  it("leave no description to be read in a single language", () => {
    const descriptions = [
      manifest.description,
      ...Object.values(manifest.commands ?? {}).map(({ description }) => description),
    ]

    expect(descriptions.filter((text) => !/^__MSG_\w+__$/.test(text ?? ""))).toStrictEqual([])
  })

  it("are written for English, Japanese, Simplified Chinese and Spanish, defaulting to English", () => {
    expect([manifest.default_locale, Object.keys(messages)]).toStrictEqual([
      "en",
      ["en", "ja", "zh_CN", "es"],
    ])
  })

  it.each(["en", "ja", "zh_CN", "es"])("give every placeholder a message in %s", (directory) => {
    expect(
      placeholderNames.filter((name) => messages[directory]?.[name] === undefined),
    ).toStrictEqual([])
  })

  it("name messages with only the letters, digits and underscores Chrome accepts", () => {
    const names = Object.values(messages).flatMap((each) => Object.keys(each))

    expect(names.filter((name) => !/^[A-Za-z0-9_]+$/.test(name))).toStrictEqual([])
  })

  it("take each language's text from its catalog", () => {
    expect(
      Object.fromEntries(
        Object.entries(messages).map(([directory, each]) => [
          directory,
          each["manifest_command_openSidePanel"]?.message,
        ]),
      ),
    ).toStrictEqual({
      en: "Open the side panel",
      ja: "サイドパネルを開く",
      zh_CN: "打开侧边栏",
      es: "Abrir el panel lateral",
    })
  })
})

describe("the manifest's icons", () => {
  const publicFile = (path: string) => fileURLToPath(new URL(`./public/${path}`, import.meta.url))

  it("point at icon files that ship with the extension, for the store and the toolbar", () => {
    const { icons = {}, action = {} } = buildManifest("production", "1.0.0")
    const paths = [...Object.values(icons), ...Object.values(action.default_icon ?? {})]

    expect([
      Object.keys(icons),
      paths.filter((path) => !existsSync(publicFile(path))),
    ]).toStrictEqual([["16", "32", "48", "128"], []])
  })
})
