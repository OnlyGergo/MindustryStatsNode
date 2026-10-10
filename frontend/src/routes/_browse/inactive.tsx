import { createFileRoute } from '@tanstack/react-router';
import InactiveServersDetail from '../../components/detail/InactiveServersDetail.tsx';
import { DetailShell } from '../../components/sidebar/DetailShell.tsx';
import { LoadingSpinner } from '../../components/LoadingSpinner.tsx';

export const Route = createFileRoute('/_browse/inactive')({
  component: InactiveServers,
  pendingComponent: () => (
      <DetailShell title="Inactive Servers">
        <LoadingSpinner showText={false} />
      </DetailShell>
  )
});

function InactiveServers() {
  return (
    <DetailShell title="Inactive Servers">
      <InactiveServersDetail />
    </DetailShell>
  )
}