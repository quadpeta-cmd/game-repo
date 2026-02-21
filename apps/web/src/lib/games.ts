export type GameManifest = {
  id: string;
  name: string;
  description: string;
  entry: string;
};

export const gameIds = ['pong', 'dodger'] as const;

export async function loadManifest(gameId: string): Promise<GameManifest> {
  const response = await fetch(`/games/${gameId}/manifest.json`);

  if (!response.ok) {
    throw new Error(`Could not load manifest for ${gameId}`);
  }

  return (await response.json()) as GameManifest;
}
