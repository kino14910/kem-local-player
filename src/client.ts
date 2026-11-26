import { get } from 'svelte/store';
import PlayerMain from './PlayerMain.svelte';
import PlayerFooter from './PlayerFooter.svelte';
import { useDesktop, type DesktopContext } from './sdk/desktop.ts';
import {
  player,
  currentLyric,
  toggle,
  next,
  previous,
  disposePlayer,
} from './player-store.ts';

interface ClientContext extends DesktopContext {
  navRail: {
    add(item: { id: string; label: string; view: unknown }): () => Promise<void>;
  };
  surfaces: {
    register(name: 'footer', id: string, component: unknown): () => Promise<void>;
  };
}

export default {
  inject: ['navRail', 'surfaces'],
  async apply(ctx: ClientContext) {
    // Both contributions import the same store module, so the page and the
    // footer read and write one live PlayerState inside this bundle.
    ctx.navRail.add({
      id: 'local-player',
      label: '本地播放器',
      view: PlayerMain,
    });
    ctx.surfaces.register('footer', 'local-player', PlayerFooter);
    // Audio and object URLs belong to this activation, not to either view.
    ctx.effect(() => () => disposePlayer());

    const desktop = await useDesktop(ctx, (id) => {
      if (id === 'toggle') void toggle();
      if (id === 'next') void next();
      if (id === 'previous') void previous();
    });
    await desktop.menu([
      { id: 'previous', label: '上一首' },
      { id: 'toggle', label: '播放 / 暂停' },
      { id: 'next', label: '下一首' },
    ]);

    const updateCaption = () => {
      const state = get(player);
      const track = state.tracks[state.current]?.name;
      const text = track
        ? `${track} · ${currentLyric() ?? (state.playing ? '播放中' : '已暂停')}`
        : null;
      // The desktop scope may close while a caption update is in flight.
      void desktop.caption(text).catch(() => {});
    };
    const unsubscribe = player.subscribe(updateCaption);
    ctx.effect(() => () => unsubscribe());
  },
};
