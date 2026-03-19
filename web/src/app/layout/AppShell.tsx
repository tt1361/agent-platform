import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ConsoleShellLayout } from './ConsoleShellLayout';

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <ConsoleShellLayout pathname={location.pathname} onNavigate={(path) => navigate(path)}>
      <Outlet />
    </ConsoleShellLayout>
  );
}
