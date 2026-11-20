<script lang="ts">
  import { getSidebarContext } from "../state/sidebar-context"
  import SoundForm from "./SoundForm.svelte"

  const ctx = getSidebarContext()
</script>

{#if ctx.soundDialog.current !== null}
  {@const request = ctx.soundDialog.current}
  {#key request}
    <SoundForm {request} onClose={() => ctx.soundDialog.close()} />
  {/key}
{/if}
