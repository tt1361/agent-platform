import type { PropsWithChildren } from 'react';
import { NextAppShell } from '../layout/NextAppShell';

export default function ConsoleLayout({ children }: PropsWithChildren) {
  return <NextAppShell>{children}</NextAppShell>;
}
