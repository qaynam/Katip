import { fireEvent, screen, within } from "@testing-library/svelte"
import { describe, expect, it, vi } from "vitest"
import { BookmarkId } from "#platform/browser"
import type { LiveFolderStatus, PinnedLiveFolderView, PinnedNodeView } from "#protocol"
import { commandsOf, renderSidebar } from "../testing/render-sidebar"
import { liveItem, pinnedLiveFolder, sidebarView, spaceView } from "../testing/view-builders"

const viewWithPins = (...nodes: ReadonlyArray<PinnedNodeView>) =>
  sidebarView({ spaces: [spaceView("work", { pinnedNodes: nodes })] })

const inbox = (overrides: Partial<Omit<PinnedLiveFolderView, "_tag" | "bookmarkId">> = {}) =>
  pinnedLiveFolder("inbox", {
    title: "Inbox",
    items: [
      liveItem("quote", { title: "Re: Quote", subtitle: "Jane Doe", isUnseen: true }),
      liveItem("lunch", { title: "Lunch invite", isUnseen: true }),
      liveItem("report", { title: "Weekly report", isUnseen: false }),
    ],
    ...overrides,
  })

type Failure = Extract<LiveFolderStatus, { readonly _tag: "Failed" }>

const failed = (
  failure: Partial<Pick<Failure, "needsPermission" | "needsToken" | "signInUrl">>,
): Failure => ({
  _tag: "Failed",
  reason: "Request timed out",
  needsPermission: false,
  needsToken: false,
  signInUrl: null,
  ...failure,
})

const header = (title: string) => screen.getByRole("button", { name: new RegExp(`^${title}`) })
const pinnedRegion = () => screen.getByRole("region", { name: "Pinned" })

const openHeaderMenu = async (title: string) => {
  await fireEvent.contextMenu(header(title))
}

describe("Showing a live folder", () => {
  it("shows only the unread count on a collapsed live folder and hides the items", async () => {
    await renderSidebar(viewWithPins(inbox({ isExpanded: false })))

    expect(header("Inbox").textContent).toContain("2 unread items")
    expect(within(pinnedRegion()).queryByText("Re: Quote")).toBeNull()
  })

  it("lists the items of an expanded live folder and marks unread ones", async () => {
    await renderSidebar(viewWithPins(inbox()))

    expect(screen.getByRole("button", { name: /Re: Quote/ }).textContent).toContain("Unread")
    expect(screen.getByRole("button", { name: /Weekly report/ }).textContent).not.toContain(
      "Unread",
    )
  })

  it("shows an item's subtitle below its title", async () => {
    await renderSidebar(viewWithPins(inbox()))

    expect(screen.getByRole("button", { name: /Re: Quote/ }).textContent).toContain("Jane Doe")
  })

  it("shows no count when nothing is unread", async () => {
    await renderSidebar(viewWithPins(inbox({ items: [liveItem("read")], isExpanded: false })))

    expect(header("Inbox").textContent).not.toContain("unread")
  })

  it("shows that it is refreshing", async () => {
    await renderSidebar(viewWithPins(inbox({ status: { _tag: "Refreshing" } })))

    expect(header("Inbox").textContent).toContain("Refreshing")
  })

  it("lists the items in the order received, without sorting them", async () => {
    await renderSidebar(
      viewWithPins(
        inbox({
          sort: "newest",
          items: [
            liveItem("older", { title: "Older mail", updatedAt: 1 }),
            liveItem("newer", { title: "Newer mail", updatedAt: 2 }),
          ],
        }),
      ),
    )

    const rows = within(pinnedRegion()).getAllByRole("button", { name: /mail$/ })

    expect(rows.map((row) => row.textContent)).toStrictEqual([
      expect.stringContaining("Older mail"),
      expect.stringContaining("Newer mail"),
    ])
  })

  it("says there are no new items when empty", async () => {
    await renderSidebar(viewWithPins(inbox({ items: [] })))

    expect(within(pinnedRegion()).getByText("No new items")).toBeTruthy()
  })
})

describe("Live folder actions", () => {
  it("opens an item when clicked", async () => {
    const { connection } = await renderSidebar(viewWithPins(inbox()))

    await fireEvent.click(screen.getByRole("button", { name: /Re: Quote/ }))

    expect(connection.sentCommands).toStrictEqual([
      {
        _tag: "OpenLiveItem",
        windowId: 1,
        bookmarkId: BookmarkId.make("inbox"),
        itemId: "quote",
      },
    ])
  })

  it("toggles expansion when the header is clicked", async () => {
    const { connection } = await renderSidebar(viewWithPins(inbox({ isExpanded: true })))

    await fireEvent.click(header("Inbox"))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "SetFolderExpanded", bookmarkId: BookmarkId.make("inbox"), isExpanded: false },
    ])
  })

  it("refreshes with Refresh Now in the context menu", async () => {
    const { connection } = await renderSidebar(viewWithPins(inbox()))

    await openHeaderMenu("Inbox")
    await fireEvent.click(screen.getByRole("menuitem", { name: "Refresh Now" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "RefreshLiveFolder", bookmarkId: BookmarkId.make("inbox") },
    ])
  })

  it("marks every item as seen with Mark All as Read in the context menu", async () => {
    const { connection } = await renderSidebar(viewWithPins(inbox()))

    await openHeaderMenu("Inbox")
    await fireEvent.click(screen.getByRole("menuitem", { name: "Mark All as Read" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "MarkLiveFolderSeen", bookmarkId: BookmarkId.make("inbox") },
    ])
  })

  it("disables Mark All as Read when nothing is unread", async () => {
    await renderSidebar(viewWithPins(inbox({ items: [liveItem("read")] })))

    await openHeaderMenu("Inbox")

    expect(
      screen.getByRole<HTMLButtonElement>("menuitem", { name: "Mark All as Read" }).disabled,
    ).toBe(true)
  })

  it("renames with Rename in the context menu", async () => {
    const { connection } = await renderSidebar(viewWithPins(inbox()))

    await openHeaderMenu("Inbox")
    await fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }))
    const input = screen.getByRole("textbox", { name: "Live folder name" })
    await fireEvent.input(input, { target: { value: "Mail" } })
    await fireEvent.keyDown(input, { key: "Enter" })

    expect(commandsOf(connection.sentCommands, "RenamePinnedItem")).toStrictEqual([
      { _tag: "RenamePinnedItem", bookmarkId: BookmarkId.make("inbox"), title: "Mail" },
    ])
  })

  it("deletes the live folder once deletion is confirmed in the dialog", async () => {
    const { connection } = await renderSidebar(viewWithPins(inbox()))

    await openHeaderMenu("Inbox")
    await fireEvent.click(screen.getByRole("menuitem", { name: "Delete Live Folder" }))
    await fireEvent.click(await screen.findByRole("button", { name: "Delete" }))

    expect(commandsOf(connection.sentCommands, "DeleteFolder")).toStrictEqual([
      { _tag: "DeleteFolder", bookmarkId: BookmarkId.make("inbox") },
    ])
  })

  it("deletes nothing when deletion is canceled in the dialog", async () => {
    const { connection } = await renderSidebar(viewWithPins(inbox()))

    await openHeaderMenu("Inbox")
    await fireEvent.click(screen.getByRole("menuitem", { name: "Delete Live Folder" }))
    await fireEvent.click(await screen.findByRole("button", { name: "Cancel" }))

    expect(commandsOf(connection.sentCommands, "DeleteFolder")).toStrictEqual([])
  })
})

describe("Sorting a live folder", () => {
  const chooseSort = async (title: string, label: string) => {
    await openHeaderMenu(title)
    await fireEvent.click(screen.getByRole("menuitem", { name: "Sort By" }))
    await fireEvent.click(screen.getByRole("menuitemradio", { name: label }))
  }

  it("sorts oldest first when Oldest First is chosen under Sort By in the context menu", async () => {
    const { connection } = await renderSidebar(viewWithPins(inbox({ sort: "newest" })))

    await chooseSort("Inbox", "Oldest First")

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "SetLiveFolderSort", bookmarkId: BookmarkId.make("inbox"), sort: "oldest" },
    ])
  })

  it("checks the current sort order", async () => {
    await renderSidebar(viewWithPins(inbox({ sort: "title" })))

    await openHeaderMenu("Inbox")
    await fireEvent.click(screen.getByRole("menuitem", { name: "Sort By" }))

    const checked = screen
      .getAllByRole("menuitemradio")
      .filter((item) => item.getAttribute("aria-checked") === "true")
      .map((item) => item.textContent?.trim())
    expect(checked).toStrictEqual(["Title"])
  })

  it("calls the per-source sort Sender for Gmail", async () => {
    const { connection } = await renderSidebar(viewWithPins(inbox()))

    await chooseSort("Inbox", "Sender")

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "SetLiveFolderSort", bookmarkId: BookmarkId.make("inbox"), sort: "source" },
    ])
  })

  it("calls the per-source sort Repository for GitHub", async () => {
    const reviews = pinnedLiveFolder("reviews", {
      title: "Reviews",
      source: { _tag: "GitHub", query: "review-requested" },
    })
    const { connection } = await renderSidebar(viewWithPins(reviews))

    await chooseSort("Reviews", "Repository")

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "SetLiveFolderSort", bookmarkId: BookmarkId.make("reviews"), sort: "source" },
    ])
  })
})

describe("A live folder that failed to refresh", () => {
  it("shows why it failed", async () => {
    await renderSidebar(viewWithPins(inbox({ status: failed({}) })))

    expect(within(pinnedRegion()).getByText("Request timed out")).toBeTruthy()
  })

  it("asks for access to the source with Allow Access when not permitted, and refreshes once granted", async () => {
    const { connection, originAccess } = await renderSidebar(
      viewWithPins(inbox({ status: failed({ needsPermission: true }) })),
    )

    await fireEvent.click(screen.getByRole("button", { name: "Allow Access" }))

    expect(originAccess.requestedOrigins).toStrictEqual([["https://mail.google.com/*"]])
    await vi.waitFor(() =>
      expect(connection.sentCommands).toStrictEqual([
        { _tag: "RefreshLiveFolder", bookmarkId: BookmarkId.make("inbox") },
      ]),
    )
  })

  it("doesn't refresh when access is denied and reports the missing permission", async () => {
    const { connection } = await renderSidebar(
      viewWithPins(inbox({ status: failed({ needsPermission: true }) })),
      { grantsAccess: false },
    )

    await fireEvent.click(screen.getByRole("button", { name: "Allow Access" }))

    await vi.waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("access to Gmail wasn’t allowed"),
    )
    expect(connection.sentCommands).toStrictEqual([])
  })

  it("saves the token entered with Set Token when the token is missing, then refreshes", async () => {
    const reviews = pinnedLiveFolder("reviews", {
      title: "Reviews",
      source: { _tag: "GitHub", query: "review-requested" },
      status: failed({ needsToken: true }),
    })
    const { connection } = await renderSidebar(viewWithPins(reviews))

    await fireEvent.click(screen.getByRole("button", { name: "Set Token" }))
    await fireEvent.input(screen.getByLabelText("Access token"), {
      target: { value: " ghp_secret " },
    })
    await fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await vi.waitFor(() =>
      expect(connection.sentCommands).toStrictEqual([
        { _tag: "SetGitHubToken", token: "ghp_secret" },
        { _tag: "RefreshLiveFolder", bookmarkId: BookmarkId.make("reviews") },
      ]),
    )
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("asks for a token and sends nothing when saving an empty token", async () => {
    const reviews = pinnedLiveFolder("reviews", {
      source: { _tag: "GitHub", query: "review-requested" },
      status: failed({ needsToken: true }),
    })
    const { connection } = await renderSidebar(viewWithPins(reviews))

    await fireEvent.click(screen.getByRole("button", { name: "Set Token" }))
    await fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(screen.getByRole("alert").textContent).toBe("Enter a token")
    expect(connection.sentCommands).toStrictEqual([])
  })

  it("opens the sign-in page in this window with Sign In when not signed in to the source", async () => {
    const reviews = pinnedLiveFolder("reviews", {
      title: "Reviews",
      source: { _tag: "GitHub", query: "review-requested" },
      status: failed({ signInUrl: "https://github.com/login" }),
    })
    const { connection } = await renderSidebar(viewWithPins(reviews))

    await fireEvent.click(screen.getByRole("button", { name: "Sign In" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "OpenUrl", windowId: 1, url: "https://github.com/login" },
    ])
  })

  it("hides Sign In for failures without a known sign-in page", async () => {
    await renderSidebar(viewWithPins(inbox({ status: failed({}) })))

    expect(screen.queryByRole("button", { name: "Sign In" })).toBeNull()
  })

  it("refreshes with Try Again for failures that permission or a token can't fix", async () => {
    const { connection } = await renderSidebar(viewWithPins(inbox({ status: failed({}) })))

    await fireEvent.click(screen.getByRole("button", { name: "Try Again" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "RefreshLiveFolder", bookmarkId: BookmarkId.make("inbox") },
    ])
  })
})
