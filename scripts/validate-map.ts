import { createInitialState } from "../src/game/initialState";
import { MAP_SHAPES } from "../src/game/mapShapes";
import { MAP_SUBDIVISIONS } from "../src/game/mapSubdivisions";

const game = createInitialState();
const territories = game.territories;
const all = Object.values(territories);
const land = all.filter((territory) => !territory.isSea);
const sea = all.filter((territory) => territory.isSea);
const failures: string[] = [];

if (land.length !== 171) failures.push(`expected 171 land territories, received ${land.length}`);
if (Object.keys(MAP_SHAPES).length !== 171) failures.push("generated shape count does not match land count");

for (const territory of all) {
  if (!territory.points || territory.points.split(/\s+/).length < 3) failures.push(`${territory.id} has invalid geometry`);
  for (const neighbourId of territory.adjacent) {
    const neighbour = territories[neighbourId];
    if (!neighbour) failures.push(`${territory.id} references missing ${neighbourId}`);
    else if (!neighbour.adjacent.includes(territory.id)) failures.push(`${territory.id} -> ${neighbourId} is one-way`);
  }
}

for (const { parentId, childId } of MAP_SUBDIVISIONS) {
  const parent = territories[parentId];
  const child = territories[childId];
  if (!parent || !child) failures.push(`missing split family ${parentId}/${childId}`);
  else if (!parent.adjacent.includes(childId) || !child.adjacent.includes(parentId)) {
    failures.push(`split family ${parentId}/${childId} is disconnected`);
  }
}

for (const island of land.filter((territory) => territory.id.startsWith("is_"))) {
  if (!island.adjacent.some((id) => territories[id]?.isSea)) failures.push(`${island.id} has no sea access`);
}
if (!sea.some((territory) => territory.name.includes("World Seam"))) failures.push("world-wrap sea links are missing");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Map valid: ${land.length} land, ${sea.length} sea, ${MAP_SUBDIVISIONS.length} new subdivisions.`);
