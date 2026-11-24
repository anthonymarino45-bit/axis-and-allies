import type { UnitType } from "./types";
import infantryIcon from "@/assets/units/infantry.png";
import halftrackIcon from "@/assets/units/halftrack.png";
import artilleryIcon from "@/assets/units/artillery.png";
import howitzerIcon from "@/assets/units/howitzer.png";
import tankIcon from "@/assets/units/tank.png";
import amphTankIcon from "@/assets/units/amph_tank.png";
import heavyTankIcon from "@/assets/units/heavy_tank.png";
import cargoTruckIcon from "@/assets/units/cargo_truck.png";
import dozerIcon from "@/assets/units/dozer.png";
import aaGunIcon from "@/assets/units/aa_gun.png";
import railgunIcon from "@/assets/units/railgun.png";
import fighterIcon from "@/assets/units/fighter.png";
import bomberIcon from "@/assets/units/bomber.png";
import zeppelinIcon from "@/assets/units/zeppelin.png";
import spyPlaneIcon from "@/assets/units/spy_plane.png";
import transportIcon from "@/assets/units/transport.png";
import higginsIcon from "@/assets/units/higgins.png";
import submarineIcon from "@/assets/units/submarine.png";
import destroyerIcon from "@/assets/units/destroyer.png";
import cruiserIcon from "@/assets/units/cruiser.png";
import lightCarrierIcon from "@/assets/units/light_carrier.png";
import battleshipIcon from "@/assets/units/battleship.png";
import fleetCarrierIcon from "@/assets/units/fleet_carrier.png";

/** Artwork for every unit type (used on the map and in battle cut scenes). */
export const UNIT_ICONS: Record<UnitType, string> = {
  infantry: infantryIcon,
  halftrack: halftrackIcon,
  artillery: artilleryIcon,
  howitzer: howitzerIcon,
  tank: tankIcon,
  amph_tank: amphTankIcon,
  heavy_tank: heavyTankIcon,
  cargo_truck: cargoTruckIcon,
  dozer: dozerIcon,
  aa_gun: aaGunIcon,
  railgun: railgunIcon,
  fighter: fighterIcon,
  bomber: bomberIcon,
  zeppelin: zeppelinIcon,
  spy_plane: spyPlaneIcon,
  transport: transportIcon,
  higgins: higginsIcon,
  submarine: submarineIcon,
  destroyer: destroyerIcon,
  cruiser: cruiserIcon,
  light_carrier: lightCarrierIcon,
  battleship: battleshipIcon,
  fleet_carrier: fleetCarrierIcon,
};
