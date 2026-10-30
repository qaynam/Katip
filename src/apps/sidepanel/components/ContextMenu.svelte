<script lang="ts">
  import { getSidebarContext } from "../state/sidebar-context"
  import MenuPanel from "./MenuPanel.svelte"

  const ctx = getSidebarContext()
</script>

{#if ctx.menu.current !== null}
  {@const menu = ctx.menu.current}
  {#key menu}
    <MenuPanel {menu} onClose={() => ctx.menu.close()} />
  {/key}
{/if}
