<script lang="ts">
  let {
    label,
    description,
    checked,
    onchange,
  }: {
    label: string
    description?: string
    checked: boolean
    onchange: (checked: boolean) => void
  } = $props()

  const id = $props.id()
</script>

<div class="setting">
  <div class="text">
    <label for={id}>{label}</label>
    {#if description}
      <p id="{id}-description" class="description">{description}</p>
    {/if}
  </div>
  <input
    {id}
    type="checkbox"
    role="switch"
    {checked}
    aria-describedby={description ? `${id}-description` : undefined}
    onchange={(event) => onchange(event.currentTarget.checked)}
  />
</div>

<style>
  .setting {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    padding: 16px 0;
  }

  .text {
    min-width: 0;
  }

  label {
    display: block;
    font-weight: 600;
    line-height: 1.5;
    cursor: pointer;
  }

  .description {
    margin: 4px 0 0;
    color: var(--ink-muted);
    font-size: 0.8125rem;
    line-height: 1.6;
    text-wrap: pretty;
  }

  input {
    flex: none;
    appearance: none;
    position: relative;
    width: 40px;
    height: 24px;
    margin: 0;
    border-radius: 12px;
    background: var(--switch-off);
    cursor: pointer;
    transition: background-color 120ms ease-out;
  }

  input::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--surface);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.25);
    transition: transform 120ms ease-out;
  }

  input:checked {
    background: var(--accent);
  }

  input:checked::after {
    transform: translateX(16px);
  }

  input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    input,
    input::after {
      transition: none;
    }
  }
</style>
