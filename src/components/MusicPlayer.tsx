import { useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Clapperboard, SkipForward } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/game/settings";
import { SONGS } from "@/audio/songs";
import {
  currentSongName,
  isMarchPlaying,
  nextSong,
  setPlaylist,
  onMusicChange,
  setVolume as setEngineVolume,
  startMarch,
  stopMarch,
  unlockAudio,
} from "@/audio/engine";

setPlaylist(SONGS);

// The game plays its own synthesized WW2-era soundtrack (src/audio/songs.ts). To use a real recording instead
// (for example a public-domain U.S. Marine Band "Semper Fidelis"), add it as
// public/audio/march.mp3 and the player switches to it automatically.
const TRACK_URL = `${import.meta.env.BASE_URL}audio/march.mp3`;

export function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [recording, setRecording] = useState<boolean | null>(null);
  const [recordingPlaying, setRecordingPlaying] = useState(false);
  const [marchPlaying, setMarchPlaying] = useState(false);
  const [songName, setSongName] = useState(currentSongName());
  const volume = useSettings((s) => s.volume);
  const setVolume = useSettings((s) => s.setVolume);
  const cutscenes = useSettings((s) => s.cutscenes);
  const setCutscenes = useSettings((s) => s.setCutscenes);
  const playing = recordingPlaying || marchPlaying;

  // Is there a recording to play? Otherwise use the synthesized march.
  useEffect(() => {
    let cancelled = false;
    fetch(TRACK_URL, { method: "HEAD" })
      .then((r) => {
        const type = r.headers.get("content-type") ?? "";
        if (!cancelled) setRecording(r.ok && type.startsWith("audio"));
      })
      .catch(() => !cancelled && setRecording(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () =>
      onMusicChange(() => {
        setMarchPlaying(isMarchPlaying());
        setSongName(currentSongName());
      }),
    [],
  );
  useEffect(() => () => stopMarch(), []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume / 100;
    setEngineVolume(volume / 100);
  }, [volume]);

  // The first click or key press anywhere enables battle sounds.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const toggle = async () => {
    unlockAudio();
    if (playing) {
      audioRef.current?.pause();
      stopMarch();
      return;
    }
    if (recording && audioRef.current) {
      try {
        await audioRef.current.play();
        return;
      } catch {
        // Fall through to the synthesized march.
      }
    }
    startMarch();
  };

  return (
    <div className="fixed bottom-[4.25rem] left-3 z-20 flex items-center gap-2 rounded-md border border-border bg-background/90 px-3 py-2 shadow-lg backdrop-blur lg:bottom-3 lg:left-3 lg:z-50">
      {recording && (
        <audio
          ref={audioRef}
          src={TRACK_URL}
          loop
          preload="none"
          onPlay={() => setRecordingPlaying(true)}
          onPause={() => setRecordingPlaying(false)}
          onError={() => setRecording(false)}
        />
      )}
      <Button
        size="icon"
        variant="ghost"
        onClick={toggle}
        aria-label={playing ? "Pause music" : "Play music"}
        title={playing ? "Pause the music" : "Play the music"}
        className="h-8 w-8"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      {!recordingPlaying && (
        <>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              unlockAudio();
              nextSong();
            }}
            aria-label="Next song"
            title="Next song"
            className="h-8 w-8"
          >
            <SkipForward className="h-4 w-4" />
          </Button>
          <span
            className="hidden w-28 truncate font-serif text-xs italic text-muted-foreground sm:inline"
            title={songName}
          >
            {songName}
          </span>
        </>
      )}
      {volume === 0 ? (
        <VolumeX className="h-4 w-4 text-muted-foreground" />
      ) : (
        <Volume2 className="h-4 w-4 text-muted-foreground" />
      )}
      <Slider
        value={[volume]}
        onValueChange={(v) => setVolume(v[0] ?? 0)}
        max={100}
        step={1}
        className="w-24 sm:w-32"
        aria-label="Volume"
      />
      <span className="w-7 text-right text-xs text-muted-foreground tabular-nums">{volume}</span>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => setCutscenes(!cutscenes)}
        aria-pressed={cutscenes}
        aria-label={cutscenes ? "Turn battle cut scenes off" : "Turn battle cut scenes on"}
        title={cutscenes ? "Battle cut scenes: on" : "Battle cut scenes: off"}
        className={"h-8 w-8 " + (cutscenes ? "" : "opacity-40")}
      >
        <Clapperboard className="h-4 w-4" />
      </Button>
    </div>
  );
}
