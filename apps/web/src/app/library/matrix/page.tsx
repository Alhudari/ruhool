import { AppShell } from '@/components/layout/app-shell';
import { LibraryMatrixView } from '@/components/library/LibraryMatrixView';

export default function MatrixRoute() {
  return (
    <AppShell>
      <LibraryMatrixView initialType="paper" />
    </AppShell>
  );
}
