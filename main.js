'use strict';

/* ============ Datos y configuración ============ */
const API_URL = 'https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/all.json';
const PER_PAGE = 20;
const FALLBACK_IMG = 'https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/no-portrait.jpg';
const STORAGE_KEY = 'superfinder:state';
const THEME_KEY = 'superfinder:theme';

const STAT_LABELS = {
  intelligence: 'Inteligencia',
  strength: 'Fuerza',
  speed: 'Velocidad',
  durability: 'Resistencia',
  power: 'Poder',
  combat: 'Combate'
};

/* ============ Estado ============ */
const state = { all: [], results: [], query: '', order: 'asc', page: 1, gender: '', publisher: '', alignment: '' };
const NO_DATA = '__none__';

/* ============ Referencias al DOM ============ */
const $ = (id) => document.getElementById(id);
const dom = {
  form: $('searchForm'), input: $('searchInput'), sort: $('sortSelect'),
  info: $('resultsInfo'), grid: $('grid'), pagination: $('pagination'),
  first: $('firstBtn'), prev: $('prevBtn'), next: $('nextBtn'), last: $('lastBtn'),
  pageInfo: $('pageInfo'), pageSelect: $('pageSelect'),
  gender: $('genderSelect'), publisher: $('publisherSelect'), alignment: $('alignmentSelect'),
  detail: $('detail'), theme: $('themeToggle')
};

/* ============ Utilidades ============ */
const normalize = (text) =>
  text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

const escapeHTML = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const clean = (value) => {
  const text = Array.isArray(value) ? value.join(', ') : value;
  return !text || text === '-' ? 'Sin datos' : text;
};

// Valor de filtro de un dato: vacío o '-' se agrupan como "sin datos"
const filterKey = (value) => (!value || value === '-' ? NO_DATA : value);

const totalPages = () => Math.max(1, Math.ceil(state.results.length / PER_PAGE));

/* ============ API ============ */
async function loadHeroes() {
  const response = await fetch(API_URL);
  if (!response.ok) throw new Error(`Error ${response.status}`);
  return response.json();
}

/* ============ Lógica de búsqueda y orden ============ */
function applyFilters() {
  const term = normalize(state.query);
  const found = state.all.filter((hero) =>
    normalize(hero.name).includes(term) &&
    (!state.gender || filterKey(hero.appearance.gender) === state.gender) &&
    (!state.publisher || filterKey(hero.biography.publisher) === state.publisher) &&
    (!state.alignment || filterKey(hero.biography.alignment) === state.alignment));
  const direction = state.order === 'asc' ? 1 : -1;
  state.results = found.sort((a, b) => a.name.localeCompare(b.name) * direction);
  state.page = Math.min(state.page, totalPages());
}

/* ============ Opciones de editorial (según los datos) ============ */
function populatePublishers() {
  const publishers = [...new Set(state.all.map((hero) => filterKey(hero.biography.publisher)))]
    .filter((value) => value !== NO_DATA)
    .sort((a, b) => a.localeCompare(b));
  const options = [['', 'Todas'], ...publishers.map((name) => [name, name]), [NO_DATA, 'Sin datos']];
  dom.publisher.innerHTML = options
    .map(([value, label]) => `<option value="${escapeHTML(value)}">${escapeHTML(label)}</option>`)
    .join('');
  // Si la editorial guardada ya no existe, se limpia el filtro
  if (!options.some(([value]) => value === state.publisher)) state.publisher = '';
  dom.publisher.value = state.publisher;
}

/* ============ Render ============ */
function cardTemplate(hero) {
  return `
    <article class="card">
      <button class="card__btn" type="button" data-id="${hero.id}" aria-label="Ver ficha de ${escapeHTML(hero.name)}">
        <img class="card__img" src="${hero.images.md}" alt="" loading="lazy" onerror="this.src='${FALLBACK_IMG}'">
        <h2 class="card__name">${escapeHTML(hero.name)}</h2>
        <span class="badge">${escapeHTML(clean(hero.biography.publisher))}</span>
      </button>
    </article>`;
}

function renderGrid() {
  const start = (state.page - 1) * PER_PAGE;
  const slice = state.results.slice(start, start + PER_PAGE);
  dom.grid.innerHTML = slice.length
    ? slice.map(cardTemplate).join('')
    : `<p class="empty">¡Pow! No hay héroes con ese nombre. Prueba con otra búsqueda.</p>`;
}

function renderInfo() {
  const total = state.results.length;
  dom.info.textContent = total === 1 ? '1 personaje encontrado' : `${total} personajes encontrados`;
}

function renderPagination() {
  const pages = totalPages();
  dom.pageInfo.textContent = `Página ${state.page} de ${pages}`;
  dom.first.disabled = dom.prev.disabled = state.page === 1;
  dom.next.disabled = dom.last.disabled = state.page === pages;
  dom.pageSelect.innerHTML = Array.from({ length: pages }, (_, i) =>
    `<option value="${i + 1}"${i + 1 === state.page ? ' selected' : ''}>${i + 1}</option>`).join('');
  dom.pagination.hidden = state.results.length === 0;
}

function render() {
  renderInfo();
  renderGrid();
  renderPagination();
  saveState();
}

/* ============ Ficha de personaje ============ */
function statBar([key, label]) {
  const value = Number(state.current.powerstats[key]) || 0;
  return `
    <li class="stat">
      <span class="stat__label">${label}</span>
      <span class="stat__bar"><span style="width:${Math.min(value, 100)}%"></span></span>
      <span class="stat__value">${value}</span>
    </li>`;
}

function infoRow(label, value) {
  return `<div class="info"><dt>${label}</dt><dd>${escapeHTML(clean(value))}</dd></div>`;
}

function detailTemplate(hero) {
  const { biography: bio, appearance: look, work, connections } = hero;
  return `
    <div class="detail__inner">
      <button class="btn btn--icon detail__close" type="button" data-close aria-label="Cerrar ficha">✕</button>
      <div class="detail__head">
        <img class="detail__img" src="${hero.images.lg}" alt="Retrato de ${escapeHTML(hero.name)}" onerror="this.src='${FALLBACK_IMG}'">
        <div>
          <h2 id="detailTitle" class="detail__name">${escapeHTML(hero.name)}</h2>
          <p class="detail__real">${escapeHTML(clean(bio.fullName))}</p>
          <span class="badge">${escapeHTML(clean(bio.publisher))}</span>
        </div>
      </div>
      <h3 class="detail__title">Estadísticas de poder</h3>
      <ul class="stats">${Object.entries(STAT_LABELS).map(statBar).join('')}</ul>
      <h3 class="detail__title">Biografía</h3>
      <dl class="infos">
        ${infoRow('Alias', bio.aliases)}
        ${infoRow('Lugar de nacimiento', bio.placeOfBirth)}
        ${infoRow('Ocupación', work.occupation)}
        ${infoRow('Altura', look.height[1])}
        ${infoRow('Peso', look.weight[1])}
        ${infoRow('Afiliaciones', connections.groupAffiliation)}
        ${infoRow('Familiares', connections.relatives)}
      </dl>
    </div>`;
}

function openDetail(id) {
  const hero = state.all.find((item) => item.id === Number(id));
  if (!hero) return;
  state.current = hero;
  dom.detail.innerHTML = detailTemplate(hero);
  dom.detail.showModal();
}

/* ============ Persistencia (volver a la búsqueda) ============ */
function saveState() {
  const { query, order, page, gender, publisher, alignment } = state;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ query, order, page, gender, publisher, alignment }));
}

function restoreState() {
  try {
    Object.assign(state, JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || {});
  } catch { /* estado inválido: se ignora */ }
  dom.input.value = state.query;
  dom.sort.value = state.order;
  dom.gender.value = state.gender;
  dom.alignment.value = state.alignment;
}

/* ============ Tema ============ */
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  dom.theme.textContent = theme === 'dark' ? '☀️' : '🌙';
  dom.theme.setAttribute('aria-label', theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro');
  localStorage.setItem(THEME_KEY, theme);
}

function initTheme() {
  const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  setTheme(localStorage.getItem(THEME_KEY) || preferred);
}

/* ============ Navegación ============ */
function goToPage(page) {
  state.page = Math.min(Math.max(1, page), totalPages());
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function search(query) {
  state.query = query;
  state.page = 1;
  applyFilters();
  render();
}

/* ============ Eventos ============ */
function bindEvents() {
  dom.form.addEventListener('submit', (e) => { e.preventDefault(); search(dom.input.value); });
  dom.sort.addEventListener('change', () => { state.order = dom.sort.value; state.page = 1; applyFilters(); render(); });
  [['gender', dom.gender], ['publisher', dom.publisher], ['alignment', dom.alignment]].forEach(([key, select]) =>
    select.addEventListener('change', () => { state[key] = select.value; state.page = 1; applyFilters(); render(); }));
  dom.first.addEventListener('click', () => goToPage(1));
  dom.prev.addEventListener('click', () => goToPage(state.page - 1));
  dom.next.addEventListener('click', () => goToPage(state.page + 1));
  dom.last.addEventListener('click', () => goToPage(totalPages()));
  dom.pageSelect.addEventListener('change', () => goToPage(Number(dom.pageSelect.value)));
  dom.theme.addEventListener('click', () =>
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

  dom.grid.addEventListener('click', (e) => {
    const button = e.target.closest('[data-id]');
    if (button) openDetail(button.dataset.id);
  });
  dom.detail.addEventListener('click', (e) => {
    if (e.target === dom.detail || e.target.closest('[data-close]')) dom.detail.close();
  });
}

/* ============ Inicio ============ */
async function init() {
  initTheme();
  restoreState();
  bindEvents();
  dom.info.textContent = 'Cargando héroes…';
  try {
    state.all = await loadHeroes();
    populatePublishers();
    applyFilters();
    render();
  } catch (error) {
    dom.info.textContent = '';
    dom.grid.innerHTML = `<p class="empty">No se pudieron cargar los héroes (${escapeHTML(error.message)}). Revisa tu conexión y recarga la página.</p>`;
  }
}

init();
