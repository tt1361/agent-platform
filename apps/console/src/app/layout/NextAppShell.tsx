'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { PropsWithChildren } from 'react';
import { ConsoleShellLayout } from './ConsoleShellLayout';

export function NextAppShell({ children }: PropsWithChildren) {
  const pathname = usePathname() ?? '/workspace';
  const router = useRouter();

  return (
    <ConsoleShellLayout pathname={pathname} onNavigate={(path) => router.push(path)}>
      {children}
    </ConsoleShellLayout>
  );
}
