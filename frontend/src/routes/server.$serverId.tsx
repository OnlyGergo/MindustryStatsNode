import { createFileRoute } from '@tanstack/react-router';

// Rendering is handled by the root layout, which reads `serverId` via
// `useParams({ strict: false })` to select the detail panel.
export const Route = createFileRoute('/server/$serverId')({
    component: () => null,
});
