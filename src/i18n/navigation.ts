import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/**
 * Locale-aware navigation helpers. Always import Link / useRouter / etc. from
 * here (never from `next/link` or `next/navigation`) so that the active locale
 * prefix is applied automatically.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
