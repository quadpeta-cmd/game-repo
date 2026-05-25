export type GameManifest = {
  id: string;
  name: string;
  description: string;
  entry: string;
  modes?: Array<'singleplayer' | 'local-multiplayer' | 'online' | string>;
  permissions?: {
    storage?: boolean;
    network?: boolean;
    multiplayer?: boolean;
  };
};

const withBase = (path: string) => new URL(path, `${window.location.origin}/`).toString();

export async function loadGameIds(): Promise<string[]> {
  const response = await fetch(withBase('games/index.json'));

  if (!response.ok) {
    throw new Error('Could not load games index');
  }

  const payload = (await response.json()) as unknown;

  if (!Array.isArray(payload) || payload.some((id) => typeof id !== 'string')) {
    throw new Error('Invalid games index format');
  }

  return payload;
}

export async function loadManifest(gameId: string): Promise<GameManifest> {
  const response = await fetch(withBase(`games/${gameId}/manifest.json`));

  if (!response.ok) {
    throw new Error(`Could not load manifest for ${gameId}`);
  }

  return (await response.json()) as GameManifest;
}

export async function loadCatalog(): Promise<GameManifest[]> {
  const gameIds = await loadGameIds();
  return Promise.all(gameIds.map((id) => loadManifest(id)));
}
