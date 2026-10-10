import { createFileRoute } from '@tanstack/react-router';
import InactiveServersDetail from '../../components/detail/InactiveServersDetail.tsx';
import { DetailShell } from '../../components/server-list/DetailShell.tsx';
import { LoadingSpinner } from '../../components/LoadingSpinner.tsx';
import { docTitle } from "../../util/pageTitle.ts";

export const Route = createFileRoute('/_browse/inactive')({
  staticData: { title: "Inactive Servers", back: true },
  head: () => ({ meta: [{ title: docTitle("Inactive Servers") }] }),
  component: InactiveServers,
  pendingComponent: () => (
      <DetailShell>
        <LoadingSpinner showText={false} />
      </DetailShell>
  )
});

function InactiveServers() {
  return (
    <DetailShell>
      <InactiveServersDetail />
    </DetailShell>
  )
}