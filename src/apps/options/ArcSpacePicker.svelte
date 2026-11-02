<script lang="ts">
  import {
    type ArcArrangement,
    type ArcConversion,
    type ArcImportChoice,
    ArcProfile,
    type ArcProfileGroup,
    COMBINED_SPACE_NAME,
    type ConvertedArcSpace,
    profileGroupsOf,
  } from "#modules/arc-import"
  import type { Translator } from "#modules/i18n"

  let {
    conversion,
    choice,
    disabled,
    t,
    onchange,
  }: {
    conversion: ArcConversion
    choice: ArcImportChoice
    disabled: boolean
    t: Translator["t"]
    onchange: (choice: ArcImportChoice) => void
  } = $props()

  const id = $props.id()
  const arrangements: ReadonlyArray<ArcArrangement> = ["Separate", "Combined"]

  const groups = $derived(profileGroupsOf(conversion.spaces))
  const isGrouped = $derived(groups.length > 1)

  const nameOf = ({ space }: ConvertedArcSpace) =>
    space.name.trim() === "" ? t("options.data.import.arc.untitledSpace") : space.name

  const labelOf = (profile: ArcProfile) =>
    ArcProfile.$match(profile, {
      Default: () => t("options.data.import.arc.profile.default"),
      Custom: ({ directory }) => directory,
      Unknown: () => t("options.data.import.arc.profile.other"),
    })

  const idsIn = (group: ArcProfileGroup) => group.spaces.map(({ space }) => space.id)

  const chosenCountIn = (group: ArcProfileGroup) =>
    idsIn(group).filter((spaceId) => choice.spaceIds.has(spaceId)).length

  const withSpaces = (spaceIds: ReadonlyArray<string>, isChosen: boolean) => {
    const others = [...choice.spaceIds].filter((spaceId) => !spaceIds.includes(spaceId))
    onchange({ ...choice, spaceIds: new Set(isChosen ? [...others, ...spaceIds] : others) })
  }

  const textOf = (arrangement: ArcArrangement) =>
    arrangement === "Separate"
      ? {
          label: t("options.data.import.arc.separate.label"),
          description: t("options.data.import.arc.separate.description"),
        }
      : {
          label: t("options.data.import.arc.combined.label"),
          description: t("options.data.import.arc.combined.description", {
            name: COMBINED_SPACE_NAME,
          }),
        }
</script>

{#snippet spaceList(spaces: ReadonlyArray<ConvertedArcSpace>)}
  <ul class:nested={isGrouped}>
    {#each spaces as converted (converted.space.id)}
      <li>
        <label>
          <input
            type="checkbox"
            checked={choice.spaceIds.has(converted.space.id)}
            onchange={(event) => withSpaces([converted.space.id], event.currentTarget.checked)}
          />
          <span>{nameOf(converted)}</span>
        </label>
      </li>
    {/each}
  </ul>
{/snippet}

<fieldset class="spaces" {disabled}>
  <legend>{t("options.data.import.arc.spaces")}</legend>
  {#if isGrouped}
    {#each groups as group, index (index)}
      {@const chosen = chosenCountIn(group)}
      <div class="profile" role="group" aria-labelledby="{id}-profile-{index}">
        <label>
          <input
            type="checkbox"
            checked={chosen === group.spaces.length}
            indeterminate={chosen > 0 && chosen < group.spaces.length}
            onchange={(event) => withSpaces(idsIn(group), event.currentTarget.checked)}
          />
          <span id="{id}-profile-{index}" class="profile-name">{labelOf(group.profile)}</span>
        </label>
        {@render spaceList(group.spaces)}
      </div>
    {/each}
  {:else}
    {@render spaceList(conversion.spaces)}
  {/if}
</fieldset>

<fieldset class="arrangements" {disabled}>
  <legend>{t("options.data.import.arc.arrangement")}</legend>
  {#each arrangements as arrangement (arrangement)}
    {@const text = textOf(arrangement)}
    <label class="arrangement">
      <input
        type="radio"
        name="{id}-arrangement"
        value={arrangement}
        checked={choice.arrangement === arrangement}
        aria-labelledby="{id}-{arrangement}-label"
        aria-describedby="{id}-{arrangement}-description"
        onchange={() => onchange({ ...choice, arrangement })}
      />
      <span class="text">
        <span id="{id}-{arrangement}-label">{text.label}</span>
        <span id="{id}-{arrangement}-description" class="description">{text.description}</span>
      </span>
    </label>
  {/each}
</fieldset>

<style>
  fieldset {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: none;
  }

  legend {
    margin: 10px 0 4px;
    padding: 0;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 600;
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  ul.nested {
    padding-left: 22px;
  }

  label {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-weight: 400;
    line-height: 1.5;
  }

  input {
    flex: none;
    margin: 2px 0 0;
    accent-color: var(--text);
  }

  .profile {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .profile-name {
    font-weight: 500;
  }

  .arrangement .text {
    display: flex;
    flex-direction: column;
  }

  .description {
    color: var(--text-muted);
    font-size: 12.5px;
  }
</style>
