<script lang="ts">
  import { SPOTLIGHT_LAYOUTS, SpotlightSize } from "#modules/spotlight"

  let {
    legend,
    value,
    labelOf,
    onchange,
  }: {
    legend: string
    value: SpotlightSize
    labelOf: (size: SpotlightSize) => string
    onchange: (size: SpotlightSize) => void
  } = $props()

  const id = $props.id()

  // Each picture is drawn to scale from Spotlight's measurements, over a browser window 960 by 600
  // pixels wide, so the three differ by as much as the real windows do
  const SCALE = 0.15
  const VIEW = { width: 960 * SCALE, height: 600 * SCALE }
  const TITLE_BAR = 28 * SCALE
  const HINTS = 30 * SCALE

  const pictureOf = (size: SpotlightSize) => {
    const layout = SPOTLIGHT_LAYOUTS[size]
    const width = layout.window.width * SCALE
    const height = layout.window.height * SCALE
    const x = (VIEW.width - width) / 2
    const y = (VIEW.height - height) * 0.3
    const search = { y: y + TITLE_BAR, height: layout.searchHeight * SCALE }
    const rowHeight = layout.rowHeight * SCALE
    const rowsTop = search.y + search.height + 1.2
    const rowCount = Math.floor((y + height - HINTS - rowsTop) / rowHeight)
    const rows = Array.from({ length: rowCount }, (_, index) => rowsTop + index * rowHeight)
    return { x, y, width, height, search, rowHeight, rows, detailBesideTitle: size === "Compact" }
  }
</script>

<fieldset>
  <legend>{legend}</legend>
  <div class="options">
    {#each SpotlightSize.literals as size (size)}
      {@const picture = pictureOf(size)}
      <label class="option">
        <svg
          class="picture"
          viewBox="0 0 {VIEW.width} {VIEW.height}"
          aria-hidden="true"
          preserveAspectRatio="xMidYMid meet"
        >
          <rect
            class="window"
            x={picture.x}
            y={picture.y}
            width={picture.width}
            height={picture.height}
            rx="2.5"
          />
          <rect
            class="title-bar"
            x={picture.x}
            y={picture.y}
            width={picture.width}
            height={TITLE_BAR}
            rx="2.5"
          />
          <circle
            class="ink"
            cx={picture.x + 4.5}
            cy={picture.search.y + picture.search.height / 2}
            r={picture.search.height * 0.16}
          />
          <rect
            class="faint-ink"
            x={picture.x + 8}
            y={picture.search.y + picture.search.height / 2 - 1}
            width={picture.width * 0.4}
            height="2"
            rx="1"
          />
          <line
            class="divider"
            x1={picture.x}
            x2={picture.x + picture.width}
            y1={picture.search.y + picture.search.height}
            y2={picture.search.y + picture.search.height}
          />
          {#each picture.rows as rowY, index (rowY)}
            {@const middle = rowY + picture.rowHeight / 2}
            {@const icon = picture.rowHeight * 0.55}
            {#if index === 0}
              <rect
                class="selected-row"
                x={picture.x + 1.5}
                y={rowY + 0.4}
                width={picture.width - 3}
                height={picture.rowHeight - 0.8}
                rx="1.2"
              />
            {/if}
            <rect
              class="faint-ink"
              x={picture.x + 3.5}
              y={middle - icon / 2}
              width={icon}
              height={icon}
              rx="0.8"
            />
            {#if picture.detailBesideTitle}
              <rect
                class="ink"
                x={picture.x + 5.5 + icon}
                y={middle - 0.9}
                width={picture.width * 0.3}
                height="1.8"
                rx="0.9"
              />
              <rect
                class="faint-ink"
                x={picture.x + 7 + icon + picture.width * 0.3}
                y={middle - 0.8}
                width={picture.width * 0.24}
                height="1.6"
                rx="0.8"
              />
            {:else}
              <rect
                class="ink"
                x={picture.x + 5.5 + icon}
                y={middle - 2.4}
                width={picture.width * 0.42}
                height="1.8"
                rx="0.9"
              />
              <rect
                class="faint-ink"
                x={picture.x + 5.5 + icon}
                y={middle + 0.9}
                width={picture.width * 0.3}
                height="1.6"
                rx="0.8"
              />
            {/if}
          {/each}
        </svg>
        <span class="choice">
          <input
            type="radio"
            name="{id}-size"
            value={size}
            checked={value === size}
            onchange={() => onchange(size)}
          />
          {labelOf(size)}
        </span>
      </label>
    {/each}
  </div>
</fieldset>

<style>
  fieldset {
    min-width: 0;
    margin: 0;
    padding: 11px 0 0;
    border: none;
  }

  legend {
    float: left;
    width: 100%;
    margin: 0 0 12px;
    padding: 0;
    font-size: 14px;
    letter-spacing: -0.003em;
  }

  .options {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    clear: both;
    gap: 14px;
  }

  .option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 9px;
    font-weight: 400;
  }

  .picture {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 16 / 10;
    border: 0.5px solid var(--control-edge);
    border-radius: 10px;
    background: color-mix(in srgb, var(--text) 4%, transparent);
    color: var(--text);
    transition: box-shadow 120ms ease;
  }

  .option:hover .picture {
    background: color-mix(in srgb, var(--text) 6%, transparent);
  }

  .option:has(input:checked) .picture {
    box-shadow: 0 0 0 2px var(--text);
  }

  .window {
    fill: var(--control-face);
    stroke: var(--control-edge);
    stroke-width: 0.5;
  }

  .title-bar {
    fill: color-mix(in srgb, currentColor 7%, transparent);
  }

  .divider {
    stroke: color-mix(in srgb, currentColor 12%, transparent);
    stroke-width: 0.5;
  }

  .selected-row {
    fill: color-mix(in srgb, currentColor 9%, transparent);
  }

  .ink {
    fill: color-mix(in srgb, currentColor 45%, transparent);
  }

  .faint-ink {
    fill: color-mix(in srgb, currentColor 20%, transparent);
  }

  .choice {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  input {
    margin: 0;
    accent-color: var(--text);
  }
</style>
