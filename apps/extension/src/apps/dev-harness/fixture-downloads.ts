import type { Download } from "../sidepanel/logic/downloads"
import { DownloadId } from "../sidepanel/logic/downloads"

const MINUTE = 60_000
const MB = 1024 * 1024

/** Downloads in every state the side panel shows, the first one still running at `now`. */
export const fixtureDownloads = (now: number): ReadonlyArray<Download> => [
  {
    id: DownloadId.make(6),
    fileName: "katip-1.9.0.zip",
    url: "https://github.com/qaynam/Katip/releases/download/v1.9.0/katip-1.9.0.zip",
    startedAt: now - 20_000,
    progress: {
      _tag: "InProgress",
      receivedBytes: Math.round(3.4 * MB),
      totalBytes: Math.round(8.2 * MB),
    },
  },
  {
    id: DownloadId.make(5),
    fileName: "Quarterly report.pdf",
    url: "https://docs.example.com/files/quarterly-report.pdf",
    startedAt: now - 6 * MINUTE,
    progress: { _tag: "Complete", bytes: Math.round(2.3 * MB) },
  },
  {
    id: DownloadId.make(4),
    fileName: "Launch screens.fig",
    url: "blob:https://www.figma.com/2f1c6a3e-8a7b-4c2d-9e10-5b6a7c8d9e0f",
    startedAt: now - 25 * MINUTE,
    progress: {
      _tag: "Paused",
      receivedBytes: Math.round(41 * MB),
      totalBytes: Math.round(96 * MB),
      canResume: true,
    },
  },
  {
    id: DownloadId.make(3),
    fileName: "census-2025.csv",
    url: "https://data.example.org/exports/census-2025.csv",
    startedAt: now - 2 * 60 * MINUTE,
    progress: { _tag: "Failed", canResume: true },
  },
  {
    id: DownloadId.make(2),
    fileName: "IMG_4821.HEIC",
    url: "https://photos.example.net/download/IMG_4821.HEIC",
    startedAt: now - 26 * 60 * MINUTE,
    progress: { _tag: "Deleted" },
  },
  {
    id: DownloadId.make(1),
    fileName: "conference-talk.mp4",
    url: "https://video.example.com/talks/conference-talk.mp4",
    startedAt: now - 3 * 24 * 60 * MINUTE,
    progress: { _tag: "Canceled" },
  },
]
