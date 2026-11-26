import assert from 'node:assert/strict';
import { test } from 'node:test';
import { get } from 'svelte/store';
import { observeHostBoot, player } from '../src/player-store.ts';

test('a new Host boot drops media created before the restart', () => {
  const revoked = [];
  const original = URL.revokeObjectURL;
  URL.revokeObjectURL = (url) => revoked.push(url);
  try {
    observeHostBoot('boot-a');
    player.set({
      tracks: [
        { name: 'one.mp3', url: 'blob:one', lyrics: [] },
        { name: 'two.mp3', url: 'blob:two', lyrics: [] },
      ],
      current: 1,
      playing: true,
      duration: 30,
      position: 12,
      volume: 0.4,
    });

    // The same boot keeps the current library and playback.
    observeHostBoot('boot-a');
    assert.equal(get(player).tracks.length, 2);
    assert.deepEqual(revoked, []);

    // A Host restart invalidates object URLs owned by the previous boot.
    observeHostBoot('boot-b');
    assert.deepEqual(get(player), {
      tracks: [],
      current: -1,
      playing: false,
      duration: 0,
      position: 0,
      volume: 0.4,
    });
    assert.deepEqual(revoked, ['blob:one', 'blob:two']);
  } finally {
    if (original === undefined) delete URL.revokeObjectURL;
    else URL.revokeObjectURL = original;
  }
});
