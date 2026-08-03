import { notFound } from 'next/navigation';

/**
 * Route unknown locale-scoped URLs through this segment so Next renders the
 * localized not-found UI inside the normal Header/Footer layout.
 */
export default function LocaleCatchAllPage(): never {
  notFound();
}
