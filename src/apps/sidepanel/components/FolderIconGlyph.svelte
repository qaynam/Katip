<script lang="ts" module>
  import type { FolderIcon } from "#modules/pinned"
  import airplane from "@phosphor-icons/core/fill/airplane-tilt-fill.svg?url"
  import asterisk from "@phosphor-icons/core/fill/asterisk-fill.svg?url"
  import bell from "@phosphor-icons/core/fill/bell-fill.svg?url"
  import bolt from "@phosphor-icons/core/fill/lightning-fill.svg?url"
  import bookmark from "@phosphor-icons/core/fill/bookmark-simple-fill.svg?url"
  import chat from "@phosphor-icons/core/fill/chat-circle-fill.svg?url"
  import circle from "@phosphor-icons/core/fill/circle-fill.svg?url"
  import cloud from "@phosphor-icons/core/fill/cloud-fill.svg?url"
  import code from "@phosphor-icons/core/fill/code-fill.svg?url"
  import egg from "@phosphor-icons/core/fill/egg-fill.svg?url"
  import hammer from "@phosphor-icons/core/fill/hammer-fill.svg?url"
  import heart from "@phosphor-icons/core/fill/heart-fill.svg?url"
  import leaf from "@phosphor-icons/core/fill/leaf-fill.svg?url"
  import lightbulb from "@phosphor-icons/core/fill/lightbulb-fill.svg?url"
  import moon from "@phosphor-icons/core/fill/moon-fill.svg?url"
  import music from "@phosphor-icons/core/fill/music-note-fill.svg?url"
  import paw from "@phosphor-icons/core/fill/paw-print-fill.svg?url"
  import people from "@phosphor-icons/core/fill/users-fill.svg?url"
  import planet from "@phosphor-icons/core/fill/planet-fill.svg?url"
  import skull from "@phosphor-icons/core/fill/skull-fill.svg?url"
  import star from "@phosphor-icons/core/fill/star-fill.svg?url"
  import triangle from "@phosphor-icons/core/fill/triangle-fill.svg?url"
  import video from "@phosphor-icons/core/fill/video-camera-fill.svg?url"
  import wrench from "@phosphor-icons/core/fill/wrench-fill.svg?url"

  const artwork = {
    star,
    bookmark,
    heart,
    bolt,
    triangle,
    asterisk,
    bell,
    lightbulb,
    chat,
    people,
    wrench,
    egg,
    circle,
    moon,
    planet,
    leaf,
    cloud,
    paw,
    hammer,
    airplane,
    music,
    video,
    code,
    skull,
  } as const satisfies Record<FolderIcon, string>
</script>

<script lang="ts">
  interface Props {
    icon: FolderIcon
    size?: number
  }

  const { icon, size = 16 }: Props = $props()
</script>

<!-- Embedding the SVG as an element would mean injecting its markup with {@html}, so it
     serves as a mask painted with the text color -->
<span
  class="glyph"
  data-folder-icon={icon}
  style:width="{size}px"
  style:height="{size}px"
  style:mask-image={`url("${artwork[icon]}")`}
  aria-hidden="true"
></span>

<style>
  .glyph {
    display: block;
    flex: none;
    background-color: currentColor;
    mask-position: center;
    mask-size: contain;
    mask-repeat: no-repeat;
  }
</style>
