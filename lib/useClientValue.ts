'use client';

import { useSyncExternalStore } from 'react';

const neverChanges = () => () => {};

/**
 * Read a browser-only value (origin, isSecureContext) without a setState-in-effect
 * cascade. The value never changes for the life of the page, so there is nothing
 * to subscribe to -- this exists purely to give SSR a defined answer.
 */
export function useClientValue<T>(read: () => T, serverValue: T): T {
  return useSyncExternalStore(neverChanges, read, () => serverValue);
}
