import { useEffect } from 'react';
import { customisationStyle } from '../util/customisation';
import { PublicCustomisation } from '../../../common/models/customisation';

interface UseBodyCustomisationProps {
  customisation: PublicCustomisation | null | undefined;
}

export function useBodyCustomisation({ customisation }: UseBodyCustomisationProps) {
  useEffect(() => {
    // 1. Get the dynamic styles object using your existing function
    const styles = customisationStyle(customisation ?? null) as Record<string, string> | undefined;
    
    if (!styles) return;

    // 2. Apply all properties to the <body> element
    Object.entries(styles).forEach(([property, value]) => {
      // Handle standard CSS properties vs CSS variables
      if (property.startsWith('--')) {
        document.body.style.setProperty(property, value);
      } else {
        // camelCase properties (e.g., backgroundImage) need to match CSS names (background-image)
        // or be set directly via indexing if your environment allows.
        const kebabProperty = property.replace(/([A-Z])/g, '-$1').toLowerCase();
        document.body.style.setProperty(kebabProperty, value);
      }
    });

    // 3. Cleanup Callback: Remove exactly what we applied when navigating away or updating
    return () => {
      Object.keys(styles).forEach((property) => {
        if (property.startsWith('--')) {
          document.body.style.removeProperty(property);
        } else {
          const kebabProperty = property.replace(/([A-Z])/g, '-$1').toLowerCase();
          document.body.style.removeProperty(kebabProperty);
        }
      });
    };
  }, [customisation]); // Fires again safely if the user's customisation data updates live
}
