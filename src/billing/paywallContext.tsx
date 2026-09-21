// src/billing/paywallContext.tsx
import React, { createContext, useContext } from 'react';
import type { GateTrigger } from './gates';
import type { Screen } from '../lib/screenNav';

export interface PaywallContextValue {
  openPaywall: (trigger: GateTrigger, origin?: Screen) => void;
}

const PaywallContext = createContext<PaywallContextValue>({
  openPaywall: () => {},
});

export const PaywallProvider = PaywallContext.Provider;
export const usePaywall = () => useContext(PaywallContext);
