import { createFileRoute } from '@tanstack/react-router';

// Rendering is handled by the root layout, which maps this pathname to the
// 'inactive-servers' panel type.
export const Route = createFileRoute('/inactive')({
    component: () => null,
});
