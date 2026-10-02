// Local ids to delete: those missing from Wallet. An empty remote answer for a non-empty local window is treated as an API glitch.
export function toDelete(localIds: string[], remoteIds: Set<string>): string[] {
  if (remoteIds.size === 0) return [];
  return localIds.filter((id) => !remoteIds.has(id));
}
