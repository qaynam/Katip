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
    lead: "Katip turns the side panel into a sidebar for your tabs. Give each project its own Space, pin the pages you come back to, and find anything with Spotlight.",
    note: "Free and open source · Chrome 120 or later",
    screenshotAlt:
      "Katip in the side panel next to a document. The Work Space shows a row of Favorites, a Product folder holding pinned tabs and a pinned split view, more folders, and the open tabs below them.",
  },
  cta: {
    addToChrome: "Add to Chrome",
    comingSoon: "Coming soon to the Chrome Web Store",
    github: "View on GitHub",
    fromRelease: [
      "Can’t wait? ",
      { link: "Download a release", href: GITHUB_RELEASES_URL },
      " from GitHub and load it unpacked at chrome://extensions. Katip lets you know when a newer one is out.",
    ],
  },
  spaces: {
    eyebrow: "Spaces",
    title: "Your tabs, organized into Spaces",
    lead: "Pin the tabs you keep, file them in folders, and switch Spaces with a click.",
    details: [
      {
        title: "A Space for each project",
        text: "Keep separate sets of tabs for work, side projects or hobbies. Each Space has its own pinned tabs, open tabs and colors, and can show as a Chrome tab group too.",
      },
      {
        title: "Pinned tabs and folders",
        text: "Pins are saved as bookmarks, so Chrome Sync carries them to your other computers. Nest folders, give them icons, search inside them, and drag anything anywhere.",
      },
      {
        title: "Favorites",
        text: "The pages you keep at hand in every window, as a row of icons at the top of the side panel. Closing one’s tab keeps it there, a click away from opening again.",
      },
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
        text: "Open tabs, pins, Favorites, Spaces, bookmarks and the web, from a single search box. Your history too, if you allow it, searched on your device.",
      },
      {
        title: "Commands at hand",
        text: "Copy the URL or a Markdown link, pin a tab, move it to another Space, or start a new Google Doc or GitHub repository. Press Tab on an empty box to search commands only.",
      },
      {
        title: "Your size, your place",
        text: "In the settings, pick Compact, Normal or Large, and drag Spotlight to where it should open over the window. Compact shows just the search field until you type.",
      },
    ],
  },
  bangs: {
    eyebrow: "Bangs",
    title: "Search any site with a bang",
    lead: "Type ! and a site’s shortcut in Spotlight to search that site straight away.",
    details: [
      {
        title: "Thousands of sites",
        text: [
          "Bangs come built in: ",
          { code: "!gh katip" },
          " searches GitHub, ",
          { code: "!w" },
          " Wikipedia and ",
          { code: "!yt" },
          " YouTube. If you’d rather not use them, turn them off in the settings.",
        ],
      },
      {
        title: "Stay on the site",
        text: "Choose a bang, or type one with a space after it, and the site’s name sits in the search field. What you type then searches that site, until you press Esc.",
      },
      {
        title: "Your own commands",
        text: [
          "Add a command in the settings and give it a keyword. Typed after ",
          { code: "!" },
          ", it opens a page or searches a site for what follows. Pick the site from the list of bangs to fill it in.",
        ],
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
        text: "Drag one tab onto another, or onto the left or right of the page, to see the two side by side.",
      },
      {
        title: "Pin the pair",
        text: "Pin a split view, and it opens again as the same two pages, side by side.",
      },
      {
        title: "Chrome 155 or later",
        text: "Katip builds on Chrome’s own split view, which arrived in Chrome 155.",
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
        title: "Know where you are",
        text: "A Space’s colors fill the side panel, so you can tell at a glance which Space you’re in.",
      },
      {
        title: "Gradients or solid colors",
        text: "Start from a preset, or pick a color and let the rest of the gradient follow. Then set the intensity and lay on a texture, from grain to film, linen or paper.",
      },
      {
        title: "Light, dark or auto",
        text: "Each Space can follow your system or stay light or dark, and Spotlight follows along.",
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
        text: "A folder that lists your Gmail inbox or a label, or your GitHub review requests, pull requests, issues and mentions, using the accounts you’re already signed in to.",
      },
      temporaryTabs: {
        title: "Temporary tabs",
        text: "Tabs you don’t pin are temporary. Clear them with one click, or have Katip close the ones you haven’t viewed for a while and keep them in the archive.",
      },
      shortcuts: {
        title: "Keyboard shortcuts",
        text: "Open the side panel or Spotlight, step through a Space’s tabs, pin a tab, and copy the URL or a Markdown link. Choose your own keys in Chrome’s shortcut settings.",
      },
      tour: {
        title: "A tour to start",
        text: "When you install Katip, a short tour checks that its keyboard shortcuts are set and shows you around, letting you try things as you go. Take it again from the settings.",
      },
      data: {
        title: "Export and import",
        text: "Export your Spaces, pins, Favorites and settings to a file, and import them again whenever you need to.",
      },
      languages: {
        title: "Four languages",
        text: "English, Japanese, Simplified Chinese and Spanish. Katip follows your browser’s language, or you can choose one in the settings.",
      },
    },
  },
  arc: {
    eyebrow: "Coming from Arc?",
    title: "Move over from Arc in a minute",
    lead: "Bring your Spaces and their colors, pinned tabs, folders, split views and Favorites over from Arc’s sidebar file.",
    screenshotAlt:
      "Katip’s settings on the Data page, previewing an import from Arc: the Spaces to import from each Arc profile, whether to keep them as separate Spaces or combine them into one, and what will be added: 4 Spaces, 9 pinned tabs, 3 folders, 2 split views and 3 Favorites.",
    stepsTitle: "How to move over",
    locationsTitle: "Where to find Arc’s file",
    steps: {
      openSettings: [
        "Open Katip’s settings and choose ",
        { strong: "Data → Import from Arc" },
        ".",
      ],
      chooseFile: ["Choose Arc’s sidebar file, ", { code: "StorableSidebar.json" }, "."],
      import: ["Check the preview, then import."],
    },
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
      "Katip only adds. Nothing you already have is changed or removed.",
      "The file is read inside your browser and never sent anywhere.",
    ],
  },
  privacy: {
    eyebrow: "Privacy",
    title: "Nothing leaves your browser",
    lead: "Katip has no server and collects nothing. Your Spaces, pins and settings live in Chrome’s own storage and bookmarks.",
    points: [
      {
        title: "No account, no tracking",
        text: "There’s nothing to sign up for, and no analytics, telemetry or ads. Katip sends nothing to its developer and loads no code from the internet.",
      },
      {
        title: "Update checks you can turn off",
        text: "Katip asks GitHub for its latest release the first time the side panel opens after the browser starts. The request carries nothing from Katip.",
      },
      {
        title: "Live folders, if you allow them",
        text: "Live folders talk to Gmail and GitHub directly from your browser, with the sign-in you already have, and only after you allow access to that site.",
      },
    ],
    policyLink: "Read the privacy policy",
  },
  openSource: {
    eyebrow: "Open source",
    title: "Free, and open source",
    lead: "All of Katip’s code is on GitHub under the MIT License. Read it, report an issue, or build on it. The name and logo aren’t covered by the license, so please give your version its own.",
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
