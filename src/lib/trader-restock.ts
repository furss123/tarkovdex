import type { TaskTrader } from '@/types/tarkov';

export interface ActionableRestock {
  trader: TaskTrader;
  /** Milliseconds until the restock. Always strictly positive. */
  remaining: number;
}

export interface RestockSelection {
  actionable: ActionableRestock[];
  /** Traders whose next restock cannot be stated: no timestamp, an unparseable
   * one, or one that has already passed without upstream publishing the next. */
  unusable: TaskTrader[];
}

/**
 * Split traders into countdowns worth showing and ones we cannot state a
 * restock for.
 *
 * A past `resetTime` is deliberately `unusable` rather than "restocking now":
 * upstream's `traders` document routinely serves reset times hours in the past
 * (every one of the nine storefront traders was 3-6h past during the audit),
 * and the next cycle is not published anywhere in the data. Rendering nine
 * cards that each said "refreshing" was a screenful of no information, and
 * deriving a cycle length ourselves would be an invented number.
 */
export function selectActionableRestocks(
  traders: TaskTrader[],
  now: number,
): RestockSelection {
  const actionable: ActionableRestock[] = [];
  const unusable: TaskTrader[] = [];

  for (const trader of traders) {
    const reset = trader.resetTime ? Date.parse(trader.resetTime) : Number.NaN;
    const remaining = reset - now;
    if (Number.isFinite(reset) && remaining > 0) {
      actionable.push({ trader, remaining });
    } else {
      unusable.push(trader);
    }
  }

  actionable.sort(
    (a, b) => a.remaining - b.remaining || a.trader.id.localeCompare(b.trader.id),
  );
  return { actionable, unusable };
}
