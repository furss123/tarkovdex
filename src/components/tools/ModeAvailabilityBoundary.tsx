'use client';

import type { ReactNode } from 'react';
import { useGameMode } from '@/contexts/GameModeContext';
import { DataError } from '@/components/tools/ToolShell';

/** Shows the selected mode's content while keeping a one-mode outage local. */
export function ModeAvailabilityBoundary({
  regularAvailable,
  pveAvailable,
  errorMessage,
  children,
}: {
  regularAvailable: boolean;
  pveAvailable: boolean;
  errorMessage: string;
  children: ReactNode;
}) {
  const { gameMode } = useGameMode();
  const selectedModeAvailable = gameMode === 'pve' ? pveAvailable : regularAvailable;

  return selectedModeAvailable ? children : <DataError message={errorMessage} />;
}
