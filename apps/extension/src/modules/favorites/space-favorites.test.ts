import { describe, expect, it } from "vitest"
import { Option } from "effect"
import { SpaceId } from "#modules/space"
import { FavoriteId, type FavoriteList } from "./favorites"
import {
  carriedFavoriteId,
  carrySharedFavorites,
  findFavorite,
  favoritesOf,
  forgetSpaceFavorites,
  resolveFavoriteId,
  updateFavoritesOf,
  type SpaceFavorites,
} from "./space-favorites"

const home = SpaceId.make("home")
const work = SpaceId.make("work")
const reading = SpaceId.make("reading")

const favorite = (id: string) => ({
  id: FavoriteId.make(id),
  url: `https://${id}.example/`,
  title: id,
})

const idsIn = (favorites: SpaceFavorites, spaceId: SpaceId) =>
  favoritesOf(favorites, spaceId).map((saved) => saved.id)

describe("a Space's Favorites", () => {
  it("are none for a Space without any saved", () => {
    expect(favoritesOf({ [home]: [favorite("mail")] }, work)).toStrictEqual([])
  })

  it("change for that Space alone", () => {
    const favorites = { [home]: [favorite("mail")], [work]: [favorite("mail")] }

    const updated = updateFavoritesOf(favorites, work, (list) => [...list, favorite("docs")])

    expect([idsIn(updated, home), idsIn(updated, work)]).toStrictEqual([["mail"], ["mail", "docs"]])
  })

  it("go with the Space when it is forgotten", () => {
    const favorites = { [home]: [favorite("mail")], [work]: [favorite("docs")] }

    expect(forgetSpaceFavorites(favorites, work)).toStrictEqual({ [home]: [favorite("mail")] })
  })
})

describe("findFavorite", () => {
  it("finds a Favorite with the Space it belongs to", () => {
    const favorites = { [home]: [favorite("mail")], [work]: [favorite("docs")] }

    expect(findFavorite(favorites, FavoriteId.make("docs"))).toStrictEqual(
      Option.some({ spaceId: work, favorite: favorite("docs") }),
    )
  })
})

describe("carrySharedFavorites", () => {
  const shared: FavoriteList = [favorite("mail"), favorite("docs")]

  it("gives every Space a copy of the shared Favorites, in their order, each copy with an ID of its own", () => {
    const carried = carrySharedFavorites({}, shared, [home, work])

    expect([idsIn(carried, home), idsIn(carried, work)]).toStrictEqual([
      [
        carriedFavoriteId(FavoriteId.make("mail"), home),
        carriedFavoriteId(FavoriteId.make("docs"), home),
      ],
      [
        carriedFavoriteId(FavoriteId.make("mail"), work),
        carriedFavoriteId(FavoriteId.make("docs"), work),
      ],
    ])
  })

  it("keeps each Favorite's page and title in the copies", () => {
    const carried = carrySharedFavorites({}, shared, [home])

    expect(favoritesOf(carried, home).map(({ url, title }) => [url, title])).toStrictEqual([
      ["https://mail.example/", "mail"],
      ["https://docs.example/", "docs"],
    ])
  })

  it("leaves a Space that already has Favorites of its own as it is", () => {
    const own = { [work]: [favorite("chat")] }

    const carried = carrySharedFavorites(own, shared, [home, work])

    expect(idsIn(carried, work)).toStrictEqual(["chat"])
  })

  it("carried again, adds nothing more", () => {
    const once = carrySharedFavorites({}, shared, [home, work])

    expect(carrySharedFavorites(once, shared, [home, work])).toStrictEqual(once)
  })
})

describe("resolveFavoriteId", () => {
  const favorites = carrySharedFavorites(
    { [reading]: [favorite("news")] },
    [favorite("mail")],
    [home, work],
  )

  it("finds a Favorite by its own ID, whichever Space is given", () => {
    expect(
      Option.map(
        resolveFavoriteId(favorites, FavoriteId.make("news"), Option.some(home)),
        (found) => found.spaceId,
      ),
    ).toStrictEqual(Option.some(reading))
  })

  it("finds the copy in the given Space for the ID of a Favorite every Space shared", () => {
    expect(
      Option.map(
        resolveFavoriteId(favorites, FavoriteId.make("mail"), Option.some(work)),
        (found) => found.favorite.id,
      ),
    ).toStrictEqual(Option.some(carriedFavoriteId(FavoriteId.make("mail"), work)))
  })

  it("finds nothing for the ID of a shared Favorite without a Space to look in", () => {
    expect(resolveFavoriteId(favorites, FavoriteId.make("mail"), Option.none())).toStrictEqual(
      Option.none(),
    )
  })
})
