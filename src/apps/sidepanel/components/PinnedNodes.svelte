<script lang="ts">
  import type { BookmarkId } from "#platform/browser"
  import type { PinnedNodeView } from "#protocol"
  import { slotAt } from "../logic/drag-drop"
  import PinnedFolder from "./PinnedFolder.svelte"
  import PinnedItemRow from "./PinnedItemRow.svelte"

  interface Props {
    nodes: ReadonlyArray<PinnedNodeView>
    parentId: BookmarkId | null
  }

  const { nodes, parentId }: Props = $props()
</script>

<ul class="nodes" class:nested={parentId !== null}>
  {#each nodes as node, index (node.bookmarkId)}
    {#if node._tag === "PinnedFolder"}
      <PinnedFolder folder={node} position={{ parentId, index }} />
    {:else}
      <PinnedItemRow
        item={node}
        position={{ parentId, index }}
        dropTargetAt={(edge) => ({ _tag: "Pinned", parentId, slot: slotAt(index, edge) })}
      />
    {/if}
  {/each}
</ul>

<style>
  .nodes {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
  }

  .nested {
    margin: 2px 0 2px 17px;
    padding-left: 6px;
    border-left: 1px solid var(--rule);
  }
</style>
