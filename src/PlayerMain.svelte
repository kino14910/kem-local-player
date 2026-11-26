<script lang="ts">
  import {
    player,
    selectFiles,
    playAt,
    toggle,
    next,
    previous,
    seek,
    setVolume,
    observeHostBoot,
  } from './player-store.ts';
  import type { RuntimeSnapshot } from './shared/protocol.ts';

  let { snapshot }: { snapshot: RuntimeSnapshot | null } = $props();

  $effect(() => observeHostBoot(snapshot?.bootId));

  function choose(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    if (input.files) void selectFiles(input.files);
    input.value = '';
  }

  function clock(seconds: number) {
    if (!Number.isFinite(seconds)) return '0:00';
    const value = Math.floor(seconds);
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  }
</script>

<section class="player">
  <header>
    <div>
      <p class="eyebrow">LOCAL PLAYER</p>
      <h1>本地播放器</h1>
    </div>
    <label class="pick">
      选择音频或文件夹
      <input type="file" accept="audio/*,.mp3,.m4a,.aac,.ogg,.wav,.flac,.lrc" multiple onchange={choose} />
    </label>
  </header>

  {#if $player.tracks.length}
    <div class="layout">
      <ol>
        {#each $player.tracks as track, index (track.url)}
          <li>
            <button type="button" class:active={index === $player.current} onclick={() => void playAt(index)}>
              <span>{track.name}</span>
              {#if track.lyrics.length}<small>含歌词</small>{/if}
            </button>
          </li>
        {/each}
      </ol>
      <div class="controls">
        <div class="transport">
          <button type="button" onclick={() => void previous()}>上一首</button>
          <button type="button" class="primary" onclick={() => void toggle()}>
            {$player.playing ? '暂停' : '播放'}
          </button>
          <button type="button" onclick={() => void next()}>下一首</button>
        </div>
        <label class="slider">
          进度
          <input
            type="range"
            min="0"
            max={$player.duration || 0}
            step="0.1"
            value={$player.position}
            oninput={(event) => seek(Number(event.currentTarget.value))}
          />
          <span>{clock($player.position)} / {clock($player.duration)}</span>
        </label>
        <label class="slider">
          音量
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={$player.volume}
            oninput={(event) => setVolume(Number(event.currentTarget.value))}
          />
        </label>
      </div>
    </div>
  {:else}
    <p class="empty">选择本地音频文件开始播放；同名 `.lrc` 文件会作为歌词。</p>
  {/if}
</section>

<style>
  .player { display: grid; gap: 1.2rem; }
  header { display: flex; align-items: end; justify-content: space-between; gap: 1rem; }
  h1 { margin: 0; font-size: 1.8rem; }
  .eyebrow { margin: 0 0 .25rem; font: 600 .7rem/1.4 monospace; letter-spacing: .12em; color: var(--accent); }
  .pick { padding: .5rem .8rem; border: 1px solid var(--line); border-radius: .6rem; cursor: pointer; }
  .pick input { display: none; }
  .layout { display: grid; grid-template-columns: minmax(12rem, 1fr) minmax(16rem, 1.5fr); gap: 1rem; }
  ol { display: grid; gap: .35rem; max-height: 24rem; overflow: auto; margin: 0; padding: 0; list-style: none; }
  button { border: 1px solid var(--line); border-radius: .5rem; padding: .5rem .75rem; background: transparent; color: inherit; cursor: pointer; }
  li button { display: flex; justify-content: space-between; gap: .5rem; width: 100%; text-align: start; }
  li button.active { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
  small { color: var(--muted); }
  .controls { display: grid; align-content: start; gap: 1rem; padding: 1rem; border: 1px solid var(--line); border-radius: .8rem; }
  .transport { display: flex; gap: .5rem; }
  .primary { border-color: var(--accent); }
  .slider { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: .6rem; }
  .empty { color: var(--muted); }
  @media (max-width: 760px) { .layout { grid-template-columns: 1fr; } header { align-items: start; flex-direction: column; } }
</style>
