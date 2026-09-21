import { createContext } from 'react';

/** White-on-accent fills used to hardcode `#fff`. PrimaryButton provides the live onAccent
 *  colour so those icons stay readable when Monochrome dark inverts the fill to white. */
export const OnAccentFillCtx = createContext<string | null>(null);
