import { redirect } from 'next/navigation';

export default function ShwashaStandaloneRedirect({ searchParams }: { searchParams: { session?: string } }) {
  const session = searchParams.session;
  redirect(`/al-mulakhkhis/standalone${session ? `?session=${session}` : ''}`);
}
