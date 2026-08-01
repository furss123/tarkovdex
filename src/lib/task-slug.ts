import type { Task, TaskRequirement } from '@/types/tarkov';

/**
 * Quest detail URL slugs: `{english-name-slug}-{full 24-char ObjectId}`.
 *
 * The ObjectId (not a short id, not the name alone) is the actual routing
 * key — see `parseTaskIdFromSlug`. The name part is cosmetic/SEO only, so a
 * stale name from a renamed quest can be redirected to the current canonical
 * slug (see `progression/tasks/[slug]/page.tsx`) without ever losing the
 * page, since the id never changes.
 */

const OBJECT_ID_SUFFIX = /-([0-9a-f]{24})$/i;
const COMBINING_DIACRITICS = /[\u0300-\u036f]/g;

function slugifyEnglishName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(COMBINING_DIACRITICS, '') // strip accents (e.g. "e" + acute -> "e")
    .replace(/'/g, '') // "Let's" -> "Lets", not "let-s"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The English name is what the slug is built from regardless of the current
 * locale, so the same slug is stable across en/ko/zh — `nameEn` already
 * holds it on ko/zh, and falls back to `name` itself on `en` (where `nameEn`
 * is always null by design) or wherever upstream's own translation is
 * already untranslated English text.
 */
function englishNameOf(entity: { name: string; nameEn: string | null }): string {
  return entity.nameEn ?? entity.name;
}

export function taskSlugFor(task: Task): string {
  return `${slugifyEnglishName(englishNameOf(task))}-${task.id}`;
}

/** Same slug a prerequisite's own detail page would have, computed directly
 * from the `TaskRequirement` fields without a second task lookup. */
export function requirementSlugFor(requirement: TaskRequirement): string {
  return `${slugifyEnglishName(
    requirement.taskNameEn ?? requirement.taskName,
  )}-${requirement.taskId}`;
}

/** Extracts the routing key (the trailing ObjectId) from a slug. Returns
 * null for a slug with no valid trailing id, which callers should treat as
 * a 404 rather than a lookup miss. */
export function parseTaskIdFromSlug(slug: string): string | null {
  const match = slug.match(OBJECT_ID_SUFFIX);
  return match ? match[1].toLowerCase() : null;
}
