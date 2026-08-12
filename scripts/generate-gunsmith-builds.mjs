/**
 * Offline solver for `src/lib/gunsmith-builds.json` — one complete, verified
 * weapon build per Gunsmith quest.
 *
 * Why this exists: json.tarkov.dev tells us a Gunsmith objective's *required*
 * parts (`containsAll` / `containsCategory`) and its *numeric* thresholds
 * (ergonomics >= 45, recoil <= 850, ...), but never how to actually satisfy
 * the numbers. The required parts alone almost never do it, so a page that
 * only lists them cannot get a player through the quest — which is the whole
 * point of the page.
 *
 * So: model the game's stat math, hill-climb a build over the weapon's real
 * slot tree, and only ship builds whose computed stats clear every single
 * threshold. Anything that can't be solved is written out with its unmet
 * conditions rather than silently shipped as a guess.
 *
 * Stat model — every formula below was validated against the 376 in-game
 * weapon presets in the same dataset (they carry the game's own computed
 * ergonomics / recoilVertical / width / height, so they are ground truth):
 *
 *   ergonomics      base + SUM(part.properties.ergonomics)          376/376 exact
 *   recoil vertical base * (1 + SUM(part.properties.recoilModifier)) 376/376 exact
 *   weight          SUM(part.weight)                                 exact (ex-ammo)
 *   width / height  base + per-direction SUM(forced) + MAX(unforced) 373/376, 376/376
 *   effectiveDist.  MAX(part.properties.sightingRange, weapon's own)
 *   magazineCapacity installed magazine's `capacity`
 *
 * Ammo is excluded throughout: presets bundle loaded ammo (which carries an
 * ergonomics penalty and a recoil modifier), a handed-in build does not.
 *
 * Same offline-generation precedent as `scripts/generate-task-ko.mjs`: the
 * page itself stays a static lookup with no solver at runtime. Re-run after a
 * patch changes weapons, parts or quest requirements.
 *
 *   node scripts/generate-gunsmith-builds.mjs
 *
 * Needs no API key — json.tarkov.dev only.
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';

const OUT = new URL('../src/lib/gunsmith-builds.json', import.meta.url);
const CACHE = new URL('../node_modules/.cache/gunsmith/', import.meta.url);
const MODES = ['regular', 'pve'];
const MAX_DEPTH = 4;
const MAX_MOVES = 60;

async function load(mode, endpoint) {
  const file = new URL(`${mode}-${endpoint}.json`, CACHE);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const response = await fetch(`https://json.tarkov.dev/${mode}/${endpoint}`);
  if (!response.ok) throw new Error(`${mode}/${endpoint}: ${response.status}`);
  const json = await response.json();
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, JSON.stringify(json));
  return json;
}

const isAmmo = (item) => item.properties?.propertiesType === 'ItemPropertiesAmmo';

/** Every item id a slot will accept, minus its exclusions. */
function slotOptions(slot, items, byCategory) {
  const allowed = new Set(slot.filters?.allowedItems ?? []);
  for (const category of slot.filters?.allowedCategories ?? []) {
    for (const id of byCategory.get(category) ?? []) allowed.add(id);
  }
  for (const id of slot.filters?.excludedItems ?? []) allowed.delete(id);
  for (const id of [...allowed]) {
    const item = items[id];
    if (!item || isAmmo(item)) allowed.delete(id);
    else if ((item.categories ?? []).some((c) => slot.filters?.excludedCategories?.includes(c))) {
      allowed.delete(id);
    }
  }
  return [...allowed];
}

/**
 * A build is a flat node list: index 0 is the weapon, every other node names
 * the node it hangs off and the slot it occupies. Flat keeps add/remove/swap
 * and the JSON output trivial; the tree is only ever walked by parent index.
 */
const nodeKey = (node) => `${node.parent}/${node.slotId}`;

function openSlots(build, items) {
  const taken = new Set(build.map(nodeKey));
  const slots = [];
  build.forEach((node, index) => {
    if (node.depth >= MAX_DEPTH) return;
    for (const slot of items[node.id].properties?.slots ?? []) {
      const key = `${index}/${slot.id}`;
      if (!taken.has(key)) slots.push({ parent: index, slot, depth: node.depth + 1 });
    }
  });
  return slots;
}

function conflicts(build, items, candidateId) {
  const candidate = items[candidateId];
  const installed = build.map((node) => node.id);
  if (installed.includes(candidateId)) return true;
  if ((candidate.conflictingItems ?? []).some((id) => installed.includes(id))) return true;
  return installed.some((id) => (items[id].conflictingItems ?? []).includes(candidateId));
}

function stats(build, items, weapon) {
  const parts = build.slice(1).map((node) => items[node.id]);
  const ergonomics =
    (weapon.properties.ergonomics ?? 0) +
    parts.reduce((sum, part) => sum + (part.properties?.ergonomics ?? 0), 0);
  const recoilSum = parts.reduce((sum, part) => sum + (part.properties?.recoilModifier ?? 0), 0);
  const size = { left: 0, right: 0, up: 0, down: 0 };
  for (const part of parts) {
    const increase = part.properties?.increaseSize;
    if (!increase) continue;
    for (const side of ['left', 'right', 'up', 'down']) {
      const value = increase[side] ?? 0;
      if (!value) continue;
      if (part.properties.increaseSizeForced) size[side] += value;
      else size[side] = Math.max(size[side], value);
    }
  }
  const magazine = parts.find((part) => part.properties?.propertiesType === 'ItemPropertiesMagazine');
  return {
    ergonomics: Math.round(ergonomics * 100) / 100,
    recoil: Math.round((weapon.properties.recoilVertical ?? 0) * (1 + recoilSum)),
    weight:
      Math.round(
        (weapon.weight + parts.reduce((sum, part) => sum + (part.weight ?? 0), 0)) * 100,
      ) / 100,
    width: weapon.width + size.left + size.right,
    height: weapon.height + size.up + size.down,
    magazineCapacity: magazine?.properties?.capacity ?? 0,
    effectiveDistance: Math.max(
      weapon.properties.sightingRange ?? 0,
      ...parts.map((part) => part.properties?.sightingRange ?? 0),
    ),
    // Not part-dependent: a repaired weapon covers it. Reported so the guide
    // can still tell the player the threshold exists.
    durability: weapon.properties.maxDurability ?? 100,
    accuracy: 0,
    muzzleVelocity: 0,
    sightingRange: Math.max(
      weapon.properties.sightingRange ?? 0,
      ...parts.map((part) => part.properties?.sightingRange ?? 0),
    ),
  };
}

/** Normalized shortfall across every non-trivial threshold. 0 == build passes. */
function violation(current, conditions) {
  let total = 0;
  for (const condition of conditions) {
    const value = current[condition.key];
    if (value === undefined) continue;
    const scale = Math.max(Math.abs(condition.value), 1);
    if (condition.compareMethod === '<=' && value > condition.value) {
      total += (value - condition.value) / scale;
    } else if (condition.compareMethod === '>=' && value < condition.value) {
      total += (condition.value - value) / scale;
    }
  }
  return total;
}

/**
 * Move-selection objective: the hard shortfall, plus a thousandth-weight
 * preference for headroom. Without the second term every option that leaves a
 * condition satisfied scores identically, so the search happily bolts on a
 * 0.9kg thermal scope when a 0.08kg red dot would have cleared the same
 * sighting-range threshold — and then cannot get back under the weight cap.
 */
function score(current, conditions) {
  let soft = 0;
  for (const condition of conditions) {
    const value = current[condition.key];
    if (value === undefined) continue;
    const scale = Math.max(Math.abs(condition.value), 1);
    soft += (condition.compareMethod === '<=' ? value : -value) / scale;
  }
  return violation(current, conditions) + soft / 1000;
}

function activeConditions(buildAttributes, weapon) {
  return Object.entries(buildAttributes ?? {})
    .filter(([, condition]) => typeof condition?.value === 'number')
    .map(([key, condition]) => ({
      key,
      value: condition.value,
      compareMethod: condition.compareMethod ?? '>=',
    }))
    .filter((condition) => {
      // ">= 0" is a no-op the API emits for every attribute it doesn't check.
      if (condition.compareMethod === '>=' && condition.value === 0) return false;
      // Durability is a repair-state check, not a parts problem.
      if (condition.key === 'durability') return false;
      return !(condition.key === 'effectiveDistance' &&
        condition.value <= (weapon.properties.sightingRange ?? 0));
    });
}

/** Fill every slot the weapon cannot fire without, cheapest-ergo-hit first. */
function fillRequired(build, items, byCategory, weapon, conditions) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const { parent, slot, depth } of openSlots(build, items)) {
      if (!slot.required) continue;
      const options = slotOptions(slot, items, byCategory).filter((id) => !conflicts(build, items, id));
      if (!options.length) continue;
      const best = bestOption(build, items, weapon, conditions, options, { parent, slot, depth });
      if (!best) continue;
      build.push(best);
      changed = true;
    }
  }
}

function bestOption(build, items, weapon, conditions, options, placement) {
  let best = null;
  let bestScore = Infinity;
  for (const id of options) {
    const node = { id, parent: placement.parent, slotId: placement.slot.id, slotName: placement.slot.name ?? '', depth: placement.depth };
    const next = [...build, node];
    const value = score(stats(next, items, weapon), conditions);
    if (value < bestScore) {
      bestScore = value;
      best = node;
    }
  }
  return best;
}

/**
 * Every way to reach one of `targetIds` from the weapon, as the chain of hops
 * that has to be installed. Breadth-first, so shorter (fewer adapter parts)
 * chains come first; the caller picks whichever chain scores best.
 */
function reachPaths(build, items, byCategory, targetIds, limit = 96) {
  const targets = new Set(targetIds);
  const taken = new Set(build.map(nodeKey));
  const found = [];
  const seen = new Set(build.map((node) => node.id));
  const queue = build.map((node, index) => ({ index, item: items[node.id], path: [] }));
  while (queue.length && found.length < limit) {
    const current = queue.shift();
    if (current.path.length >= MAX_DEPTH) continue;
    for (const slot of current.item.properties?.slots ?? []) {
      // Only the first hop hangs off an already-installed part, so it is the
      // only one that can collide with a slot that is already filled.
      if (current.path.length === 0 && taken.has(`${current.index}/${slot.id}`)) continue;
      for (const id of slotOptions(slot, items, byCategory)) {
        // Targets are deliberately never marked seen: the same scope hangs off
        // several mounts, and only one of those mounts may also have room for
        // the other parts the quest needs. Collapsing to one route loses that.
        if (targets.has(id)) {
          found.push({ start: current.index, path: [...current.path, { id, slot }] });
          continue;
        }
        if (seen.has(id)) continue;
        seen.add(id);
        queue.push({ index: current.index, item: items[id], path: [...current.path, { id, slot }] });
      }
    }
  }
  return found;
}

/** Append the cheapest reach-path for `targetIds`; returns the installed id. */
function installBest(build, items, byCategory, weapon, conditions, targetIds) {
  const already = targetIds.find((id) => build.some((node) => node.id === id));
  if (already) return already;
  let best = null;
  let bestScore = Infinity;
  for (const candidate of reachPaths(build, items, byCategory, targetIds)) {
    const probe = build.map((node) => ({ ...node }));
    appendPath(probe, candidate.start, candidate.path);
    const value =
      score(stats(probe, items, weapon), conditions) + candidate.path.length * 1e-4;
    if (value < bestScore) {
      bestScore = value;
      best = candidate;
    }
  }
  if (!best) return null;
  appendPath(build, best.start, best.path);
  return best.path[best.path.length - 1].id;
}

function main() {
  return Promise.all(MODES.map((mode) => solveMode(mode))).then((results) => {
    const output = Object.fromEntries(MODES.map((mode, index) => [mode, results[index]]));
    writeFileSync(OUT, `${JSON.stringify(output, null, 1)}\n`);
  });
}

async function solveMode(mode) {
  const [itemsDoc, tasksDoc, dictDoc, taskDictDoc] = await Promise.all([
    load(mode, 'items'),
    load(mode, 'tasks'),
    load(mode, 'items_en'),
    load(mode, 'tasks_en'),
  ]);
  const items = itemsDoc.data.items;
  const dict = { ...dictDoc.data, ...taskDictDoc.data };
  const name = (item) => dict[item.name] ?? item.name;
  const byCategory = new Map();
  for (const item of Object.values(items)) {
    for (const category of item.categories ?? []) {
      byCategory.set(category, [...(byCategory.get(category) ?? []), item.id]);
    }
  }

  const builds = {};
  for (const task of Object.values(tasksDoc.data.tasks ?? {})) {
    const objective = (task.objectives ?? []).find((entry) => entry.type === 'buildWeapon');
    const weapon = objective?.item ? items[objective.item] : null;
    if (!weapon?.properties?.slots) continue;

    const conditions = activeConditions(objective.buildAttributes, weapon);
    const build = [{ id: weapon.id, parent: null, slotId: null, slotName: '', depth: 0 }];

    // 1. Required parts named by the quest, then any part of a required
    //    category — these are non-negotiable, so they go in before anything
    //    optimises around them.
    //    Each one is "any one of these ids"; a named part is just the
    //    single-id case. Tracked as the requirement rather than as the part
    //    that happened to satisfy it, so the search stays free to move that
    //    part or swap it for another that satisfies the same requirement.
    const requirements = [
      ...(objective.containsAll ?? []).map((id) => ({ label: id, ids: new Set([id]) })),
      ...(objective.containsCategory ?? []).map((category) => ({
        label: category,
        ids: new Set(byCategory.get(category) ?? []),
      })),
    ];
    const missing = [];
    for (const requirement of requirements) {
      const ids = [...requirement.ids];
      if (!installBest(build, items, byCategory, weapon, conditions, ids)) {
        missing.push(requirement.label);
      }
    }

    fillRequired(build, items, byCategory, weapon, conditions);

    // 2. Hill-climb: repeatedly take whichever single move cuts the remaining
    //    shortfall the most. Stops as soon as nothing is unmet, so builds stay
    //    minimal instead of accreting parts nobody needs.
    let solved = build;
    for (let move = 0; move < MAX_MOVES; move += 1) {
      if (violation(stats(solved, items, weapon), conditions) === 0) break;
      const current = score(stats(solved, items, weapon), conditions);
      const next = bestMove(solved, items, byCategory, weapon, conditions, requirements, current);
      if (next) {
        solved = next;
        continue;
      }
      // A scope is worthless until its mount is in too, so no single add ever
      // scores for it — install the whole chain at once instead.
      const chained = installChain(solved, items, byCategory, weapon, conditions, requirements);
      if (!chained) break;
      solved = chained;
    }

    const satisfiers = new Set(
      requirements.flatMap((requirement) =>
        solved.filter((node) => requirement.ids.has(node.id)).map((node) => node.id),
      ),
    );
    const final = stats(solved, items, weapon);
    const unmet = conditions.filter((condition) =>
      condition.compareMethod === '<='
        ? final[condition.key] > condition.value
        : final[condition.key] < condition.value,
    );
    builds[task.id] = {
      name: dict[task.name] ?? task.name,
      weapon: weapon.id,
      parts: solved.slice(1).map((node) => ({
        id: node.id,
        parent: node.parent === 0 ? null : solved[node.parent].id,
        // Slot name is for display; a weapon can expose two slots with the
        // same name (the AS VAL has two MOD_MOUNT), so the id is what makes a
        // placement unique.
        slot: node.slotName,
        slotId: node.slotId,
        required: satisfiers.has(node.id),
      })),
      stats: final,
      conditions,
      unmet: unmet.map((condition) => condition.key),
      missingRequired: missing,
    };
    const flag = unmet.length ? `UNMET ${unmet.map((c) => c.key).join(',')}` : 'ok';
    console.log(
      `[${mode}] ${(dict[task.name] ?? task.name).padEnd(34)} ${name(weapon).slice(0, 30).padEnd(31)} parts=${String(solved.length - 1).padStart(2)} ergo=${final.ergonomics} recoil=${final.recoil} ${flag}`,
    );
  }
  return builds;
}

function appendPath(build, start, path) {
  let parentIndex = start;
  for (const hop of path) {
    const existing = build.findIndex((node) => node.id === hop.id);
    if (existing >= 0) {
      parentIndex = existing;
      continue;
    }
    build.push({
      id: hop.id,
      parent: parentIndex,
      slotId: hop.slot.id,
      slotName: hop.slot.name ?? '',
      depth: build[parentIndex].depth + 1,
    });
    parentIndex = build.length - 1;
  }
}

/**
 * Attributes a single part supplies outright — a scope's sighting range, a
 * magazine's capacity. Greedy add-one-part never reaches these when the part
 * sits behind a mount, so they get installed as a whole chain instead.
 */
const PROVIDERS = {
  effectiveDistance: (item) => item.properties?.sightingRange ?? 0,
  sightingRange: (item) => item.properties?.sightingRange ?? 0,
  magazineCapacity: (item) =>
    item.properties?.propertiesType === 'ItemPropertiesMagazine'
      ? (item.properties.capacity ?? 0)
      : 0,
};

/**
 * Install a whole provider chain, clearing an occupied slot first if that is
 * what it takes (the weapon's only scope mount is usually already holding the
 * iron sight that fillRequired put there). Returns a new build, or null.
 */
function installChain(build, items, byCategory, weapon, conditions, requirements) {
  const current = stats(build, items, weapon);
  for (const condition of conditions) {
    const provide = PROVIDERS[condition.key];
    if (!provide || condition.compareMethod !== '>=') continue;
    if (current[condition.key] >= condition.value) continue;
    const targets = Object.values(items)
      .filter((item) => provide(item) >= condition.value)
      .map((item) => item.id);
    if (!targets.length) continue;

    const attempts = [build];
    for (let index = 1; index < build.length; index += 1) {
      attempts.push(without(build, subtree(build, index)));
    }
    let best = null;
    let bestScore = Infinity;
    for (const attempt of attempts) {
      // Every route, not just the cheapest one: on the DVL-10 the only mount
      // that can carry both a 2000m scope and the quest's required tactical
      // device is not the lightest mount, so picking by score alone dead-ends.
      for (const candidate of reachPaths(attempt, items, byCategory, targets)) {
        const probe = attempt.map((node) => ({ ...node }));
        appendPath(probe, candidate.start, candidate.path);
        // Clearing the scope rail can take a required part down with it — put
        // anything the quest demands back, wherever it now fits.
        if (!restoreRequired(probe, items, byCategory, weapon, conditions, requirements)) continue;
        fillRequired(probe, items, byCategory, weapon, conditions);
        const value = score(stats(probe, items, weapon), conditions);
        if (value < bestScore) {
          bestScore = value;
          best = { probe };
        }
      }
    }
    if (best) {
      // Lock it in: whatever comes next may move it, but not lose it.
      requirements.push({ label: condition.key, ids: new Set(targets) });
      return best.probe;
    }
  }
  return null;
}

/** Re-satisfy every requirement the build no longer meets. */
function restoreRequired(build, items, byCategory, weapon, conditions, requirements) {
  for (const requirement of requirements) {
    if (build.some((node) => requirement.ids.has(node.id))) continue;
    const ids = [...requirement.ids];
    if (!installBest(build, items, byCategory, weapon, conditions, ids)) return false;
  }
  return true;
}

/** Would dropping these node positions leave a quest requirement unmet? */
function breaksRequirement(build, drop, requirements) {
  const kept = build.filter((_, index) => !drop.has(index));
  return requirements.some((requirement) => !kept.some((node) => requirement.ids.has(node.id)));
}

/** A node plus everything hanging off it — you can't keep a scope's mount. */
function subtree(build, index) {
  const out = new Set([index]);
  for (let grew = true; grew; ) {
    grew = false;
    build.forEach((node, position) => {
      if (!out.has(position) && node.parent !== null && out.has(node.parent)) {
        out.add(position);
        grew = true;
      }
    });
  }
  return out;
}

function without(build, drop) {
  const kept = build.map((_, index) => index).filter((index) => !drop.has(index));
  const remap = new Map(kept.map((old, index) => [old, index]));
  return kept.map((index) => ({
    ...build[index],
    parent: build[index].parent === null ? null : remap.get(build[index].parent),
  }));
}

/**
 * One step of the hill-climb: the best of every add / swap-subtree /
 * remove-subtree move, or null when nothing improves. Whole subtrees rather
 * than single parts, because an over-weight build is usually only fixable by
 * taking a mount and everything on it back off together.
 */
function bestMove(build, items, byCategory, weapon, conditions, requirements, current) {
  let best = null;
  let bestScore = current;
  const consider = (candidate) => {
    const value = score(stats(candidate, items, weapon), conditions);
    if (value < bestScore - 1e-9) {
      bestScore = value;
      best = candidate;
    }
  };

  for (const { parent, slot, depth } of openSlots(build, items)) {
    for (const id of slotOptions(slot, items, byCategory)) {
      if (conflicts(build, items, id)) continue;
      const added = [...build, { id, parent, slotId: slot.id, slotName: slot.name ?? '', depth }];
      fillRequired(added, items, byCategory, weapon, conditions);
      consider(added);
    }
  }

  for (let index = 1; index < build.length; index += 1) {
    const drop = subtree(build, index);
    const node = build[index];
    const host = items[build[node.parent].id];
    const slot = (host.properties?.slots ?? []).find((entry) => entry.id === node.slotId);
    if (!slot) continue;
    const rest = without(build, drop);
    // Taking a mount off takes whatever sits on it too. If that included a
    // part the quest requires, the only legal version of this move is the one
    // that puts that part back somewhere else — and it is expensive, so it is
    // offered as a plain removal rather than a whole swap sweep.
    if (breaksRequirement(build, drop, requirements)) {
      const restored = rest.map((entry) => ({ ...entry }));
      if (restoreRequired(restored, items, byCategory, weapon, conditions, requirements)) {
        fillRequired(restored, items, byCategory, weapon, conditions);
        consider(restored);
      }
      continue;
    }
    if (!slot.required) consider(rest);
    for (const id of slotOptions(slot, items, byCategory)) {
      if (id === node.id || conflicts(rest, items, id)) continue;
      const parent = rest.findIndex((entry) => entry.id === host.id);
      if (parent < 0) continue;
      const swapped = [...rest, { ...node, id, parent }];
      fillRequired(swapped, items, byCategory, weapon, conditions);
      consider(swapped);
    }
  }
  return best;
}

await main();
