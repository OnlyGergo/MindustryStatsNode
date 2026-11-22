import { useEffect } from 'react';
import { customisationStyle } from '../util/customisation';
import { PublicCustomisation } from '../../../common/models/customisation';
import { notifyThemeChange } from '../util/themeColors';

interface UseBodyCustomisationProps {
  customisation: PublicCustomisation | null | undefined;
}

const cssName = (property: string) =>
  property.startsWith('--') ? property : property.replace(/([A-Z])/g, '-$1').toLowerCase();

/**
 * Applies a server/network page's customisation to <body>, the wrapper the whole
 * page (sidebar included) inherits from. `data-theme` makes index.css re-derive
 * --top/--grid/... from the overridden tokens; charts redraw on the event.
 */
export function useBodyCustomisation({ customisation }: UseBodyCustomisationProps) {
  useEffect(() => {
    const styles = customisationStyle(customisation ?? null) as Record<string, string> | undefined;
    if (!styles) return;

    const body = document.body;
    Object.entries(styles).forEach(([property, value]) => body.style.setProperty(cssName(property), value));
    body.setAttribute('data-theme', '');
    notifyThemeChange();

    return () => {
      Object.keys(styles).forEach((property) => body.style.removeProperty(cssName(property)));
      body.removeAttribute('data-theme');
      notifyThemeChange();
    };
  }, [customisation]);
}
