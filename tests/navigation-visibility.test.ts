import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  FOOTER_LINKS,
  NAVIGATION,
  getVisibleFooterLinks,
  getVisibleNavigation,
  isActivePath,
  isGroupActive,
} from '../src/lib/navigation';
import {
  fallbackLocaleFor,
  isPublicLocale,
  publicLocales,
  rewritePrivateLocalePath,
} from '../src/lib/locale-availability';

test('public locales are Korean and English only', () => {
  assert.deepEqual([...publicLocales], ['ko', 'en']);
  assert.equal(isPublicLocale('ko'), true);
  assert.equal(isPublicLocale('en'), true);
  assert.equal(isPublicLocale('zh'), false);
  assert.equal(fallbackLocaleFor('zh'), 'ko');
});

test('Chinese paths rewrite to the Korean equivalent without duplicating locale', () => {
  assert.equal(rewritePrivateLocalePath('/zh'), '/ko');
  assert.equal(rewritePrivateLocalePath('/zh/news'), '/ko/news');
  assert.equal(
    rewritePrivateLocalePath('/zh/progression/tasks'),
    '/ko/progression/tasks',
  );
  assert.equal(rewritePrivateLocalePath('/ko/news'), null);
  assert.equal(rewritePrivateLocalePath('/en/news'), null);
  assert.equal(rewritePrivateLocalePath('/ko/ko/news'), null);
});

test('Chinese message file remains in the repository', () => {
  assert.equal(existsSync(join(process.cwd(), 'messages', 'zh.json')), true);
});

test('visible navigation exposes completed groups only', () => {
  const nav = getVisibleNavigation();
  const keys = nav.map((item) => item.key);
  assert.deepEqual(keys, [
    'news',
    'trade',
    'hideout',
    'progression',
    'combat',
    'maps',
  ]);

  const flat = nav.flatMap((item) =>
    item.children ? item.children.map((child) => child.key) : [item.key],
  );
  assert.ok(!flat.includes('support'));
  assert.ok(!flat.includes('beginner'));
  assert.ok(!flat.includes('about'));
  assert.ok(flat.includes('questTracker'));
  assert.ok(flat.includes('watchlist'));
  assert.ok(flat.includes('craftCalculator'));
  assert.ok(flat.includes('budgetBuilder'));
});

test('support and beginner stay in the config as hidden', () => {
  const support = NAVIGATION.find((item) => item.key === 'support');
  const beginner = NAVIGATION.flatMap((item) => item.children ?? []).find(
    (item) => item.key === 'beginner',
  );
  assert.equal(support?.visibility, 'hidden');
  assert.equal(support?.hiddenReason, 'support');
  assert.equal(beginner?.visibility, 'hidden');
  assert.equal(beginner?.hiddenReason, 'incomplete');
});

test('footer hides support and beginner while keeping about', () => {
  const links = getVisibleFooterLinks();
  const keys = links.map((item) => item.key);
  assert.ok(!keys.includes('support'));
  assert.ok(!keys.includes('beginner'));
  assert.ok(keys.includes('about'));
  assert.ok(keys.includes('status'));
  assert.ok(keys.includes('localData'));

  const hiddenSupport = FOOTER_LINKS.find((item) => item.key === 'support');
  assert.equal(hiddenSupport?.visibility, 'hidden');
});

test('empty groups are dropped from visible navigation', () => {
  const nav = getVisibleNavigation([
    {
      key: 'empty',
      visibility: 'visible',
      children: [
        {
          key: 'ghost',
          href: '/ghost',
          visibility: 'hidden',
          hiddenReason: 'incomplete',
        },
      ],
    },
    { key: 'news', href: '/news', visibility: 'visible' },
  ]);
  assert.deepEqual(
    nav.map((item) => item.key),
    ['news'],
  );
});

test('quest tracker does not activate the quests leaf', () => {
  const tasks = {
    key: 'tasks',
    href: '/progression/tasks',
    activePath: '/progression/tasks',
    visibility: 'visible' as const,
  };
  const tracker = {
    key: 'questTracker',
    href: '/progression/tasks/tracker',
    visibility: 'visible' as const,
  };
  assert.equal(isActivePath('/progression/tasks', tasks), true);
  assert.equal(isActivePath('/progression/tasks/big-sale', tasks), true);
  assert.equal(isActivePath('/progression/tasks/tracker', tasks), false);
  assert.equal(isActivePath('/progression/tasks/tracker', tracker), true);

  const progression = {
    key: 'progression',
    visibility: 'visible' as const,
    children: [tasks, tracker],
  };
  assert.equal(isGroupActive('/progression/tasks/tracker', progression), true);
  assert.equal(isGroupActive('/progression/gunsmith', progression), false);
});
