import { describe, expect, it } from "vitest"
import { DEFAULT_TEXTURE, nextTexture, textureTileOf, ThemeTexture } from "./textures"

describe("nextTexture", () => {
  it("goes through all six textures and back to the first", () => {
    const visited = [DEFAULT_TEXTURE]
    for (let step = 0; step < 6; step++)
      visited.push(nextTexture(visited.at(-1) ?? DEFAULT_TEXTURE))

    expect(visited).toStrictEqual([...ThemeTexture.literals, DEFAULT_TEXTURE])
  })
})

describe("textureTileOf", () => {
  it("paints each texture with a tile of its own", () => {
    const images = ThemeTexture.literals.map((texture) => textureTileOf(texture).image)

    expect(new Set(images).size).toBe(ThemeTexture.literals.length)
  })

  it("gives every tile as a CSS url of an SVG image", () => {
    const images = ThemeTexture.literals.map((texture) => textureTileOf(texture).image)

    expect(images.every((image) => image.startsWith('url("data:image/svg+xml,'))).toBe(true)
  })
})
