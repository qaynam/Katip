<script lang="ts">
  import { getSidebarContext } from "../state/sidebar-context"
  import FolderSearchPanel from "./FolderSearchPanel.svelte"

  const ctx = getSidebarContext()
</script>

{#if ctx.folderSearch.current !== null}
  {@const search = ctx.folderSearch.current}
  {#key search}
    <FolderSearchPanel {search} onClose={() => ctx.folderSearch.close()} />
  {/key}
{/if}
