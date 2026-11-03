<script lang="ts">
  import { getSidebarContext } from "../state/sidebar-context"
  import ThemePickerPanel from "./picker/ThemePickerPanel.svelte"

  const ctx = getSidebarContext()

  const close = () => {
    ctx.themeDraft.release()
    ctx.themePicker.close()
  }
</script>

{#if ctx.themePicker.current !== null}
  {@const picker = ctx.themePicker.current}
  {#key picker}
    <ThemePickerPanel {picker} onClose={close} />
  {/key}
{/if}
