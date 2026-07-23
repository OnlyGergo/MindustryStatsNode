import { createFileRoute } from '@tanstack/react-router';

// Rendering is handled by the root layout, which maps this pathname to the
// 'global-stats' panel type.
export const Route = createFileRoute('/global')({
    component: () => null,
});
