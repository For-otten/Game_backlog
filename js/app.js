import { EMPTY_LIBRARY, GameApi, LibraryCache, SettingsStore, isWebAppUrl } from './api.js';
import { GameView } from './ui.js';

class GameBacklogApp {
  constructor() {
    this.settings = new SettingsStore();
    this.cache = new LibraryCache();
    this.api = new GameApi(this.settings);
    this.view = new GameView();
    this.library = structuredClone(EMPTY_LIBRARY);
    this.activeFilter = 'todos';
    this.search = '';
    this.sort = 'sheet';
    this.busy = false;
    this.pendingAvatar = null;
  }

  start() {
    this.bindEvents();
    this.view.fillSettings(this.settings.get());
    this.library = this.cache.read();
    this.render();
    if (this.settings.isConfigured()) {
      this.view.setConnection('online', 'Conectando');
      this.refresh({ silent: true });
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
      this.render();
    });

    document.querySelector('#search-input').addEventListener('input', (event) => {
      this.search = event.target.value;
      this.render();
    });

    document.querySelector('#sort-select').addEventListener('change', (event) => {
      this.sort = event.target.value;
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
    document.querySelector('#settings-avatar-file').addEventListener('change', (event) => this.previewSelectedAvatar(event));
    document.querySelector('#settings-url').addEventListener('input', (event) => event.target.setCustomValidity(''));
    document.querySelector('#settings-profile-name').addEventListener('input', (event) => {
      const source = this.pendingAvatar ?? this.settings.get().avatar;
      this.view.previewAvatar(source, event.target.value);
    });
  }

  render() {
    this.view.render(this.library, this.activeFilter, this.search, this.sort, this.settings.get());
    this.view.observeCovers((name) => this.api.getCover(name));
  }

  openSettings() {
    this.pendingAvatar = null;
    document.querySelector('#settings-avatar-file').value = '';
    this.view.fillSettings(this.settings.get());
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

  async refresh({ silent = false } = {}) {
    if (this.busy || !this.settings.isConfigured()) return;
    this.busy = true;
    if (!silent) this.view.showToast('Sincronizando biblioteca', { loading: true });
    try {
      const response = await this.api.getLibrary();
      this.library = this.cache.write(response.data);
      this.render();
      this.view.setConnection('online', 'Planilha conectada');
      if (!silent) this.view.showToast('Biblioteca atualizada.');
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
    const scriptUrl = urlField.value.trim();
    if (!isWebAppUrl(scriptUrl)) {
      urlField.setCustomValidity('Use a URL de implantação do Apps Script terminada em /exec, não a URL da planilha.');
      urlField.reportValidity();
      urlField.focus();
      return;
    }
    this.settings.save({
      ...previous,
      profileName: document.querySelector('#settings-profile-name').value.trim() || 'Jogador',
      profileSubtitle: document.querySelector('#settings-profile-subtitle').value.trim() || 'Perfil local',
      avatar: this.pendingAvatar ?? previous.avatar ?? '',
      url: scriptUrl,
      token: document.querySelector('#settings-token').value,
      steamgrid: document.querySelector('#settings-steamgrid').value,
      rawg: document.querySelector('#settings-rawg').value,
      igdbId: document.querySelector('#settings-igdb-id').value,
      igdbSecret: document.querySelector('#settings-igdb-secret').value
    });
    this.pendingAvatar = null;
    this.view.closeDialog('settings-dialog');
    this.render();
    await this.refresh();
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
