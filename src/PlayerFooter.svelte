<script lang="ts">
  import {
    player,
    currentLyric,
    toggle,
    next,
    previous,
    attachAudio,
    observeHostBoot,
  } from './player-store.ts';
  import type { RuntimeSnapshot } from './shared/protocol.ts';
  import { onMount } from 'svelte';

  let { snapshot }: { snapshot: RuntimeSnapshot | null } = $props();

  let element: HTMLAudioElement;

  onMount(() => attachAudio(element));
  $effect(() => observeHostBoot(snapshot?.bootId));
</script>

<audio bind:this={element} preload="metadata"></audio>

{#if $player.tracks.length}
  <div class="footer">
    <span class="title">{$player.tracks[$player.current]?.name ?? '未播放'}</span>
    <span class="lyric">{currentLyric() ?? ''}</span>
    <div class="actions">
      <button type="button" aria-label="上一首" onclick={() => void previous()}>‹</button>
      <button type="button" aria-label={$player.playing ? '暂停' : '播放'} onclick={() => void toggle()}>
        {$player.playing ? '❚❚' : '▶'}
      </button>
      <button type="button" aria-label="下一首" onclick={() => void next()}>›</button>
    </div>
  </div>
{/if}

<style>
  .footer { display: flex; align-items: center; gap: 1rem; width: 100%; min-width: 0; }
  .title { font-size: .85rem; font-weight: 600; white-space: nowrap; }
  .lyric { flex: 1; min-width: 0; overflow: hidden; color: var(--muted); font-size: .8rem; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
  .actions { display: flex; gap: .35rem; }
  button { min-width: 2rem; min-height: 1.8rem; border: 1px solid var(--line); border-radius: .4rem; background: transparent; color: inherit; cursor: pointer; }
</style>
