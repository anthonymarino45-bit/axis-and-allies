import { useEffect } from "react";
import { GameMap } from "@/components/GameMap";
import { CommandPanel } from "@/components/CommandPanel";
import { BattleDialog } from "@/components/BattleDialog";
import { MoveDialog } from "@/components/MoveDialog";
import { MusicPlayer } from "@/components/MusicPlayer";
import { VictoryScreen } from "@/components/VictoryScreen";
import { RulesReference } from "@/components/RulesReference";
import { MultiplayerPanel } from "@/components/MultiplayerPanel";
import { BattleCutscene } from "@/components/BattleCutscene";
import { DiplomacyNotices } from "@/components/DiplomacyNotices";
import { SavesPanel } from "@/components/SavesPanel";
import { useGame } from "@/game/store";
import { useNet } from "@/game/multiplayer";
import { canRunAI, isAINation } from "@/game/control";

export function GameScreen() {
  const currentPlayer = useGame((s) => s.game.currentPlayer);
  const aiTurnInProgress = useGame((s) => s.aiTurnInProgress);
  const runAITurn = useGame((s) => s.runAITurn);
  // Seat changes and match start/hold can hand a turn to the AI.
  const seats = useNet((s) => s.seats);
  const started = useNet((s) => s.started);
  const mode = useNet((s) => s.mode);

  useEffect(() => {
    if (canRunAI() && isAINation(currentPlayer) && !aiTurnInProgress) {
      runAITurn();
    }
  }, [currentPlayer, aiTurnInProgress, runAITurn, seats, started, mode]);

  return (
    <main className="flex h-[100dvh] w-screen flex-col overflow-hidden lg:flex-row">
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden p-2 lg:p-4">
        <GameMap />
      </div>
      <CommandPanel />
      <BattleDialog />
      <BattleCutscene />
      <DiplomacyNotices />
      <SavesPanel />
      <MoveDialog />
      <MusicPlayer />
      <RulesReference />
      <MultiplayerPanel />
      <VictoryScreen />
    </main>
  );
}
