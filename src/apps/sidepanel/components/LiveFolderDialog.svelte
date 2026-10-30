<script lang="ts">
  import { getSidebarContext } from "../state/sidebar-context"
  import LiveFolderForm from "./LiveFolderForm.svelte"

  const ctx = getSidebarContext()
</script>

{#if ctx.liveFolderDialog.current !== null}
  {@const request = ctx.liveFolderDialog.current}
  {#key request}
    <LiveFolderForm {request} onClose={() => ctx.liveFolderDialog.close()} />
  {/key}
{/if}
