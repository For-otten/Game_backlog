const STORAGE_KEYS = {
  settings: 'checkpoint.settings.v2',
  data: 'checkpoint.data.v2',
  covers: 'checkpoint.covers.v2',
  profile: 'checkpoint.profile.v1'
};

export const EMPTY_LIBRARY = Object.freeze({
  backlog: [],
  platinando: [],
  concluidos: [],
  platinados: [],
  dropados: []
});

export function isWebAppUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:'
      && url.hostname === 'script.google.com'
      && /^\/macros\/s\/[^/]+\/exec\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function parseConnectionUrl(value, fallbackToken = '') {
  const raw = String(value || '').trim();
  if (!isWebAppUrl(raw)) return { url: raw, token: String(fallbackToken || '').trim() };
  const parsed = new URL(raw);
  const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const token = hashParams.get('token') || parsed.searchParams.get('token') || fallbackToken;
  hashParams.delete('token');
  parsed.searchParams.delete('token');
  parsed.hash = hashParams.toString() ? `#${hashParams}` : '';
  return { url: parsed.toString().replace(/\/$/, ''), token: String(token || '').trim() };
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export class SettingsStore {
  get() {
    const defaults = {
      url: '',
      token: '',
      profileName: 'Jogador',
      profileSubtitle: 'Perfil local',
      avatar: '',
      steamgrid: '',
      rawg: '',
      igdbId: '',
      igdbSecret: ''
    };
    const current = readJson(STORAGE_KEYS.settings, null);
    if (current) return { ...defaults, ...current };

    const legacy = {
      url: localStorage.getItem('gs_url') || '',
      token: localStorage.getItem('gs_token') || '',
      steamgrid: localStorage.getItem('steamgrid_key') || '',
      rawg: localStorage.getItem('rawg_key') || '',
      igdbId: localStorage.getItem('igdb_client_id') || '',
      igdbSecret: localStorage.getItem('igdb_client_secret') || ''
    };
    const migrated = { ...defaults, ...legacy };
    if (Object.values(legacy).some(Boolean)) this.save(migrated);
    return migrated;
  }

  save(settings) {
    const normalized = Object.fromEntries(
      Object.entries(settings).map(([key, value]) => [key, String(value || '').trim()])
    );
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(normalized));
    localStorage.setItem('gs_url', normalized.url || '');
    localStorage.setItem('gs_token', normalized.token || '');
    localStorage.setItem('steamgrid_key', normalized.steamgrid || '');
    localStorage.setItem('rawg_key', normalized.rawg || '');
    localStorage.setItem('igdb_client_id', normalized.igdbId || '');
    localStorage.setItem('igdb_client_secret', normalized.igdbSecret || '');
    return normalized;
  }

  isConfigured() {
    const { url, token } = this.get();
    return Boolean(isWebAppUrl(url) && token);
  }
}

export class LibraryCache {
  read() {
    const current = readJson(STORAGE_KEYS.data, null);
    if (current) return normalizeLibrary(current);
    const legacy = readJson('gs_cached_data', null);
    if (legacy) return this.write(legacy);
    return normalizeLibrary(EMPTY_LIBRARY);
  }

  write(data) {
    const normalized = normalizeLibrary(data);
    localStorage.setItem(STORAGE_KEYS.data, JSON.stringify(normalized));
    return normalized;
  }
}

export class ProfileCache {
  read() {
    return readJson(STORAGE_KEYS.profile, { profile: null, configuration: {} });
  }

  write(profile, configuration = {}) {
    const value = { profile: profile || null, configuration: configuration || {} };
    localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(value));
    return value;
  }
}

export class GameApi {
  constructor(settingsStore) {
    this.settingsStore = settingsStore;
    this.configuration = {};
    this.coverCache = readJson(STORAGE_KEYS.covers, null) || readJson('coverCache', {});
    if (Object.keys(this.coverCache).length) {
      try { localStorage.setItem(STORAGE_KEYS.covers, JSON.stringify(this.coverCache)); } catch {}
    }
  }

  setConfiguration(configuration = {}) {
    this.configuration = configuration || {};
  }

  async getLibrary() {
    return this.post({ action: 'GET_LIBRARY' });
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

  importSteamWishlist() {
    return this.post({ action: 'IMPORT_STEAM_WISHLIST' });
  }

  saveRemoteSettings(settings) {
    return this.post({ action: 'SAVE_SETTINGS', ...settings });
  }

  async getCover(gameName) {
    if (this.coverCache[gameName]) return this.coverCache[gameName];

    const { steamgrid, rawg, igdbId, igdbSecret } = this.settingsStore.get();
    const hasLocalProvider = Boolean(steamgrid || rawg || (igdbId && igdbSecret));
    const hasRemoteProvider = Boolean(this.configuration.steamgrid || this.configuration.rawg || this.configuration.igdb);
    if (!hasLocalProvider && !hasRemoteProvider) return '';

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
    let response;
    try {
      response = await fetch(url, { method: 'POST', body: JSON.stringify({ ...payload, token }) });
    } catch {
      throw new Error('Não foi possível acessar o Apps Script. Confirme a URL /exec e publique o app da Web para acesso por qualquer pessoa.');
    }
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
    if (!isWebAppUrl(settings.url)) throw new Error('Informe a URL do app da Web do Apps Script terminada em /exec.');
    if (!settings.token) throw new Error('Informe o token da API nas configurações.');
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
