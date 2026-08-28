import { EMPTY_LIBRARY, GameApi, LibraryCache, ProfileCache, SettingsStore, isWebAppUrl, parseConnectionUrl } from './api.js';
import { GameView } from './ui.js';

const SORT_STORAGE_KEY = 'checkpoint.sort-by-filter.v1';
const LEGACY_SORT_STORAGE_KEY = 'checkpoint.sort.v1';
const VALID_SORTS = new Set(['sheet', 'name', 'progress', 'date', 'status']);
const DEFAULT_SORT_BY_FILTER = {
  todos: 'sheet',
  backlog: 'sheet',
  platinando: 'progress',
  concluidos: 'progress',
  dropados: 'date'
};

class GameBacklogApp {
  constructor() {
    this.settings = new SettingsStore();
    this.cache = new LibraryCache();
    this.profileCache = new ProfileCache();
    this.api = new GameApi(this.settings);
    this.view = new GameView();
    this.library = structuredClone(EMPTY_LIBRARY);
    this.profileState = this.profileCache.read();
    this.api.setConfiguration(this.profileState.configuration);
    this.activeFilter = 'todos';
    this.search = '';
    this.sortPreferences = readSortPreferences();
    this.sort = sortForFilter(this.activeFilter, this.sortPreferences);
    this.busy = false;
    this.wishlistChecked = false;
    this.pendingAvatar = null;
  }

  start() {
    this.bindEvents();
    this.view.fillSettings(this.mergedProfile(), this.profileState.configuration);
    this.library = this.cache.read();
    this.render();
    if (this.settings.isConfigured()) {
      this.view.setConnection('online', 'Conectando');
      this.refresh({ silent: true, checkWishlist: true });
    } else {
      const saved = this.settings.get();
      const invalidUrl = Boolean(saved.url && !isWebAppUrl(saved.url));
      this.view.setConnection(invalidUrl ? 'error' : 'idle', invalidUrl ? 'URL inválida' : 'Não configurado');
      if (invalidUrl) setTimeout(() => this.openSettings(), 0);
    }
  }

  bindEvents() {
    document.querySelector('#status-filters').addEventListener('click', (event) => {
      const button = event.target.closest('[data-filter]');
      if (!button) return;
      this.activeFilter = button.dataset.filter;
      this.sort = sortForFilter(this.activeFilter, this.sortPreferences);
      document.querySelector('#sort-select').value = this.sort;
      this.render();
    });

    document.querySelector('#search-input').addEventListener('input', (event) => {
      this.search = event.target.value;
      this.render();
    });

    const sortSelect = document.querySelector('#sort-select');
    sortSelect.value = this.sort;
    sortSelect.addEventListener('change', (event) => {
      this.sort = event.target.value;
      this.sortPreferences[this.activeFilter] = this.sort;
      saveSortPreferences(this.sortPreferences);
      this.render();
    });

    document.addEventListener('click', (event) => {
      const opener = event.target.closest('[data-open-dialog]');
      if (opener) {
        if (opener.dataset.openDialog === 'game-dialog') this.view.openGameDialog();
        if (opener.dataset.openDialog === 'settings-dialog') this.openSettings();
      }
      const closer = event.target.closest('[data-close-dialog]');
      if (closer) this.view.closeDialog(closer.closest('dialog'));
    });

    document.querySelectorAll('dialog').forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) this.view.closeDialog(dialog);
      });
    });

    document.querySelector('#empty-action').addEventListener('click', () => this.view.openGameDialog());
    document.querySelector('#games-list').addEventListener('click', (event) => this.handleGameAction(event));
    document.querySelector('#game-form').addEventListener('submit', (event) => this.saveGame(event));
    document.querySelector('#settings-form').addEventListener('submit', (event) => this.saveSettings(event));
    document.querySelector('#sync-button').addEventListener('click', () => this.syncTrophies());
    document.querySelector('#wishlist-import-button').addEventListener('click', () => this.importSteamWishlist());
    document.querySelector('#settings-avatar-file').addEventListener('change', (event) => this.previewSelectedAvatar(event));
    document.querySelector('#settings-url').addEventListener('input', (event) => event.target.setCustomValidity(''));
    document.querySelector('#settings-token').addEventListener('input', (event) => event.target.setCustomValidity(''));
    document.querySelector('#settings-profile-name').addEventListener('input', (event) => {
      const source = this.pendingAvatar ?? this.settings.get().avatar;
      this.view.previewAvatar(source, event.target.value);
    });
  }

  render() {
    this.view.render(this.library, this.activeFilter, this.search, this.sort, this.mergedProfile());
    this.view.observeCovers((name) => this.api.getCover(name));
  }

  mergedProfile() {
    return { ...this.settings.get(), ...(this.profileState.profile || {}) };
  }

  openSettings() {
    this.pendingAvatar = null;
    document.querySelector('#settings-avatar-file').value = '';
    this.view.fillSettings(this.mergedProfile(), this.profileState.configuration);
    this.view.openDialog('settings-dialog');
  }

  async previewSelectedAvatar(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      this.view.showToast('A imagem deve ter no máximo 8 MB.', { error: true });
      event.target.value = '';
      return;
    }
    try {
      this.pendingAvatar = await resizeImage(file, 320);
      this.view.previewAvatar(this.pendingAvatar, document.querySelector('#settings-profile-name').value);
    } catch {
      this.view.showToast('Não foi possível processar a imagem selecionada.', { error: true });
    }
  }

  async refresh({ silent = false, checkWishlist = false } = {}) {
    if (this.busy || !this.settings.isConfigured()) return;
    this.busy = true;
    if (!silent) this.view.showToast('Sincronizando biblioteca', { loading: true });
    try {
      const response = await this.api.getLibrary();
      this.library = this.cache.write(response.data);
      if (response.profile || response.configuration) {
        this.profileState = this.profileCache.write(
          response.profile || this.profileState.profile,
          response.configuration || this.profileState.configuration
        );
        this.api.setConfiguration(this.profileState.configuration);
      }

      let wishlistImport = null;
      if (checkWishlist && !this.wishlistChecked && (this.profileState.configuration?.steamWishlist || this.profileState.configuration?.steam)) {
        this.wishlistChecked = true;
        try {
          wishlistImport = await this.api.importSteamWishlist();
          if (wishlistImport.data) this.library = this.cache.write(wishlistImport.data);
        } catch (error) {
          console.warn(`Wishlist Steam não importada: ${error.message}`);
        }
      }

      this.render();
      this.view.setConnection('online', 'Planilha conectada');
      if (wishlistImport?.imported > 0 || wishlistImport?.removed > 0) {
        this.view.showToast(wishlistImport.message);
      } else if (!silent) {
        this.view.showToast('Biblioteca atualizada.');
      }
    } catch (error) {
      this.view.setConnection('error', 'Falha na conexão');
      this.view.showToast(error.message, { error: true, duration: 5200 });
    } finally {
      this.busy = false;
    }
  }

  async saveSettings(event) {
    event.preventDefault();
    const previous = this.settings.get();
    const urlField = document.querySelector('#settings-url');
    const tokenField = document.querySelector('#settings-token');
    const connection = parseConnectionUrl(urlField.value, tokenField.value);
    if (!isWebAppUrl(connection.url)) {
      urlField.setCustomValidity('Use a URL de implantação do Apps Script terminada em /exec, não a URL da planilha.');
      urlField.reportValidity();
      urlField.focus();
      return;
    }
    if (!connection.token) {
      tokenField.setCustomValidity('Use a URL de conexão completa ou informe o token manualmente.');
      tokenField.reportValidity();
      tokenField.focus();
      return;
    }
    tokenField.setCustomValidity('');
    const localSettings = this.settings.save({
      ...previous,
      profileName: document.querySelector('#settings-profile-name').value.trim() || 'Jogador',
      profileSubtitle: document.querySelector('#settings-profile-subtitle').value.trim() || 'Perfil local',
      avatar: this.pendingAvatar ?? previous.avatar ?? '',
      url: connection.url,
      token: connection.token,
      steamgrid: document.querySelector('#settings-steamgrid').value,
      rawg: document.querySelector('#settings-rawg').value,
      igdbId: document.querySelector('#settings-igdb-id').value,
      igdbSecret: document.querySelector('#settings-igdb-secret').value
    });
    this.view.showToast('Salvando configuração na planilha', { loading: true });
    try {
      const response = await this.api.saveRemoteSettings({
        profileName: localSettings.profileName,
        profileSubtitle: localSettings.profileSubtitle,
        steamgridKey: localSettings.steamgrid,
        rawgKey: localSettings.rawg,
        igdbClientId: localSettings.igdbId,
        igdbClientSecret: localSettings.igdbSecret
      });
      this.settings.save({ ...localSettings, steamgrid: '', rawg: '', igdbId: '', igdbSecret: '' });
      this.profileState = this.profileCache.write(
        response.profile || this.profileState.profile,
        response.configuration || this.profileState.configuration
      );
      this.api.setConfiguration(this.profileState.configuration);
      this.pendingAvatar = null;
      this.view.closeDialog('settings-dialog');
      this.render();
      await this.refresh({ silent: true, checkWishlist: true });
      this.view.showToast('Perfil e integrações salvos na planilha.');
    } catch (error) {
      this.view.showToast(error.message, { error: true, duration: 5200 });
    }
  }

  async saveGame(event) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;

    const row = document.querySelector('#game-row').value;
    const collection = document.querySelector('#game-collection').value || 'backlog';
    const game = {
      nome: document.querySelector('#game-name').value.trim(),
      plataforma: document.querySelector('#game-platform').value.trim(),
      interesse: document.querySelector('#game-interest').value
    };

    this.view.closeDialog('game-dialog');
    await this.mutate(
      row
        ? () => this.api.updateGame({ ...game, row: Number(row), collection, expectedName: document.querySelector('#game-original-name').value })
        : () => this.api.addGame(game),
      row ? 'Salvando alterações' : 'Adicionando jogo'
    );
  }

  async handleGameAction(event) {
    const button = event.target.closest('[data-action]');
    const row = event.target.closest('.game-row');
    if (!button || !row || this.busy) return;

    const collection = row.dataset.collection;
    const game = (this.library[collection] || []).find((item) => String(item.row) === row.dataset.row && item.nome === row.dataset.name);
    if (!game) {
      this.view.showToast('O item mudou. Sincronize e tente novamente.', { error: true });
      return;
    }
    if (button.dataset.action === 'edit') {
      this.view.openGameDialog(game, collection);
      return;
    }

    const moves = {
      complete: { to: 'concluidos', question: `Marcar “${game.nome}” como concluído?` },
      drop: { to: 'dropados', question: `Mover “${game.nome}” para dropados?` },
      'start-platinum': { to: 'platinando', question: `Iniciar a platina de “${game.nome}”?` },
      'finish-platinum': { to: 'platinados', question: `Marcar “${game.nome}” como platinado?` },
      restore: { to: 'backlog', question: `Restaurar “${game.nome}” ao backlog?` }
    };
    const move = moves[button.dataset.action];
    if (!move || !(await this.view.confirm(move.question))) return;
    await this.mutate(
      () => this.api.moveGame({ from: collection, to: move.to, row: game.row, expectedName: game.nome }),
      'Atualizando biblioteca'
    );
  }

  async syncTrophies() {
    if (this.busy) return;
    if (!(await this.view.confirm('Sincronizar agora os troféus da Steam e do Xbox?'))) return;
    await this.mutate(() => this.api.syncTrophies(), 'Sincronizando troféus');
  }

  async importSteamWishlist() {
    if (this.busy) return;
    const confirmed = await this.view.confirm(
      'Importar os jogos da sua wishlist pública da Steam para o backlog? Jogos que já fazem parte da biblioteca serão ignorados.'
    );
    if (!confirmed) return;
    await this.mutate(() => this.api.importSteamWishlist(), 'Importando wishlist da Steam');
  }

  async mutate(operation, loadingMessage) {
    if (this.busy) return;
    this.busy = true;
    document.querySelectorAll('.button, .row-action').forEach((button) => { button.disabled = true; });
    this.view.showToast(loadingMessage, { loading: true });
    try {
      const response = await operation();
      if (response.data) this.library = this.cache.write(response.data);
      this.render();
      this.view.setConnection('online', 'Planilha conectada');
      this.view.showToast(response.message || 'Alteração salva.');
    } catch (error) {
      this.view.setConnection('error', 'Falha na conexão');
      this.view.showToast(error.message, { error: true, duration: 5200 });
    } finally {
      this.busy = false;
      document.querySelectorAll('.button, .row-action').forEach((button) => { button.disabled = false; });
    }
  }
}

function readSortPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(SORT_STORAGE_KEY) || '{}');
    const preferences = Object.fromEntries(
      Object.entries(saved).filter(([filter, sort]) => filter in DEFAULT_SORT_BY_FILTER && VALID_SORTS.has(sort))
    );
    const legacySort = localStorage.getItem(LEGACY_SORT_STORAGE_KEY);
    if (!preferences.todos && VALID_SORTS.has(legacySort)) preferences.todos = legacySort;
    return preferences;
  } catch {
    return {};
  }
}

function saveSortPreferences(preferences) {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Mantém as escolhas durante a sessão quando o armazenamento está indisponível.
  }
}

function sortForFilter(filter, preferences) {
  return preferences[filter] || DEFAULT_SORT_BY_FILTER[filter] || 'sheet';
}

function resizeImage(file, size) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const source = URL.createObjectURL(file);
    image.onload = () => {
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      const x = (image.naturalWidth - side) / 2;
      const y = (image.naturalHeight - side) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      canvas.getContext('2d').drawImage(image, x, y, side, side, 0, 0, size, size);
      URL.revokeObjectURL(source);
      resolve(canvas.toDataURL('image/jpeg', 0.86));
    };
    image.onerror = () => { URL.revokeObjectURL(source); reject(new Error('Imagem inválida.')); };
    image.src = source;
  });
}

new GameBacklogApp().start();
