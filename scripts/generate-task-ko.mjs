/**
 * One-off generator for `src/lib/task-ko.json` — the Korean glossary for the
 * quest names and objective descriptions json.tarkov.dev's `tasks_ko`
 * dictionary still returns in English (currently 209 of 501 names and 535
 * distinct objective strings).
 *
 * Same pattern as `game-localization.ts`'s MOB_NAMES_KO / ARMOR_LAYER_NAMES_KO:
 * a static lookup applied only when the API's own dictionary produced no
 * Hangul, so the API wins as soon as upstream catches up. Translation quality
 * comes from Gemini (the provider this project already uses for news), but it
 * runs *here*, offline — the quest page itself keeps zero runtime LLM
 * dependency, zero added latency, and deterministic output.
 *
 * Re-run after a game patch adds quests; existing entries are preserved, so
 * only genuinely new strings cost an API call.
 *
 *   node scripts/generate-task-ko.mjs
 *
 * Requires GEMINI_API_KEY (read from .env.local if present).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { GoogleGenAI } from '@google/genai';

const OUT = new URL('../src/lib/task-ko.json', import.meta.url);
const MODEL = 'gemini-3.5-flash-lite';
const BATCH = 40;
const HAS_HANGUL = /[가-힣]/;

if (!process.env.GEMINI_API_KEY && existsSync('.env.local')) {
  const match = readFileSync('.env.local', 'utf8').match(/^GEMINI_API_KEY\s*=\s*(.+)$/m);
  if (match) process.env.GEMINI_API_KEY = match[1].trim().replace(/^["']|["']$/g, '');
}
if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const GLOSSARY = `
maps: Customs=세관, Factory=공장, Woods=삼림, Shoreline=해안선, Reserve=리저브, Interchange=인터체인지, Lighthouse=등대, The Lab/Laboratory=연구소, Ground Zero=그라운드 제로, Streets of Tarkov=타르코프 시내, Night Factory=야간 공장, Labyrinth=미궁
traders: Prapor=프라퍼, Therapist=테라피스트, Fence=펜스, Skier=스키어, Peacekeeper=피스키퍼, Mechanic=메카닉, Ragman=래그맨, Jaeger=예거, Ref=레프, Lightkeeper=등대지기
bosses/NPCs: Killa=킬라, Tagilla=타길라, Reshala=르샬라, Glukhar=글루하, Shturman=슈트르만, Sanitar=세니타, Kaban=카반, Kollontay=콜론타이, Partisan=파르티잔, Knight=나이트, Big Pipe=빅 파이프, Birdeye=버드아이, Cultist=추종자, Rogue=로그, Raider=레이더, Zryachiy=즈라치
common terms: Scav=스캐브, PMC=PMC, raid=레이드, found in raid=레이드 획득(FiR), extract/exfil=탈출, extraction point=탈출 지점, stash=은닉처, Hideout=은신처, Flea Market=플리마켓, quest=퀘스트, Eliminate=처치, Locate=찾기, Obtain=획득, Hand over=전달, Survive and extract=생존 후 탈출, Stash/Plant=설치, Mark=표식 설치, Scout=정찰, operative=대원, Failure Condition=실패 조건`;

async function translateBatch(strings, kind) {
  const prompt = `You are localizing Escape from Tarkov quest text into Korean for a Korean player community site.

Translate each ${kind} into natural Korean that Korean Tarkov players actually use — not a literal word-for-word rendering. Match the concise, in-game quest-log tone.

Rules:
- Keep every number, quantity, weapon/item model name, brand name, and cartridge designation (e.g. 5.45x39, PACA, TP-200) in its original form.
- Use these established Korean terms:${GLOSSARY}
- Keep bracketed tags such as [PVP ZONE] as-is at the end.
- Quest names are titles: keep them short and punchy, do not turn them into sentences.
- Never add explanations or notes.

Respond with ONLY a raw JSON array of translated strings, same length and same order as the input. No markdown fences, no commentary.

Input JSON: ${JSON.stringify(strings)}`;

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await ai.models.generateContent({ model: MODEL, contents: prompt });
      const text = (res.text ?? '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed) || parsed.length !== strings.length) {
        throw new Error(`expected ${strings.length} items, got ${parsed?.length}`);
      }
      return parsed.map((v, i) => (typeof v === 'string' && v.trim() ? v.trim() : strings[i]));
    } catch (err) {
      const status = err?.status;
      const wait = status === 429 ? 50_000 : 5_000;
      if (attempt === 3) throw err;
      console.warn(`  retry ${attempt + 1} (${status ?? err.message}) in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

async function json(path) {
  const res = await fetch(`https://json.tarkov.dev${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

// Collect from both game modes: 27 quests exist only in regular, 23 only in pve.
const names = new Set();
const objectives = new Set();

for (const mode of ['regular', 'pve']) {
  const [doc, ko] = await Promise.all([json(`/${mode}/tasks`), json(`/${mode}/tasks_ko`)]);
  for (const task of Object.values(doc.data.tasks)) {
    const name = ko.data[task.name] ?? task.name;
    if (!HAS_HANGUL.test(name)) names.add(name);
    for (const objective of task.objectives ?? []) {
      const description = ko.data[objective.description] ?? objective.description;
      if (!HAS_HANGUL.test(description)) objectives.add(description);
    }
  }
}

function sorted(record) {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
console.log(`${names.size} names + ${objectives.size} objectives untranslated upstream`);

// Names and objectives are prompted separately — a quest title and a quest
// instruction want different tone, and mixing them in one batch blurs both.
for (const [kind, source] of [
  ['quest name', names],
  ['quest objective', objectives],
]) {
  const todo = [...source].filter((s) => !existing[s]);
  console.log(`${kind}: ${todo.length} new`);
  for (let i = 0; i < todo.length; i += BATCH) {
    const slice = todo.slice(i, i + BATCH);
    console.log(`  batch ${i / BATCH + 1}/${Math.ceil(todo.length / BATCH)} (${slice.length})`);
    const translated = await translateBatch(slice, kind);
    slice.forEach((raw, index) => {
      existing[raw] = translated[index];
    });
    // Write incrementally so a mid-run rate-limit failure doesn't lose progress.
    writeFileSync(OUT, `${JSON.stringify(sorted(existing), null, 2)}\n`);
  }
}

console.log(`wrote ${Object.keys(existing).length} entries`);
