import { AI_NATIONS, type Nation } from "./types";

/**
 * Who controls each nation. In a local game the fixed AI_NATIONS list
 * decides; an online room installs its own resolver so that every nation
 * without a human in its seat is played by the AI.
 */
export interface ControlResolver {
  /** True when the AI plays this nation. */
  isAI: (nation: Nation) => boolean;
  /** True when this browser may change the game right now. */
  canMutate: (currentPlayer: Nation) => boolean;
  /** True when this browser should run AI turns. */
  canRunAI: () => boolean;
  /** True when this browser keeps the campaign in its own save slot. */
  persistLocally: () => boolean;
}

export const localControl: ControlResolver = {
  isAI: (nation) => AI_NATIONS.includes(nation),
  canMutate: () => true,
  canRunAI: () => true,
  persistLocally: () => true,
};

let resolver: ControlResolver = localControl;

export function setControlResolver(next: ControlResolver | null): void {
  resolver = next ?? localControl;
}

export function isAINation(nation: Nation): boolean {
  return resolver.isAI(nation);
}

export function canMutateGame(currentPlayer: Nation): boolean {
  return resolver.canMutate(currentPlayer);
}

export function canRunAI(): boolean {
  return resolver.canRunAI();
}

export function persistLocally(): boolean {
  return resolver.persistLocally();
}
