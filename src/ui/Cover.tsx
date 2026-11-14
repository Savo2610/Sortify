import { LIKED } from "../lib/types";
import type { Playlist } from "../lib/types";
import { Heart, Note } from "./Icons";

/** Kleines Titelbild einer Playlist; Lieblingssongs bekommen das Herz. */
export function Thumb({ playlist }: { playlist: Playlist }) {
  if (playlist.id === LIKED) {
    return (
      <span className="thumb liked">
        <Heart size={18} />
      </span>
    );
  }
  if (playlist.cover) return <img className="thumb" src={playlist.cover} alt="" loading="lazy" />;
  return (
    <span className="thumb">
      <Note size={18} />
    </span>
  );
}
