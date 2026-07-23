import { createFileRoute } from '@tanstack/react-router';

// The actual UI is rendered by the root route's layout (MasterPanel/DetailPanel);
// this leaf just needs to exist so `/` matches within the route tree.
export const Route = createFileRoute('/')({
    component: () => null,
});
