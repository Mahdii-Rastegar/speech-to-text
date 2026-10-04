/**
 * Dollar amount with enough decimals to stay meaningful for tiny per-session
 * costs: 0.0006 → "0.0006", 0.0125 → "0.013", 1.5 → "1.50". ASCII digits.
 */
export function formatUsd(amountUsd: number): string {
  const decimals = amountUsd < 0.01 ? 4 : amountUsd < 1 ? 3 : 2
  return amountUsd.toFixed(decimals)
}
