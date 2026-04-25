// Lab was merged into Studio (2026-04-23). Studio is now the single
// entry point for content/video workflows. Any inbound link to /lab
// forwards to /studio so bookmarks and old nav items keep working.
//
// Server-side redirect — instant, no hydration wait, works for bots
// and link-preview scrapers too.
import { redirect } from 'next/navigation';

export default function LabRedirect(): never {
  redirect('/studio');
}
