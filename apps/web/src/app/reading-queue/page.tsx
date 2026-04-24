import { redirect } from 'next/navigation';
export default function ReadingQueueRoute() { redirect('/library?readingStatus=to-read'); }
