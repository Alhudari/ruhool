import { redirect } from 'next/navigation';

interface RedirectProps { searchParams: { session?: string } }

export default function ShwashaReadRedirect({ searchParams }: RedirectProps) {
  const session = searchParams.session;
  redirect(`/al-mulakhkhis/read${session ? `?session=${session}` : ''}`);
}
