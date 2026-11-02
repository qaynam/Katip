import { IdleMinutes } from "#modules/settings"
import { SpaceId, SpaceName } from "#modules/space"
import { neutralTheme, themeOf, type SpaceTheme, type ThemeColor } from "#modules/theme"
import type { PinnedLiveFolderView, SidebarView } from "#protocol"
import { SplitViewId } from "#platform/browser"
import { withRecomputedPeeks } from "./fixture-peeks"
import {
  archiveEntry,
  favoriteView,
  liveItem,
  openPinnedTab,
  pinnedFolder,
  pinnedItem,
  pinnedLiveFolder,
  pinnedSplit,
  sidebarView,
  spaceView,
  tabView,
  temporarySplit,
  temporaryTab,
} from "../sidepanel/testing/view-builders"

const MINUTE_MS = 60_000

const color = (hue: number, chroma: number): ThemeColor => ({ hue, chroma })

const themed = (
  colors: ReadonlyArray<ThemeColor>,
  overrides: Partial<Omit<SpaceTheme, "colors">> = {},
): SpaceTheme => ({ ...themeOf(colors), ...overrides })

const minutesOct21 = pinnedItem("minutes-1021", {
  title: "Weekly sync 10/21",
  url: "https://docs.example.com/minutes/1021",
  openTab: openPinnedTab(
    tabView(21, {
      title: "Weekly sync 10/21 - Docs",
      url: "https://docs.example.com/minutes/1021",
    }),
  ),
})

const mail = (
  id: string,
  title: string,
  from: string,
  updatedAt: number,
  options: { readonly isUnseen?: boolean; readonly accountIndex?: number } = {},
) =>
  liveItem(id, {
    title,
    subtitle: from,
    url: `https://mail.google.com/mail/u/${options.accountIndex ?? 0}/#inbox/${id}`,
    updatedAt,
    isUnseen: options.isUnseen ?? false,
  })

const pullRequest = (
  number: number,
  title: string,
  repository: string,
  updatedAt: number,
  options: { readonly isUnseen?: boolean } = {},
) =>
  liveItem(`${repository}#${number}`, {
    title,
    subtitle: `${repository} #${number}`,
    url: `https://github.com/${repository}/pull/${number}`,
    updatedAt,
    isUnseen: options.isUnseen ?? false,
  })

const workInbox = (now: number): PinnedLiveFolderView =>
  pinnedLiveFolder("live-inbox", {
    title: "Inbox",
    source: { _tag: "Gmail", accountIndex: 0, label: null },
    status: { _tag: "Ready", refreshedAt: now - 2 * MINUTE_MS },
    items: [
      mail("m1", "Scheduling next week's design review", "Hanako Sato", now - 8 * MINUTE_MS, {
        isUnseen: true,
      }),
      mail("m2", "Re: Quote (resent)", "Taro Yamada", now - 47 * MINUTE_MS, { isUnseen: true }),
      mail("m3", "Internal study session", "General Affairs", now - 3 * 60 * MINUTE_MS, {
        isUnseen: true,
      }),
      mail("m4", "October expense reports", "Accounting", now - 26 * 60 * MINUTE_MS),
    ],
  })

const reviewRequests = (now: number): PinnedLiveFolderView =>
  pinnedLiveFolder("live-reviews", {
    title: "Review requests",
    source: { _tag: "GitHub", query: "review-requested" },
    isExpanded: false,
    sort: "source",
    status: { _tag: "Ready", refreshedAt: now - 5 * MINUTE_MS },
    items: [
      pullRequest(214, "Refresh live folders periodically", "katip/katip", now - 20 * MINUTE_MS, {
        isUnseen: true,
      }),
      pullRequest(
        209,
        "Offer Spaces in Spotlight results",
        "katip/katip",
        now - 2 * 60 * MINUTE_MS,
        {
          isUnseen: true,
        },
      ),
      pullRequest(77, "Fix a typo in the README", "katip/website", now - 4 * 24 * 60 * MINUTE_MS),
    ],
  })

const mentions: PinnedLiveFolderView = pinnedLiveFolder("live-mentions", {
  title: "Mentions",
  source: { _tag: "GitHub", query: "mentioned" },
  status: { _tag: "Refreshing" },
})

const myPullRequests: PinnedLiveFolderView = pinnedLiveFolder("live-my-prs", {
  title: "My PRs",
  source: { _tag: "GitHub", query: "authored-pull-requests" },
  status: {
    _tag: "Failed",
    reason: "You aren't signed in to GitHub in this browser.",
    needsPermission: false,
    needsToken: false,
    signInUrl: "https://github.com/login",
  },
})

const teamInbox: PinnedLiveFolderView = pinnedLiveFolder("live-team-inbox", {
  title: "Team inbox",
  source: { _tag: "Gmail", accountIndex: 2, label: null },
  isExpanded: false,
  status: {
    _tag: "Failed",
    reason: "You aren't signed in to the third Google account (u/2) in this browser.",
    needsPermission: false,
    needsToken: false,
    signInUrl:
      "https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fmail.google.com%2Fmail%2Fu%2F2%2F",
  },
})

const newsletters: PinnedLiveFolderView = pinnedLiveFolder("live-newsletters", {
  title: "Newsletters",
  source: { _tag: "Gmail", accountIndex: 1, label: "Newsletters" },
  status: {
    _tag: "Failed",
    reason: "Access to mail.google.com isn't allowed.",
    needsPermission: true,
    needsToken: false,
    signInUrl: null,
  },
})

interface PageSeed {
  readonly title: string
  readonly url: string
}

/** A split view pin, with both sides closed when `opened` is null */
const splitPin = (
  id: string,
  [left, right]: readonly [PageSeed, PageSeed],
  opened: { readonly firstTabId: number; readonly splitViewId: number } | null,
) => {
  const side = ({ title, url }: PageSeed, offset: number) =>
    pinnedItem(`${id}-${offset}`, {
      title,
      url,
      openTab:
        opened === null
          ? null
          : openPinnedTab(
              tabView(opened.firstTabId + offset, {
                title,
                url,
                splitViewId: SplitViewId.make(opened.splitViewId),
              }),
            ),
    })
  return pinnedSplit(id, [side(left, 0), side(right, 1)])
}

const comparisons = pinnedFolder("comparisons", {
  title: "Comparisons",
  icon: "star",
  isExpanded: false,
  children: [
    splitPin(
      "compare-spec",
      [
        { title: "Spec (Japanese)", url: "https://docs.example.com/spec/ja" },
        { title: "Spec", url: "https://docs.example.com/spec/en" },
      ],
      { firstTabId: 81, splitViewId: 5 },
    ),
    splitPin(
      "compare-design",
      [
        { title: "Design option A", url: "https://design.example.com/a" },
        { title: "Design option B", url: "https://design.example.com/b" },
      ],
      { firstTabId: 83, splitViewId: 6 },
    ),
    splitPin(
      "compare-closed",
      [
        { title: "Old version", url: "https://docs.example.com/v1" },
        { title: "New version", url: "https://docs.example.com/v2" },
      ],
      null,
    ),
  ],
})

const workSpace = (now: number) =>
  spaceView("work", {
    name: SpaceName.make("Work"),
    theme: themed([color(295, 0.55), color(255, 0.5)], { mode: "dark", intensity: 0.6 }),
    pinnedNodes: [
      pinnedFolder("design-docs", {
        title: "Design docs",
        isExpanded: true,
        children: [
          pinnedItem("api-spec", {
            title: "API design",
            url: "https://docs.example.com/api-spec",
            openTab: openPinnedTab(
              tabView(11, { title: "API design v3", url: "https://docs.example.com/api-spec" }),
            ),
          }),
          pinnedItem("screen-flow", {
            title: "Screen flow",
            url: "https://design.example.com/screen-flow",
          }),
          pinnedSplit("spec-compare", [
            pinnedItem("spec-ja", {
              title: "Spec (Japanese)",
              url: "https://docs.example.com/spec/ja",
            }),
            pinnedItem("spec-en", { title: "Spec", url: "https://docs.example.com/spec/en" }),
          ]),
          pinnedFolder("minutes", {
            title: "Meeting notes",
            isExpanded: false,
            canCreateSubfolder: false,
            children: [
              pinnedItem("minutes-1028", {
                title: "Weekly sync 10/28",
                url: "https://docs.example.com/minutes/1028",
              }),
              minutesOct21,
            ],
          }),
          myPullRequests,
        ],
      }),
      comparisons,
      workInbox(now),
      reviewRequests(now),
      mentions,
      teamInbox,
      pinnedItem("tracker", {
        title: "Issue tracker",
        url: "https://tracker.example.com/board",
        openTab: openPinnedTab(
          tabView(12, {
            title: "#482 Drop indicator flickers while dragging",
            url: "https://tracker.example.com/issues/482",
          }),
          { hasNavigatedAway: true },
        ),
      }),
      pinnedItem("calendar", {
        title: "Team calendar",
        url: "https://calendar.example.com/team",
      }),
      pinnedSplit("review", [
        pinnedItem("review-diff", {
          title: "PR #128",
          url: "https://git.example.com/katip/pull/128",
          openTab: openPinnedTab(
            tabView(13, {
              title: "Add split view rows #128",
              url: "https://git.example.com/katip/pull/128",
              splitViewId: SplitViewId.make(2),
            }),
          ),
        }),
        pinnedItem("review-preview", {
          title: "Preview",
          url: "https://preview.example.com/",
          openTab: openPinnedTab(
            tabView(14, {
              title: "Katip preview",
              url: "https://preview.example.com/",
              splitViewId: SplitViewId.make(2),
            }),
          ),
        }),
      ]),
      pinnedFolder("empty-folder", { title: "Read later", isExpanded: true }),
    ],
    temporaryEntries: [
      temporarySplit(
        1,
        tabView(36, { title: "r/sveltejs", url: "https://www.reddit.com/r/sveltejs/" }),
        tabView(37, { title: "Google", url: "https://www.google.com/", isActive: true }),
      ),
      ...[
        tabView(31, {
          title: "Runes • Svelte Docs",
          url: "https://svelte.dev/docs/svelte/what-are-runes",
        }),
        tabView(32, {
          title: "HTML Drag and Drop API - Web API | MDN",
          url: "https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API",
        }),
        tabView(33, {
          title: "Effect 4.0 release notes",
          url: "https://effect.website/blog/releases/effect/40",
          isLoading: true,
        }),
        tabView(34, {
          title: "Focus music",
          url: "https://music.example.com/focus",
          isAudible: true,
        }),
        tabView(35, {
          title: "chrome.sidePanel | API | Chrome for Developers",
          url: "https://developer.chrome.com/docs/extensions/reference/api/sidePanel",
          isDiscarded: true,
        }),
      ].map(temporaryTab),
    ],
  })

const hobby = spaceView("hobby", {
  name: SpaceName.make("Hobbies"),
  theme: themed([color(90, 0.8)], { mode: "light" }),
  pinnedNodes: [
    pinnedItem("recipes", { title: "Saved recipes", url: "https://recipes.example.com/saved" }),
    newsletters,
  ],
  temporaryEntries: [
    temporarySplit(
      3,
      tabView(43, { title: "Reddit", url: "https://www.reddit.com/" }),
      tabView(44, { title: "Google", url: "https://www.google.com/", isActive: true }),
    ),
    temporaryTab(
      tabView(41, {
        title: "Campsites for the weekend",
        url: "https://camp.example.com/search?area=kanto",
      }),
    ),
    temporaryTab(
      tabView(42, { title: "Choosing a film camera", url: "https://camera.example.com/film" }),
    ),
  ],
})

const reading = spaceView("reading", {
  name: SpaceName.make("Reading"),
  theme: themed([color(350, 0.55)], { mode: "light", grain: 0.35 }),
  pinnedNodes: [
    pinnedItem("novel", { title: "Serial novel: contents", url: "https://novel.example.com/toc" }),
  ],
  temporaryTabs: [
    tabView(61, { title: "New this month", url: "https://books.example.com/new", isActive: true }),
  ],
})

const travel = spaceView("travel", {
  name: SpaceName.make("Travel"),
  theme: themed([color(90, 0.8), color(25, 0.8), color(140, 0.7)]),
  temporaryTabs: [
    tabView(71, {
      title: "Three days in Kanazawa",
      url: "https://trip.example.com/kanazawa",
    }),
  ],
})

const notes = spaceView("notes", { name: SpaceName.make("Notes"), theme: neutralTheme })

const household = spaceView("household", {
  name: SpaceName.make("Household"),
  theme: themed([color(200, 0.6)], { mode: "dark" }),
  pinned: { _tag: "Unavailable" },
  temporaryTabs: [tabView(51, { title: "Online banking", url: "https://bank.example.com/" })],
})

export const fixtureView = (now: number): SidebarView => {
  const work = workSpace(now)
  const view = sidebarView({
    spaces: [work, hobby, reading, travel, household, notes],
    activeSpaceId: work.id,
    favorites: [
      favoriteView(1, { title: "Mail", url: "https://mail.example.com/inbox" }),
      favoriteView(2, { title: "Calendar", url: "https://calendar.example.com/" }),
      favoriteView(3, { title: "Chat", url: "https://chat.example.com/" }),
      favoriteView(4, { title: "GitHub", url: "https://github.com/" }),
      favoriteView(5, { title: "Translate", url: "https://translate.example.com/" }),
    ],
    archive: [
      archiveEntry("a1", {
        title: "Vite config reference",
        url: "https://vite.dev/config/",
        spaceId: work.id,
        archivedAt: now - 5 * MINUTE_MS,
      }),
      archiveEntry("a2", {
        title: "Tent comparison 2026",
        url: "https://camp.example.com/tents",
        spaceId: hobby.id,
        archivedAt: now - 3 * 60 * MINUTE_MS,
      }),
      archiveEntry("a3", {
        title: "What's new in TypeScript 6.0",
        url: "https://devblogs.microsoft.com/typescript/",
        spaceId: work.id,
        archivedAt: now - 2 * 24 * 60 * MINUTE_MS,
      }),
      archiveEntry("a4", {
        title: "Page from a deleted Space",
        url: "https://example.com/orphan",
        spaceId: SpaceId.make("deleted-space"),
        archivedAt: now - 10 * 24 * 60 * MINUTE_MS,
      }),
    ],
    autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(360) },
  })
  return withRecomputedPeeks(view)
}
