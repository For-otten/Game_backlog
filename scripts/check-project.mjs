import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('index.html', 'utf8');
const apiSource = readFileSync('google-apps-script/Api.gs', 'utf8');

for (const id of ['status-filters', 'games-list', 'game-form', 'settings-form', 'confirm-dialog', 'toast']) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `Elemento #${id} ausente no HTML.`);
}
assert.doesNotMatch(html, /\sonclick=/i, 'A interface não deve voltar a usar handlers inline.');
assert.match(html, /type="module" src="\.\/js\/app\.js"/, 'Entrada JavaScript modular ausente.');

class FakeRange {
  constructor(sheet, row, column, rows, columns) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rows = rows;
    this.columns = columns;
  }

  getValues() {
    return Array.from({ length: this.rows }, (_, rowOffset) =>
      Array.from({ length: this.columns }, (_, columnOffset) =>
        this.sheet.cells[this.row - 1 + rowOffset]?.[this.column - 1 + columnOffset] ?? ''
      )
    );
  }
}

class FakeSheet {
  constructor(name, cells) {
    this.name = name;
    this.cells = cells;
  }
  getName() { return this.name; }
  getLastRow() {
    for (let index = this.cells.length - 1; index >= 0; index -= 1) {
      if (this.cells[index]?.some((cell) => cell !== '' && cell != null)) return index + 1;
    }
    return 0;
  }
  getRange(row, column, rows = 1, columns = 1) { return new FakeRange(this, row, column, rows, columns); }
}

const sheets = [
  new FakeSheet('Lista de Jogos', [
    ['Nome', 'Plataforma', 'Interesse'],
    ['Hades', 'PC', 'Alto'],
    ['', '', ''],
    ['Cocoon', 'Xbox', 'Médio']
  ]),
  new FakeSheet('Jogos Concluídos', [
    [],
    ['Nome', 'Plataforma', 'Data', 'Troféus', 'Platinar?', '', 'Nome', 'Plataforma', 'Data', 'Troféus'],
    ['Inside', 'PC', '01/01/2026', '50%', false],
    [],
    ['Celeste', 'PC', '02/01/2026', '100%', 'Platinado', '', 'Hollow Knight', 'PC', '03/01/2026', '83%']
  ]),
  new FakeSheet('Dropados', [
    ['Nome', 'Plataforma', 'Data'],
    ['Limbo', 'PC', '04/01/2026']
  ])
];

const spreadsheet = {
  getSheetByName: (name) => sheets.find((sheet) => sheet.getName() === name) || null,
  getSheets: () => sheets
};
const context = vm.createContext({
  SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
  console
});
vm.runInContext(apiSource, context);

const data = context.readGameDatabase_();
assert.deepEqual(Array.from(data.backlog, (game) => game.row), [2, 4], 'As linhas físicas do backlog devem ser preservadas.');
assert.equal(data.concluidos[0].row, 3);
assert.equal(data.platinados[0].nome, 'Celeste');
assert.equal(data.platinados[0].row, 5);
assert.equal(data.platinando[0].row, 5, 'A tabela da direita deve manter seu próprio índice de linha.');
assert.equal(data.dropados[0].row, 2);
assert.equal(context.isPlatinumRecord_('', 'Platinado'), true);
assert.equal(context.isPlatinumRecord_('100%', ''), true);
assert.equal(context.isPlatinumRecord_('99%', ''), false);
assert.equal(context.normalizeInterest_('medio'), 'Médio');

console.log('Estrutura e regras principais verificadas com sucesso.');
