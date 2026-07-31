import { permanentRedirect } from 'next/navigation';
export default async function Progression({ params }: { params: Promise<{ locale: string }> }) {
  permanentRedirect(`/${(await params).locale}/progression/tasks`);
}
