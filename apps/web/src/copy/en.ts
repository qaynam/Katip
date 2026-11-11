import { GITHUB_RELEASES_URL } from "../site.ts"
import type { Copy } from "./copy.ts"

export const en: Copy = {
  meta: {
    title: "Katip – Vertical tabs and Spaces in Chrome’s side panel",
    description:
      "Katip turns Chrome’s side panel into a sidebar for your tabs, with Spaces, pinned tabs, folders, split view and a Spotlight search. Free, open source, and nothing leaves your browser.",
    imageAlt:
      "Katip: your tabs, organized into Spaces. The side panel shows a Work Space with pinned tabs in folders.",
  },
  skipToContent: "Skip to content",
  header: {
    home: "Katip home",
    sections: "Sections",
    features: "Features",
    arc: "From Arc",
    privacy: "Privacy",
    github: "Katip on GitHub",
  },
  hero: {
    title: "Vertical tabs and Spaces, in Chrome’s side panel",
    lead: "Give each project its own Space, pin the pages you come back to, and find anything with Spotlight.",
    note: "Free and open source · Chrome 120 or later",
    screenshotAlt:
      "Katip in the side panel next to a document. The Work Space shows a row of Favorites, a Product folder holding pinned tabs and a pinned split view, more folders, and the open tabs below them.",
    details: [
      {
        title: "Pins that sync",
        text: "Pinned tabs and folders are saved as bookmarks, so Chrome Sync carries them.",
      },
      {
        title: "Favorites",
        text: "Your most-used pages sit as icons at the top, in every Space.",
      },
    ],
  },
  cta: {
    addToChrome: "Add to Chrome",
    comingSoon: "Coming soon to the Chrome Web Store",
    github: "View on GitHub",
    fromRelease: [
      "Can’t wait? ",
      { link: "Download a release", href: GITHUB_RELEASES_URL },
      " from GitHub and load it unpacked at chrome://extensions.",
    ],
  },
  spotlight: {
    eyebrow: "Spotlight",
    title: "Find anything. Run any command.",
    lead: "Search your tabs, pins and Spaces, or run a command, right from the keyboard.",
    screenshotAlt:
      "Spotlight open over the browser window with “copy” typed. The results are the commands Copy URL and Copy URL as Markdown Link, an open tab whose title matches, and a web search.",
    details: [
      {
        title: "One box for everything",
        text: "Tabs, pins, Favorites, bookmarks and the web, plus your history if you allow it.",
      },
      {
        title: "Your size, your place",
        text: "Pick Compact, Normal or Large, and where it opens, in the settings.",
      },
    ],
  },
  bangs: {
    eyebrow: "Bangs",
    title: "Search any site with a bang",
    lead: "Type ! and a site’s shortcut in Spotlight to search that site straight away.",
    screenshotAlt:
      "Spotlight open with only “!” typed. It lists five site searches with their shortcuts: Tracker (!tr), Docs (!docs), Recipes (!food), Maps (!maps) and News (!news).",
    details: [
      {
        title: "Thousands built in",
        text: [
          { code: "!gh katip" },
          " searches GitHub, ",
          { code: "!w" },
          " Wikipedia and ",
          { code: "!yt" },
          " YouTube.",
        ],
      },
      {
        title: "Your own shortcuts",
        text: "Give any site its own keyword by adding a command in the settings.",
      },
    ],
  },
  splitView: {
    eyebrow: "Split view",
    title: "Split view, pinned for later",
    lead: "Keep two pages side by side, and reopen the pair from a single pin.",
    screenshotAlt:
      "A UI spec and a prototype side by side in a split view. In the side panel, the same pair sits in the Product folder as a single pin.",
    details: [
      {
        title: "Drop a tab on a tab",
        text: "Drag one tab onto another, or onto either side of the page.",
      },
      {
        title: "Chrome 155 or later",
        text: "Katip builds on Chrome’s own split view.",
      },
    ],
  },
  themes: {
    eyebrow: "Themes",
    title: "Colors and themes for every Space",
    lead: "Give each Space its own colors, a gradient, and a light or dark look.",
    screenshotAlt:
      "The theme editor open in the side panel of the Personal Space, which is tinted coral and pink. It has a color field, a row of preset colors and a light, dark or auto switch. A travel article is open beside it.",
    details: [
      {
        title: "Gradients and textures",
        text: "Pick a preset or your own colors, then add grain, film, linen or paper.",
      },
      {
        title: "Light, dark or auto",
        text: "Each Space can follow your system, and Spotlight follows along.",
      },
    ],
  },
  more: {
    eyebrow: "And more",
    title: "The details, taken care of",
    lead: "The small things that keep a sidebar out of your way.",
    features: {
      liveFolders: {
        title: "Live folders",
        text: "Your Gmail inbox or GitHub reviews, as a folder that updates itself.",
      },
      temporaryTabs: {
        title: "Temporary tabs",
        text: "Clear unpinned tabs in one click, or have idle ones archived.",
      },
      shortcuts: {
        title: "Keyboard shortcuts",
        text: "Open Spotlight, pin a tab or copy a link from the keyboard.",
      },
      languages: {
        title: "Four languages",
        text: "English, Japanese, Simplified Chinese and Spanish.",
      },
    },
  },
  arc: {
    eyebrow: "Coming from Arc?",
    title: "Move over from Arc in a minute",
    lead: "Bring over your Spaces with their colors, pins, folders, split views and Favorites.",
    screenshotAlt:
      "Katip’s settings on the Data page, previewing an import from Arc: the Spaces to import from each Arc profile, whether to keep them as separate Spaces or combine them into one, and what will be added: 4 Spaces, 9 pinned tabs, 3 folders, 2 split views and 3 Favorites.",
    steps: {
      openSettings: ["Open Katip’s settings, then ", { strong: "Data → Import from Arc" }, "."],
      chooseFile: ["Choose Arc’s ", { code: "StorableSidebar.json" }, "."],
      import: ["Check the preview, then import."],
    },
    locationsTitle: "Where to find it",
    locations: [
      {
        system: "macOS",
        path: "~/Library/Application Support/Arc/StorableSidebar.json",
        hint: "Press ⌘⇧G in the file dialog to paste the path.",
      },
      {
        system: "Windows",
        path: "%LOCALAPPDATA%\\Packages\\TheBrowserCompany.Arc_…\\LocalCache\\Local\\Arc\\",
        hint: "The file is in this folder.",
      },
    ],
    promises: [
      "Katip only adds. Nothing you have is changed.",
      "The file never leaves your browser.",
    ],
  },
  privacy: {
    eyebrow: "Privacy",
    title: "Nothing leaves your browser",
    lead: "Katip has no server and collects nothing.",
    points: [
      {
        title: "No account, no tracking",
        text: "Nothing to sign up for, and no analytics, telemetry or ads.",
      },
      {
        title: "Update checks you can turn off",
        text: "Katip asks GitHub for its latest release and sends none of your data.",
      },
      {
        title: "Live folders, if you allow them",
        text: "They reach Gmail and GitHub straight from your browser.",
      },
    ],
    policyLink: "Read the privacy policy",
  },
  openSource: {
    eyebrow: "Open source",
    title: "Free, and open source",
    lead: "All of Katip’s code is on GitHub under the MIT License. The name and logo aren’t, so please give your version its own.",
  },
  footer: {
    links: "Katip",
    github: "GitHub",
    privacy: "Privacy policy",
    license: "MIT License",
    language: "Language",
  },
  privacyPage: {
    title: "Privacy Policy",
    metaTitle: "Privacy Policy – Katip",
    description:
      "What data Katip handles and where it goes. In short: Katip has no server, collects nothing, and sends nothing to anyone.",
  },
}
