import { get, writable } from 'svelte/store';

export interface Lyric {
  time: number;
  text: string;
}

export interface Track {
  name: string;
  url: string;
  lyrics: Lyric[];
}

export interface PlayerState {
  tracks: Track[];
  current: number;
  playing: boolean;
  duration: number;
  position: number;
  volume: number;
}

const initialState: PlayerState = {
  tracks: [],
  current: -1,
  playing: false,
  duration: 0,
  position: 0,
  volume: 0.8,
};

export const player = writable<PlayerState>({ ...initialState });

let audio: HTMLAudioElement | undefined;
let hostBoot: string | undefined;

export function attachAudio(element: HTMLAudioElement) {
  audio = element;
  element.volume = get(player).volume;
  const updatePosition = () => {
    player.update((state) => ({ ...state, position: element.currentTime }));
  };
  const updateDuration = () => {
    player.update((state) => ({
      ...state,
      duration: Number.isFinite(element.duration) ? element.duration : 0,
    }));
  };
  const handleEnded = () => {
    void next();
  };
  element.addEventListener('timeupdate', updatePosition);
  element.addEventListener('loadedmetadata', updateDuration);
  element.addEventListener('ended', handleEnded);
  return () => {
    element.removeEventListener('timeupdate', updatePosition);
    element.removeEventListener('loadedmetadata', updateDuration);
    element.removeEventListener('ended', handleEnded);
    // The footer owns the audio element while it is mounted; stop playback
    // even if the Fiber is torn down before the element leaves the document.
    element.pause();
    if (audio === element) audio = undefined;
  };
}

function clearMedia() {
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
  for (const track of get(player).tracks) URL.revokeObjectURL(track.url);
}

/** Release everything this activation created: playback, object URLs and state. */
export function disposePlayer() {
  clearMedia();
  audio = undefined;
  player.set({ ...initialState });
}

/**
 * KEM restarts the Host process on "reload Host" and stamps snapshots with a
 * new bootId. A window that stays alive across that restart must not keep
 * pointing at media URLs owned by the previous Host boot.
 */
export function observeHostBoot(bootId: string | undefined) {
  if (!bootId || bootId === hostBoot) return;
  const first = hostBoot === undefined;
  hostBoot = bootId;
  if (first) return;
  clearMedia();
  const { volume } = get(player);
  player.set({ ...initialState, volume });
  if (audio) audio.volume = volume;
}

function lyricTime(line: string) {
  const match = /^\[(\d{1,2}):(\d{2}(?:\.\d+)?)\]/.exec(line);
  if (!match) return undefined;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return Number.isFinite(seconds) ? seconds : undefined;
}

function parseLrc(text: string): Lyric[] {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const time = lyricTime(line);
      const content = line.replace(/^\[[^\]]+\]/, '').trim();
      return time === undefined || !content ? undefined : { time, text: content };
    })
    .filter((entry): entry is Lyric => !!entry)
    .sort((a, b) => a.time - b.time);
}

export async function selectFiles(files: FileList | File[]) {
  const items = Array.from(files);
  const audioFiles = items.filter(
    (file) => file.type.startsWith('audio/') || /\.(mp3|m4a|aac|ogg|wav|flac)$/i.test(file.name),
  );
  if (!audioFiles.length) return;
  const lyrics = new Map(
    items
      .filter((file) => /\.lrc$/i.test(file.name))
      .map((file) => [file.name.replace(/\.lrc$/i, '').toLowerCase(), file]),
  );
  const tracks: Track[] = await Promise.all(
    audioFiles.map(async (file) => {
      const key = file.name.replace(/\.[^.]+$/, '').toLowerCase();
      const lyric = lyrics.get(key);
      return {
        name: file.name,
        url: URL.createObjectURL(file),
        lyrics: lyric ? parseLrc(await lyric.text()) : [],
      };
    }),
  );
  player.update((state) => ({
    ...state,
    tracks: [...state.tracks, ...tracks],
    current: state.current < 0 ? 0 : state.current,
  }));
  await playAt(get(player).current);
}

export async function playAt(index: number) {
  const state = get(player);
  const track = state.tracks[index];
  if (!track || !audio) return;
  audio.src = track.url;
  audio.currentTime = 0;
  await audio.play();
  player.update((current) => ({
    ...current,
    current: index,
    playing: true,
    duration: 0,
    position: 0,
  }));
}

export async function toggle() {
  const state = get(player);
  if (!audio || state.current < 0) return;
  if (state.playing) {
    audio.pause();
    player.update((current) => ({ ...current, playing: false }));
    return;
  }
  await audio.play();
  player.update((current) => ({ ...current, playing: true }));
}

export async function next() {
  const state = get(player);
  if (!state.tracks.length) return;
  await playAt((state.current + 1) % state.tracks.length);
}

export async function previous() {
  const state = get(player);
  if (!state.tracks.length) return;
  await playAt((state.current - 1 + state.tracks.length) % state.tracks.length);
}

export function seek(seconds: number) {
  if (!audio) return;
  audio.currentTime = Math.max(0, Math.min(seconds, audio.duration || 0));
}

export function setVolume(volume: number) {
  const value = Math.max(0, Math.min(1, volume));
  if (audio) audio.volume = value;
  player.update((state) => ({ ...state, volume: value }));
}

export function currentLyric() {
  const state = get(player);
  const track = state.tracks[state.current];
  if (!track?.lyrics.length) return null;
  const line = track.lyrics.find(
    (lyric, index) =>
      state.position >= lyric.time &&
      (track.lyrics[index + 1]?.time ?? Infinity) > state.position,
  );
  return line?.text ?? null;
}
