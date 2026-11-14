import { getToken } from "./auth";
import { ApiError, Store, sleep } from "./types";
import type { Api, Device, Track } from "./types";

export interface PlayerState {
  /** Name des Geräts, auf dem abgespielt wird; leer, solange keines bereit ist. */
  deviceName: string;
  /** "local" = dieser Browser, sonst die ID eines Spotify-Connect-Geräts. */
  device: string;
  /** Ob dieser Browser selbst abspielen kann (Web Playback SDK bereit). */
  localReady: boolean;
  paused: boolean;
  loading: boolean;
  position: number;
  duration: number;
  /** performance.now() zum Zeitpunkt von `position`. */
  at: number;
  error: string | null;
}

export const LOCAL = "local";
const DEVICE_KEY = "sortify.device";

const initial: PlayerState = {
  deviceName: "",
  device: LOCAL,
  localReady: false,
  paused: true,
  loading: false,
  position: 0,
  duration: 0,
  at: 0,
  error: null,
};

export abstract class Player extends Store<PlayerState> {
  constructor() {
    super(initial);
  }
  abstract init(): void;
  abstract play(track: Track, positionMs: number): Promise<void>;
  abstract toggle(): void;
  abstract seek(positionMs: number): void;
  abstract pause(): void;
  abstract devices(): Promise<Device[]>;
  abstract use(device: string, name: string): void;
  /** In einem Klick aufrufen: Mobil-Browser spielen sonst keinen Ton. */
  activate() {}

  position() {
    const s = this.state;
    const pos = s.paused ? s.position : s.position + (performance.now() - s.at);
    return Math.min(Math.max(0, pos), s.duration || Infinity);
  }

  seekBy(deltaMs: number) {
    this.seek(Math.max(0, Math.min(this.position() + deltaMs, Math.max(0, this.state.duration - 1000))));
  }
}

/* ---------- Spotify: Web Playback SDK im Browser oder ein Connect-Gerät ---------- */

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: { Player: new (options: any) => any };
  }
}

export class SpotifyPlayer extends Player {
  private sdk: any = null;
  private localId: string | null = null;
  private current: Track | null = null;
  private started = false;
  private seq = 0;
  private poll: number | undefined;

  constructor(private api: Api) {
    super();
    try {
      const saved = JSON.parse(localStorage.getItem(DEVICE_KEY) ?? "null");
      if (saved?.id) this.state = { ...this.state, device: saved.id, deviceName: saved.name };
    } catch {
      // Standard: dieser Browser
    }
  }

  init() {
    if (this.sdk || document.getElementById("spotify-sdk")) return;
    window.onSpotifyWebPlaybackSDKReady = () => {
      const sdk = new window.Spotify!.Player({
        name: "Sortify",
        volume: 0.8,
        getOAuthToken: (cb: (token: string) => void) => {
          getToken().then(cb, () => {});
        },
      });
      this.sdk = sdk;
      sdk.addListener("ready", ({ device_id }: { device_id: string }) => {
        this.localId = device_id;
        this.set({ localReady: true });
        if (this.state.device === LOCAL) this.set({ deviceName: "Dieser Browser", error: null });
      });
      sdk.addListener("not_ready", () => {
        this.localId = null;
        this.set({ localReady: false });
      });
      sdk.addListener("player_state_changed", (s: any) => {
        if (!s || this.state.device !== LOCAL) return;
        this.set({
          paused: s.paused,
          position: s.position,
          duration: s.duration || this.state.duration,
          at: performance.now(),
          loading: s.loading === true,
        });
      });
      sdk.addListener("autoplay_failed", () => this.set({ paused: true, loading: false }));
      const fail = (error: string) => () => {
        if (this.state.device === LOCAL) this.set({ error, loading: false });
      };
      sdk.addListener("initialization_error", fail("Dieser Browser kann nicht abspielen"));
      sdk.addListener("account_error", fail("Wiedergabe braucht Spotify Premium"));
      sdk.addListener("authentication_error", fail("Spotify-Anmeldung abgelaufen"));
      sdk.connect();
    };
    const script = document.createElement("script");
    script.id = "spotify-sdk";
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.onerror = () => this.set({ error: "Dieser Browser kann nicht abspielen" });
    document.head.append(script);

    this.poll = window.setInterval(() => this.refresh(), 3000);
  }

  activate() {
    this.sdk?.activateElement?.();
  }

  private remote() {
    return this.state.device !== LOCAL;
  }

  /** Geräte-ID fürs Abspielen; wartet kurz, bis der Browser-Player bereit ist. */
  private async target(): Promise<string | null> {
    if (this.remote()) return this.state.device;
    for (let i = 0; i < 40 && !this.localId && !this.state.error; i++) await sleep(200);
    return this.localId;
  }

  async play(track: Track, positionMs: number) {
    const seq = ++this.seq;
    this.current = track;
    this.started = false;
    this.set({
      loading: true,
      paused: true,
      position: positionMs,
      duration: track.durationMs,
      at: performance.now(),
    });
    const device = await this.target();
    if (seq !== this.seq) return;
    if (!device) {
      this.set({ loading: false, error: this.state.error ?? "Kein Wiedergabegerät" });
      return;
    }
    for (let attempt = 0; ; attempt++) {
      try {
        await this.api.play(device, track.uri, positionMs);
        break;
      } catch (err) {
        if (seq !== this.seq) return;
        // Ein frisch angemeldetes Gerät kennt Spotify manchmal erst einen Moment später.
        const status = err instanceof ApiError ? err.status : 0;
        if ((status === 404 || status === 502) && attempt < 3) {
          await sleep(600);
          continue;
        }
        this.set({
          loading: false,
          error:
            status === 404
              ? "Gerät nicht erreichbar"
              : status === 403
                ? "Wiedergabe braucht Spotify Premium"
                : "Wiedergabe fehlgeschlagen",
        });
        return;
      }
    }
    if (seq !== this.seq) return;
    this.started = true;
    this.set({ loading: false, paused: false, at: performance.now(), error: null });
  }

  toggle() {
    const { paused, device } = this.state;
    if (!this.started) {
      if (this.current) this.play(this.current, this.state.position);
      return;
    }
    if (this.remote()) {
      this.set({ paused: !paused, position: this.position(), at: performance.now() });
      (paused ? this.api.resume(device) : this.api.pause(device)).catch(() => this.refresh());
    } else {
      this.sdk?.togglePlay();
    }
  }

  seek(positionMs: number) {
    this.set({ position: positionMs, at: performance.now() });
    if (!this.started) return;
    if (this.remote()) this.api.seek(this.state.device, positionMs).catch(() => {});
    else this.sdk?.seek(positionMs);
  }

  pause() {
    this.seq++;
    if (!this.started) return;
    this.set({ paused: true, position: this.position(), at: performance.now() });
    if (this.remote()) this.api.pause(this.state.device).catch(() => {});
    else this.sdk?.pause();
  }

  /** Stand eines Connect-Geräts abfragen – der Browser-Player meldet sich von selbst. */
  private async refresh() {
    if (!this.remote() || !this.started || document.visibilityState !== "visible") return;
    const seq = this.seq;
    try {
      const s = await this.api.playback();
      if (s && seq === this.seq) this.set({ ...s, at: performance.now() });
    } catch {
      // nächste Runde
    }
  }

  async devices() {
    const all = await this.api.devices();
    return all.filter((d) => d.id !== this.localId);
  }

  use(device: string, name: string) {
    if (device === this.state.device) return;
    const resumeAt = this.position();
    this.pause();
    if (device === LOCAL) localStorage.removeItem(DEVICE_KEY);
    else localStorage.setItem(DEVICE_KEY, JSON.stringify({ id: device, name }));
    this.set({
      device,
      deviceName: device === LOCAL ? (this.state.localReady ? "Dieser Browser" : "") : name,
      error: null,
    });
    if (this.current) this.play(this.current, resumeAt);
  }
}

/* ---------- Demo: zählt nur die Zeit ---------- */

export class DemoPlayer extends Player {
  init() {
    this.set({ deviceName: "Dieser Browser", localReady: true });
    window.setInterval(() => {
      const s = this.state;
      if (!s.paused && this.position() >= s.duration) this.set({ paused: true, position: 0 });
    }, 500);
  }
  async play(track: Track, positionMs: number) {
    this.set({ paused: false, position: positionMs, duration: track.durationMs, at: performance.now() });
  }
  toggle() {
    this.set({ paused: !this.state.paused, position: this.position(), at: performance.now() });
  }
  seek(positionMs: number) {
    this.set({ position: positionMs, at: performance.now() });
  }
  pause() {
    this.set({ paused: true, position: this.position(), at: performance.now() });
  }
  async devices(): Promise<Device[]> {
    return [{ id: "phone", name: "iPhone", type: "Smartphone" }];
  }
  use(device: string, name: string) {
    this.set({ device, deviceName: device === LOCAL ? "Dieser Browser" : name });
  }
}
