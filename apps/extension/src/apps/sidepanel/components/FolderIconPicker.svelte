<script lang="ts">
  import { getSidebarContext } from "../state/sidebar-context"
  import FolderIconPickerPanel from "./FolderIconPickerPanel.svelte"

  const ctx = getSidebarContext()
</script>

{#if ctx.folderIconPicker.current !== null}
  {@const picker = ctx.folderIconPicker.current}
  {#key picker}
    <FolderIconPickerPanel {picker} onClose={() => ctx.folderIconPicker.close()} />
  {/key}
{/if}
