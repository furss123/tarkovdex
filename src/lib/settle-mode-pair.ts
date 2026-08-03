export interface SettledModePair<T> {
  regular: T | null;
  pve: T | null;
}

/**
 * Resolves the two independent game-mode requests without letting a failure
 * in one mode discard valid data from the other.
 */
export async function settleModePair<T>({
  regular,
  pve,
}: {
  regular: Promise<T>;
  pve: Promise<T>;
}): Promise<SettledModePair<T>> {
  const [regularResult, pveResult] = await Promise.allSettled([regular, pve]);

  return {
    regular: regularResult.status === 'fulfilled' ? regularResult.value : null,
    pve: pveResult.status === 'fulfilled' ? pveResult.value : null,
  };
}
