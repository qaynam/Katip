import { startPageSound } from "./page-sound"

// Katip puts the script into pages already open when a site starts getting an output, and Chrome
// puts it into every page the site loads after that; a page given it twice would answer twice.
// Marked in the script's own world, not on the page, where the site would see that Katip is there
const world = globalThis as { katipPageSoundStarted?: true }

// Pages served over plain HTTP have no mediaDevices: Chrome lets only secure pages pick an output
if (navigator.mediaDevices !== undefined && world.katipPageSoundStarted === undefined) {
  world.katipPageSoundStarted = true
  startPageSound({
    document,
    mediaDevices: navigator.mediaDevices,
    send: (report) => chrome.runtime.sendMessage(report),
    onMessage: (listener) =>
      chrome.runtime.onMessage.addListener((message: unknown) => listener(message)),
  })
}
