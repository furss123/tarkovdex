/**
 * One-off/incremental generator for `src/lib/news-ko.json` and
 * `src/lib/news-zh.json` — a permanent, git-committed translation of every
 * Steam news post ever seen, keyed by the post's stable guid.
 *
 * Same pattern as `generate-task-ko.mjs`: translate here, offline, once, and
 * commit the result. This replaces relying on Next's runtime `unstable_cache`
 * as the *only* copy of a successful translation — that cache turned out not
 * to survive being re-tried mid-deploy reliably (two back-to-back prod
 * deploys each fired a full concurrent translation burst that blew Gemini's
 * free-tier 15-req/min quota, and every post — even long-since-translated
 * ones — rendered in English until a later ISR revalidation). A committed
 * file can never be reset by a deploy or a quota burst.
 *
 * Existing entries are preserved, so only posts new since the last run cost
 * an API call — re-run whenever a new patch note/event goes up.
 *
 *   node scripts/generate-news-translations.mjs
 *
 * Requires GEMINI_API_KEY (read from .env.local if present).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { GoogleGenAI } from '@google/genai';

const STEAM_NEWS_URL = 'https://store.steampowered.com/feeds/news/app/3932890/';
const MODEL = 'gemini-3.5-flash-lite';
const LANGUAGE_NAME = { ko: 'Korean', zh: 'Simplified Chinese' };

const GLOSSARY_KO = `
Use the official Korean game terms for recurring Tarkov vocabulary, e.g.:
Flea Market=플리마켓, Hideout=은신처, quest/task=퀘스트, raid=레이드, Scav=스캐브, PMC=PMC,
maps: Streets of Tarkov=타르코프 시내, Customs=세관, Factory=공장, Woods=삼림, Shoreline=해안선, Reserve=리저브, Interchange=인터체인지, Lighthouse=등대, The Lab/Laboratory=연구소, Ground Zero=그라운드 제로,
traders: Prapor=프라퍼, Therapist=테라피스트, Fence=펜스, Skier=스키어, Peacekeeper=피스키퍼, Mechanic=메카닉, Ragman=래그맨, Jaeger=예거, Ref=레프,
bosses: Killa=킬라, Tagilla=타길라, Reshala=르샬라, Glukhar=글루하, Shturman=슈트르만, Sanitar=세니타, Kaban=카반, Kollontay=콜론타이, Partisan=파르티잔.`;

if (!process.env.GEMINI_API_KEY && existsSync('.env.local')) {
  const match = readFileSync('.env.local', 'utf8').match(/^GEMINI_API_KEY\s*=\s*(.+)$/m);
  if (match) process.env.GEMINI_API_KEY = match[1].trim().replace(/^["']|["']$/g, '');
}
if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// --- Minimal RSS parse, mirroring lib/steam-news.ts's hand-rolled parser ---
function unwrapCdata(v) {
  const m = v.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  return m ? m[1] : v;
}
function decodeEntities(v) {
  return v.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}
function stripHtml(html) {
  return html
    .replace(/<\/(p|div|li)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}
function extractTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1] : null;
}

async function fetchNewsItems() {
  const res = await fetch(STEAM_NEWS_URL);
  if (!res.ok) throw new Error(`Steam feed -> ${res.status}`);
  const xml = await res.text();
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const items = [];
  for (const block of blocks) {
    const rawTitle = extractTag(block, 'title');
    const rawGuid = extractTag(block, 'guid');
    const rawLink = extractTag(block, 'link');
    const rawDescription = extractTag(block, 'description');
    if (!rawTitle || !rawLink) continue;
    items.push({
      id: rawGuid ? unwrapCdata(rawGuid).trim() : unwrapCdata(rawLink).trim(),
      title: decodeEntities(unwrapCdata(rawTitle)).trim(),
      content: rawDescription ? stripHtml(decodeEntities(unwrapCdata(rawDescription))) : '',
    });
  }
  return items;
}

async function translateOne(locale, title, content) {
  const targetLanguage = LANGUAGE_NAME[locale];
  const glossary = locale === 'ko' ? GLOSSARY_KO : '';
  const prompt = `Translate the following Escape from Tarkov (a video game) news post into natural, fluent ${targetLanguage}, matching the tone of a gaming news/community site.

Rules:
- Translate faithfully: do not summarize, shorten, reorder, or add anything.
- Preserve every patch version number, date, time, number, unit, percentage, and event condition exactly.
- Keep the original paragraph and line-break structure.
- Keep weapon model names, brand names, and cartridge designations (e.g. 5.45x39) in their original form.
- Use the names ${targetLanguage}-speaking Escape from Tarkov players actually use for game terms instead of literal translations.${glossary}

Respond with ONLY a raw JSON object of the shape {"title": string, "content": string} — no markdown fences, no commentary.

Title: ${title}

Content: ${content}`;

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await ai.models.generateContent({ model: MODEL, contents: prompt });
      const text = (res.text ?? '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
      const parsed = JSON.parse(text);
      return {
        title: typeof parsed.title === 'string' && parsed.title ? parsed.title : title,
        content: typeof parsed.content === 'string' && parsed.content ? parsed.content : content,
      };
    } catch (err) {
      const status = err?.status;
      const wait = status === 429 ? 50_000 : 5_000;
      if (attempt === 3) throw err;
      console.warn(`  retry ${attempt + 1} (${status ?? err.message}) in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

const items = await fetchNewsItems();
console.log(`${items.length} posts in feed`);

for (const locale of ['ko', 'zh']) {
  const out = new URL(`../src/lib/news-${locale}.json`, import.meta.url);
  const existing = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : {};
  const todo = items.filter((item) => !existing[item.id]);
  console.log(`${locale}: ${todo.length} new of ${items.length}`);

  for (const item of todo) {
    console.log(`  translating: ${item.title}`);
    existing[item.id] = await translateOne(locale, item.title, item.content);
    // Write incrementally so a mid-run failure doesn't lose progress.
    writeFileSync(out, `${JSON.stringify(existing, null, 2)}\n`);
  }
}

console.log('done');
