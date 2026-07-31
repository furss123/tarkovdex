import { permanentRedirect } from 'next/navigation';
export default async function Economy({ params }: { params: Promise<{ locale: string }> }) {
  permanentRedirect(`/${(await params).locale}/economy/items`);
}
