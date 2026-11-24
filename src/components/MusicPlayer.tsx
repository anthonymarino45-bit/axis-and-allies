import { useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";

// Background march. Drop an MP3 at public/audio/march.mp3 (for example a
// public-domain U.S. Marine Band recording of Sousa's "Semper Fidelis").
// Until that file exists the player stays hidden.
const TRACK_URL = `${import.meta.env.BASE_URL}audio/march.mp3`;

export function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(40);
  const [error, setError] = useState(false);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume / 100;
  }, [volume]);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
    } else {
      try {
        setError(false);
        await a.play();
      } catch (e) {
        setError(true);
        console.error("audio play failed", e);
      }
    }
  };

  if (missing) return null;

  return (
    <div className="fixed bottom-[4.25rem] left-3 z-20 flex items-center gap-2 rounded-md border border-border bg-background/90 px-3 py-2 shadow-lg backdrop-blur lg:bottom-3 lg:left-3 lg:z-50">
      <audio
        ref={audioRef}
        src={TRACK_URL}
        loop
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => {
          setPlaying(false);
          // No track has been added to the project: hide the player.
          if (!audioRef.current?.currentTime) setMissing(true);
          else setError(true);
        }}
      />
      <Button
        size="icon"
        variant="ghost"
        onClick={toggle}
        aria-label={playing ? "Pause music" : "Play music"}
        className="h-8 w-8"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
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
        className="w-32"
        aria-label="Volume"
      />
      <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">{volume}</span>
      {error && <span className="text-xs text-destructive">Music unavailable</span>}
    </div>
  );
}
