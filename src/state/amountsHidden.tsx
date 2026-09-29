import React, { createContext, useContext } from 'react';

const AmountsHiddenContext = createContext(false);

export function AmountsHiddenProvider({
  hidden,
  children,
}: {
  hidden: boolean;
  children: React.ReactNode;
}) {
  return <AmountsHiddenContext.Provider value={hidden}>{children}</AmountsHiddenContext.Provider>;
}

export function useAmountsHidden(): boolean {
  return useContext(AmountsHiddenContext);
}

export const HIDDEN_AMOUNT = '••••';
