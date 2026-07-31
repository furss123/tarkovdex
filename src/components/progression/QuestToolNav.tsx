import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

/** Sibling-page tab groups. Keys double as `nav.*` message keys. */
const TOOL_GROUPS = {
  progression: [
    { key: 'tasks', href: '/progression/tasks' },
    { key: 'gunsmith', href: '/progression/gunsmith' },
  ],
  combat: [
    { key: 'ammo', href: '/combat/ammo' },
    { key: 'armor', href: '/combat/armor' },
  ],
} as const;

export async function ToolGroupNav({
  group,
  active,
}: {
  group: keyof typeof TOOL_GROUPS;
  active: string;
}) {
  const t = await getTranslations('nav');

  return (
    <nav aria-label={t(group)} className="mb-6 flex flex-wrap gap-2 border-b border-border pb-3">
      {TOOL_GROUPS[group].map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={active === item.key ? 'page' : undefined}
          className={`inline-flex min-h-touch items-center rounded-md border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            active === item.key
              ? 'border-accent/60 bg-accent/10 text-accent'
              : 'border-border text-muted hover:bg-surface hover:text-fg'
          }`}
        >
          {t(item.key)}
        </Link>
      ))}
    </nav>
  );
}

export function QuestToolNav({ active }: { active: 'tasks' | 'gunsmith' }) {
  return <ToolGroupNav group="progression" active={active} />;
}
