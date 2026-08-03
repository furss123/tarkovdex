import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parse as parseIcuMessage,
  TYPE,
  type MessageFormatElement,
} from '@formatjs/icu-messageformat-parser';

const LOCALES = ['ko', 'en', 'zh'] as const;
const REQUIRED_NAV_KEYS = [
  'brand',
  'news',
  'items',
  'watchlist',
  'barters',
  'tasks',
  'gunsmith',
  'ammo',
  'armor',
  'maps',
  'beginner',
  'about',
  'support',
  'menu',
  'closeMenu',
] as const;

function flatKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix.slice(0, -1)];
  return Object.entries(value).flatMap(([key, child]) => flatKeys(child, `${prefix}${key}.`));
}

function flatEntries(value: unknown, prefix = ''): Array<[string, unknown]> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.entries(value).flatMap(([key, child]) =>
        flatEntries(child, `${prefix}${key}.`),
      )
    : [[prefix.slice(0, -1), value]];
}

/** Locate duplicate keys before JSON.parse can silently keep the last one.
 * The source has already passed JSON.parse, so this small recursive reader can
 * focus on object structure while still handling escaped strings and arrays. */
function duplicateJsonKeys(source: string): string[] {
  let offset = 0;
  const duplicates: string[] = [];

  const skipWhitespace = () => {
    while (/\s/.test(source[offset] ?? '')) offset += 1;
  };

  const readString = (): string => {
    const start = offset;
    offset += 1;
    let escaped = false;
    while (offset < source.length) {
      const character = source[offset];
      offset += 1;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        return JSON.parse(source.slice(start, offset)) as string;
      }
    }
    throw new Error('unterminated JSON string');
  };

  const readValue = (path: string[]): void => {
    skipWhitespace();
    if (source[offset] === '{') {
      readObject(path);
      return;
    }
    if (source[offset] === '[') {
      offset += 1;
      let index = 0;
      skipWhitespace();
      while (source[offset] !== ']') {
        readValue([...path, `[${index}]`]);
        index += 1;
        skipWhitespace();
        if (source[offset] === ',') {
          offset += 1;
          skipWhitespace();
        } else {
          break;
        }
      }
      offset += 1;
      return;
    }
    if (source[offset] === '"') {
      readString();
      return;
    }
    while (offset < source.length && !/[\s,}\]]/.test(source[offset])) offset += 1;
  };

  const readObject = (path: string[]): void => {
    offset += 1;
    const keys = new Set<string>();
    skipWhitespace();
    while (source[offset] !== '}') {
      const key = readString();
      const keyPath = [...path, key];
      if (keys.has(key)) duplicates.push(keyPath.join('.'));
      keys.add(key);
      skipWhitespace();
      offset += 1; // colon; syntax validity is covered by JSON.parse
      readValue(keyPath);
      skipWhitespace();
      if (source[offset] === ',') {
        offset += 1;
        skipWhitespace();
      } else {
        break;
      }
    }
    offset += 1;
  };

  readValue([]);
  return duplicates;
}

function icuVariables(elements: MessageFormatElement[], variables = new Set<string>()): Set<string> {
  for (const element of elements) {
    switch (element.type) {
      case TYPE.argument:
      case TYPE.number:
      case TYPE.date:
      case TYPE.time:
        variables.add(element.value);
        break;
      case TYPE.select:
      case TYPE.plural:
        variables.add(element.value);
        for (const option of Object.values(element.options)) {
          icuVariables(option.value, variables);
        }
        break;
      case TYPE.tag:
        icuVariables(element.children, variables);
        break;
      default:
        break;
    }
  }
  return variables;
}

const messageSources = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8'),
  ]),
) as Record<(typeof LOCALES)[number], string>;

const messages = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(messageSources[locale]) as Record<string, unknown>,
  ]),
);

test('all three message files parse and share an identical key structure', () => {
  const [ko, en, zh] = LOCALES.map((locale) => flatKeys(messages[locale]).sort());
  assert.deepEqual(en, ko);
  assert.deepEqual(zh, ko);
});

test('ICU placeholders match across locales for every key', () => {
  const parsed = new Map<string, Set<string>>();
  for (const locale of LOCALES) {
    for (const [key, value] of flatEntries(messages[locale])) {
      assert.equal(typeof value, 'string', `${locale}:${key} must be a string`);
      assert.doesNotThrow(
        () => {
          const ast = parseIcuMessage(value as string, { requiresOtherClause: true });
          parsed.set(`${locale}:${key}`, icuVariables(ast));
        },
        `invalid ICU message for ${locale}:${key}`,
      );
    }
  }

  for (const locale of ['en', 'zh'] as const) {
    for (const [key] of flatEntries(messages[locale])) {
      assert.deepEqual(
        [...(parsed.get(`${locale}:${key}`) ?? [])].sort(),
        [...(parsed.get(`ko:${key}`) ?? [])].sort(),
        `ICU variable mismatch for ${locale}:${key}`,
      );
    }
  }
});

test('message JSON has no duplicate keys before parsing', () => {
  assert.deepEqual(
    duplicateJsonKeys('{"same":1,"nested":{"key":1,"key":2},"same":2}'),
    ['nested.key', 'same'],
    'duplicate-key detector regression',
  );
  for (const locale of LOCALES) {
    assert.deepEqual(
      duplicateJsonKeys(messageSources[locale]),
      [],
      `${locale}.json contains duplicate keys`,
    );
  }
});

test('every message is non-empty plain text without embedded HTML', () => {
  for (const locale of LOCALES) {
    for (const [key, value] of flatEntries(messages[locale])) {
      assert.equal(typeof value, 'string', `${locale}:${key} must be a string`);
      assert.notEqual((value as string).trim(), '', `${locale}:${key} is empty`);
      assert.doesNotMatch(
        value as string,
        /<(?:!--|!doctype\b|\/?[a-z][^>]*)>/i,
        `${locale}:${key} contains HTML`,
      );
    }
  }
});

test('every locale exposes the complete global navigation contract', () => {
  for (const locale of LOCALES) {
    const nav = messages[locale].nav;
    assert.ok(typeof nav === 'object' && nav !== null && !Array.isArray(nav));
    const navMessages = nav as Record<string, unknown>;
    for (const key of REQUIRED_NAV_KEYS) {
      const value: unknown = navMessages[key];
      assert.equal(typeof value, 'string', `${locale}:nav.${key} is missing`);
      assert.notEqual((value as string).trim(), '', `${locale}:nav.${key} is empty`);
    }
  }
});

test('combat pages carry no price message keys and no FIR keys remain', () => {
  for (const locale of LOCALES) {
    const keys = flatKeys(messages[locale]);
    assert.ok(!keys.includes('ammo.price'), `${locale} still has ammo.price`);
    assert.ok(!keys.includes('armor.noPrice'), `${locale} still has armor.noPrice`);
    assert.ok(!keys.some((key) => /(^|\.)fir(\.|$)/i.test(key)), `${locale} still has FIR keys`);
  }
});

test('Korean copy uses the standard site glossary', () => {
  const koText = JSON.stringify(messages.ko);
  assert.ok(!koText.includes('벼룩'), 'use 플리마켓, not 벼룩');
  assert.ok(!koText.includes('하이드아웃'), 'use 은신처, not 하이드아웃');
  assert.ok(!koText.includes('트레이더'), 'use 상인, not 트레이더');
  assert.ok(!koText.includes('스폰'), 'use 등장 확률, not 스폰');
  assert.ok(!/\bXP\b/.test(koText), 'use 경험치, not XP');
  assert.ok(!/\bROI\b/.test(koText), 'use 투자 수익률, not ROI');
});

test('no raw API schema names leak into any locale', () => {
  for (const locale of LOCALES) {
    const text = JSON.stringify(messages[locale]);
    assert.ok(!text.includes('ItemPropertiesAmmo'), `${locale} exposes ItemPropertiesAmmo`);
    assert.ok(!text.includes('armorPlate'), `${locale} exposes armorPlate`);
  }
});
