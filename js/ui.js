const STATUS = {
  backlog: 'Backlog',
  platinando: 'Platinando',
  concluidos: 'Concluído',
  platinados: 'Platinado',
  dropados: 'Dropado'
};

export class GameView {
  constructor() {
    this.list = document.querySelector('#games-list');
    this.empty = document.querySelector('#empty-state');
    this.toastTimer = null;
    this.coverObserver = null;
  }

  render(library, activeFilter, query = '', sort = 'sheet', profile = {}) {
    const allGames = flattenLibrary(library);
    const filtered = this.filterGames(allGames, activeFilter, query);
    const sorted = this.sortGames(filtered, sort);

    this.renderProfile(library, profile);
    this.renderCounts(library, allGames.length);
    this.renderPlatforms(allGames);

    this.list.replaceChildren(...sorted.map((game) => this.createRow(game)));
    this.list.hidden = sorted.length === 0;
    this.empty.hidden = sorted.length !== 0;
    document.querySelector('#empty-title').textContent = query ? 'Nenhum resultado' : 'Nenhum jogo neste filtro';
    document.querySelector('#empty-message').textContent = query ? 'Revise o termo de busca.' : 'Selecione outro filtro ou adicione um jogo.';
    document.querySelector('#empty-action').hidden = Boolean(query) || activeFilter !== 'backlog';
    document.querySelector('#result-count').textContent = `${sorted.length} ${sorted.length === 1 ? 'jogo' : 'jogos'}`;

    document.querySelectorAll('[data-filter]').forEach((button) => {
      const selected = button.dataset.filter === activeFilter;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  filterGames(games, activeFilter, query) {
    const term = normalizeText(query);
    return games.filter((game) => {
      const statusMatch = activeFilter === 'todos'
        || game.collection === activeFilter
        || (activeFilter === 'concluidos' && game.collection === 'platinados');
      const queryMatch = !term || normalizeText(`${game.nome} ${game.plataforma}`).includes(term);
      return statusMatch && queryMatch;
    });
  }

  sortGames(games, sort) {
    const sorted = [...games];
    if (sort === 'name') sorted.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    if (sort === 'progress') sorted.sort((a, b) => (trophyPercent(b.trofeus) ?? -1) - (trophyPercent(a.trofeus) ?? -1));
    if (sort === 'status') {
      const order = { backlog: 0, platinando: 1, concluidos: 2, platinados: 3, dropados: 4 };
      sorted.sort((a, b) => order[a.collection] - order[b.collection] || a.nome.localeCompare(b.nome, 'pt-BR'));
    }
    return sorted;
  }

  renderProfile(library, profile) {
    const name = profile.profileName || 'Jogador';
    const subtitle = profile.profileSubtitle || 'Perfil local';
    document.querySelector('#profile-name').textContent = name;
    document.querySelector('#profile-subtitle').textContent = subtitle;
    this.setAvatar(document.querySelector('#profile-avatar'), profile.avatar, name);

    const total = Object.values(library).reduce((sum, games) => sum + games.length, 0);
    const completed = library.concluidos.length + library.platinando.length + library.platinados.length;
    const progressValues = [...library.concluidos, ...library.platinando, ...library.platinados]
      .map((game) => trophyPercent(game.trofeus))
      .filter((value) => value !== null);
    const average = progressValues.length
      ? `${Math.round(progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length)}%`
      : '—';

    document.querySelector('#profile-games').textContent = total;
    document.querySelector('#profile-completed').textContent = completed;
    document.querySelector('#profile-platinum').textContent = library.platinados.length;
    document.querySelector('#profile-progress').textContent = average;
  }

  renderCounts(library, total) {
    const counts = {
      todos: total,
      backlog: library.backlog.length,
      platinando: library.platinando.length,
      concluidos: library.concluidos.length + library.platinados.length,
      dropados: library.dropados.length
    };
    Object.entries(counts).forEach(([key, value]) => {
      document.querySelector(`[data-filter-count="${key}"]`).textContent = value;
    });
  }

  renderPlatforms(games) {
    const platforms = [...new Set(games.map((game) => game.plataforma).filter(Boolean))].sort();
    const datalist = document.querySelector('#platform-options');
    datalist.replaceChildren(...platforms.map((platform) => {
      const option = document.createElement('option');
      option.value = platform;
      return option;
    }));
  }

  createRow(game) {
    const row = element('article', 'game-row');
    row.dataset.row = game.row;
    row.dataset.name = game.nome;
    row.dataset.collection = game.collection;

    const cover = element('div', 'game-cover', (game.nome || '?').trim().charAt(0).toUpperCase());
    const image = document.createElement('img');
    image.alt = `Capa de ${game.nome}`;
    image.loading = 'lazy';
    image.dataset.coverName = game.nome;
    cover.append(image);

    const main = element('div', 'game-main');
    main.append(element('h3', 'game-title', game.nome));
    const details = element('div', 'game-details');
    details.append(element('span', `game-status game-status--${game.collection}`, STATUS[game.collection]));
    if (game.plataforma) details.append(element('span', '', game.plataforma));
    if (game.data) details.append(element('span', '', formatDate(game.data)));
    main.append(details);
    if (game.interesse) {
      const interest = element('div', 'game-interest');
      interest.append('Interesse: ', element('strong', '', game.interesse));
      main.append(interest);
    }

    const progress = this.createProgress(game);
    const actions = this.createActions(game.collection);
    row.append(cover, main, progress, actions);
    return row;
  }

  createProgress(game) {
    const container = element('div', 'game-progress');
    const percent = trophyPercent(game.trofeus);
    if (percent === null) {
      container.append(element('span', 'progress-empty', game.collection === 'backlog' ? 'Progresso não disponível' : 'Troféus não sincronizados'));
      return container;
    }

    const header = element('div', 'progress-header');
    header.append(element('span', '', 'Progresso de troféus'), element('strong', '', `${formatPercent(percent)}%`));
    const track = element('div', 'progress-track');
    const value = element('div', `progress-value${game.collection === 'platinados' ? ' progress-value--platinum' : ''}`);
    value.style.width = `${Math.max(0, Math.min(percent, 100))}%`;
    track.append(value);
    container.append(header, track);
    return container;
  }

  createActions(collection) {
    const actions = element('div', 'row-actions');
    actions.append(actionButton('edit', 'Editar', 'row-action--secondary'));
    const definitions = {
      backlog: [['complete', 'Concluir', ''], ['drop', 'Dropar', 'row-action--danger']],
      concluidos: [['start-platinum', 'Iniciar platina', '']],
      platinando: [['finish-platinum', 'Marcar platinado', 'row-action--platinum']],
      dropados: [['restore', 'Restaurar', '']]
    };
    (definitions[collection] || []).forEach(([action, label, modifier]) => actions.append(actionButton(action, label, modifier)));
    return actions;
  }

  observeCovers(loadCover) {
    this.coverObserver?.disconnect();
    this.coverObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(async (entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        const image = entry.target;
        try {
          const source = await loadCover(image.dataset.coverName);
          if (!source || !image.isConnected) return;
          image.addEventListener('load', () => image.classList.add('is-loaded'), { once: true });
          image.src = source;
        } catch {
          // Capas são opcionais e não bloqueiam a biblioteca.
        }
      });
    }, { rootMargin: '180px' });
    document.querySelectorAll('[data-cover-name]').forEach((image) => this.coverObserver.observe(image));
  }

  setConnection(status, label) {
    const connection = document.querySelector('#connection-label');
    connection.classList.toggle('is-online', status === 'online');
    connection.classList.toggle('is-error', status === 'error');
    connection.textContent = label;
  }

  openGameDialog(game = null, collection = 'backlog') {
    const editing = Boolean(game);
    document.querySelector('#game-dialog-title').textContent = editing ? 'Editar jogo' : 'Adicionar jogo';
    document.querySelector('#game-submit').textContent = editing ? 'Salvar alterações' : 'Adicionar jogo';
    document.querySelector('#game-row').value = editing ? game.row : '';
    document.querySelector('#game-collection').value = editing ? collection : 'backlog';
    document.querySelector('#game-original-name').value = editing ? game.nome : '';
    document.querySelector('#game-name').value = editing ? game.nome || '' : '';
    document.querySelector('#game-platform').value = editing ? game.plataforma || '' : '';
    document.querySelector('#game-interest').value = editing ? game.interesse || 'Médio' : 'Médio';
    document.querySelector('#interest-field').hidden = editing && collection !== 'backlog';
    this.openDialog('game-dialog');
    setTimeout(() => document.querySelector('#game-name').focus(), 0);
  }

  fillSettings(settings) {
    document.querySelector('#settings-profile-name').value = settings.profileName || '';
    document.querySelector('#settings-profile-subtitle').value = settings.profileSubtitle || '';
    document.querySelector('#settings-url').value = settings.url;
    document.querySelector('#settings-token').value = settings.token;
    document.querySelector('#settings-steamgrid').value = settings.steamgrid;
    document.querySelector('#settings-rawg').value = settings.rawg;
    document.querySelector('#settings-igdb-id').value = settings.igdbId;
    document.querySelector('#settings-igdb-secret').value = settings.igdbSecret;
    this.setAvatar(document.querySelector('#settings-avatar-preview'), settings.avatar, settings.profileName || 'Jogador');
  }

  previewAvatar(source, name = '') {
    this.setAvatar(document.querySelector('#settings-avatar-preview'), source, name || 'Jogador');
  }

  setAvatar(container, source, name) {
    const image = container.querySelector('img');
    const initial = container.querySelector('span');
    initial.textContent = (name || 'J').trim().charAt(0).toUpperCase();
    if (source) {
      image.src = source;
      image.alt = `Foto de ${name || 'perfil'}`;
      image.hidden = false;
    } else {
      image.removeAttribute('src');
      image.hidden = true;
    }
  }

  openDialog(id) {
    const dialog = document.getElementById(id);
    if (!dialog.open) dialog.showModal();
  }

  closeDialog(dialog) {
    const target = typeof dialog === 'string' ? document.getElementById(dialog) : dialog;
    if (target?.open) target.close();
  }

  confirm(message) {
    const dialog = document.querySelector('#confirm-dialog');
    document.querySelector('#confirm-message').textContent = message;
    dialog.returnValue = 'cancel';
    dialog.showModal();
    return new Promise((resolve) => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }));
  }

  showToast(message, { loading = false, error = false, duration = 3200 } = {}) {
    clearTimeout(this.toastTimer);
    const toast = document.querySelector('#toast');
    document.querySelector('#toast-message').textContent = message;
    document.querySelector('#toast-spinner').hidden = !loading;
    toast.classList.toggle('is-error', error);
    toast.hidden = false;
    if (!loading && duration) this.toastTimer = setTimeout(() => { toast.hidden = true; }, duration);
  }
}

function flattenLibrary(library) {
  return Object.entries(library).flatMap(([collection, games]) => games.map((game) => ({ ...game, collection })));
}

function actionButton(action, label, modifier) {
  const button = element('button', `row-action ${modifier}`.trim(), label);
  button.type = 'button';
  button.dataset.action = action;
  return button;
}

function element(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function trophyPercent(value) {
  if (value === '' || value === null || value === undefined || value === 'Não vinculado') return null;
  const number = Number.parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function formatPercent(value) { return Number.isInteger(value) ? value : value.toFixed(1).replace('.', ','); }

function formatDate(value) {
  if (!value) return '';
  const brazilian = String(value).match(/^(\d{2}\/\d{2}\/\d{4})/);
  if (brazilian) return brazilian[1];
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('pt-BR').format(date);
}
