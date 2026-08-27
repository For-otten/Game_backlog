const STORAGE_KEYS = {
  settings: 'checkpoint.settings.v2',
  data: 'checkpoint.data.v2',
  covers: 'checkpoint.covers.v2'
};

export const EMPTY_LIBRARY = Object.freeze({
  backlog: [],
  platinando: [],
  concluidos: [],
  platinados: [],
  dropados: []
});

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export class SettingsStore {
  get() {
    return {
      url: '',
      token: '',
      profileName: 'Jogador',
      profileSubtitle: 'Perfil local',
      avatar: '',
      steamgrid: '',
      rawg: '',
      igdbId: '',
      igdbSecret: '',
      ...readJson(STORAGE_KEYS.settings, {})
    };
  }

  save(settings) {
    const normalized = Object.fromEntries(
      Object.entries(settings).map(([key, value]) => [key, String(value || '').trim()])
    );
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(normalized));
    return normalized;
  }

  isConfigured() {
    const { url, token } = this.get();
    return Boolean(url && token);
  }
}

export class LibraryCache {
  read() {
    return normalizeLibrary(readJson(STORAGE_KEYS.data, EMPTY_LIBRARY));
  }

  write(data) {
    const normalized = normalizeLibrary(data);
    localStorage.setItem(STORAGE_KEYS.data, JSON.stringify(normalized));
    return normalized;
  }
}

export class GameApi {
  constructor(settingsStore) {
    this.settingsStore = settingsStore;
    this.coverCache = readJson(STORAGE_KEYS.covers, {});
  }

  async getLibrary() {
    const { url, token } = this.requireConnection();
    const endpoint = new URL(url);
    endpoint.searchParams.set('token', token);
    endpoint.searchParams.set('_', Date.now().toString());
    return this.parse(await fetch(endpoint, { cache: 'no-store' }));
  }

  addGame(game) {
    return this.post({ action: 'ADD_GAME', ...game });
  }

  updateGame(game) {
    return this.post({ action: 'UPDATE_GAME', ...game });
  }

  moveGame({ from, to, row, expectedName }) {
    return this.post({ action: 'MOVE_GAME', from, to, row, expectedName });
  }

  syncTrophies() {
    return this.post({ action: 'FETCH_TROPHIES' });
  }

  async getCover(gameName) {
    if (this.coverCache[gameName]) return this.coverCache[gameName];

    const { steamgrid, rawg, igdbId, igdbSecret } = this.settingsStore.get();
    if (!steamgrid && !rawg && !(igdbId && igdbSecret)) return '';

    const result = await this.post({
      action: 'GET_COVER',
      gameName,
      steamgridKey: steamgrid,
      rawgKey: rawg,
      igdbClientId: igdbId,
      igdbClientSecret: igdbSecret
    });

    if (result.coverUrl) {
      this.coverCache[gameName] = result.coverUrl;
      try {
        localStorage.setItem(STORAGE_KEYS.covers, JSON.stringify(this.coverCache));
      } catch {
        // O cache é dispensável; a biblioteca continua funcional sem ele.
      }
    }
    return result.coverUrl || '';
  }

  async post(payload) {
    const { url, token } = this.requireConnection();
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ ...payload, token })
    });
    return this.parse(response);
  }

  async parse(response) {
    if (!response.ok) throw new Error(`A integração respondeu com HTTP ${response.status}.`);
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error('A integração retornou uma resposta inválida. Verifique a URL publicada.');
    }
    if (!payload.success) throw new Error(payload.message || 'Não foi possível concluir a ação.');
    return payload;
  }

  requireConnection() {
    const settings = this.settingsStore.get();
    if (!settings.url || !settings.token) throw new Error('Conecte o site à planilha nas configurações.');
    return settings;
  }
}

function normalizeLibrary(data) {
  return {
    backlog: Array.isArray(data?.backlog) ? data.backlog : [],
    platinando: Array.isArray(data?.platinando) ? data.platinando : [],
    concluidos: Array.isArray(data?.concluidos) ? data.concluidos : [],
    platinados: Array.isArray(data?.platinados) ? data.platinados : [],
    dropados: Array.isArray(data?.dropados) ? data.dropados : []
  };
}
