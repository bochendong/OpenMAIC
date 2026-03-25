import { Suspense } from 'react';
import { AdminConsole } from '@/components/admin/admin-console';

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center text-muted-foreground">
          加载管理员控制台…
        </div>
      }
    >
      <AdminConsole />
    </Suspense>
  );
}
