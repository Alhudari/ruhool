'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Demos page is deprecated — all demo videos now live in the Library
// under the built-in "تجارب / Experiments" category.
export default function StudioDemos() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/library?categoryId=builtin:experiments');
  }, [router]);
  return null;
}
