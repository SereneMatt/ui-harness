import { defaultViewports, normalizeUrl, parseViewport, viewportKey, type Viewport, type WorkspaceSettings } from './settings.js';

interface WorkspaceResponse {
  settings: WorkspaceSettings;
  catalog: { source: string; revision: string; viewports: Viewport[] };
  token: string;
  configPath: string;
  proxyOrigin: string | null;
}

function $<T extends HTMLElement = HTMLElement>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing workspace element: ${selector}`);
  return element;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
const message = (text: string, error = false) => {
  $('#message').textContent = text;
  $('#message').classList.toggle('error', error);
};

try {
  const response = await fetch('api/workspace');
  if (!response.ok) throw new Error('Could not load this workspace. Restart the CLI and refresh.');
  const { settings, catalog, token, configPath, proxyOrigin } = await response.json() as WorkspaceResponse;
  // Same-origin mode: load target URLs through this origin so previews share it with the workspace.
  const previewUrl = (url: string) => {
    const parsed = new URL(url);
    return proxyOrigin && parsed.origin === proxyOrigin ? `${location.origin}${parsed.pathname}${parsed.search}${parsed.hash}` : url;
  };
  const state = structuredClone(settings);
  let savedSnapshot = JSON.stringify(settings);
  const cards = new Map<string, HTMLElement>();
  const available = new Map<string, Viewport>([...catalog.viewports, ...defaultViewports, ...state.viewports].map(size => [viewportKey(size), size]));
  const catalogKeys = new Set(catalog.viewports.map(viewportKey));
  $<HTMLInputElement>('#target-url').value = state.url;
  $<HTMLSelectElement>('#scale').value = String(state.scale);
  if (!$<HTMLSelectElement>('#scale').value) {
    $<HTMLSelectElement>('#scale').add(new Option(`${Math.round(Number(state.scale) * 100)}%`, String(state.scale)));
    $<HTMLSelectElement>('#scale').value = String(state.scale);
  }
  $<HTMLAnchorElement>('#catalog-source').href = catalog.source;
  $('#catalog-info').textContent = `${catalog.viewports.length} unique sizes · ${catalog.revision.slice(0, 7)}`;
  $<HTMLButtonElement>('#save').title = `Save to ${configPath}`;
  $('#workspace-origin').textContent = proxyOrigin
    ? `Workspace origin: ${location.origin} · same-origin previews of ${proxyOrigin}` : `Workspace origin: ${location.origin}`;

  function changed() {
    $('#save-state').textContent = JSON.stringify(state) === savedSnapshot ? 'Settings unchanged' : 'Unsaved changes';
  }

  function resizeCard(card: HTMLElement, size: Viewport) {
    const scale = state.scale === 'fit' ? Math.min(1, card.clientWidth / size.width) : state.scale;
    $<HTMLIFrameElement>('iframe', card).style.transform = `scale(${scale})`;
    $('.frame-space', card).style.height = `${size.height * scale}px`;
    $('.preview-meta', card).textContent = `${Math.round(scale * 100)}% display · CSS pixels`;
  }

  const resizeObserver = new ResizeObserver(entries => {
    for (const { target } of entries) {
      if (!(target instanceof HTMLElement)) continue;
      const size = available.get(target.dataset.viewport ?? '');
      if (size) resizeCard(target, size);
    }
  });

  function layout() {
    $('#previews').classList.toggle('fixed-scale', state.scale !== 'fit');
    for (const [key, card] of cards) {
      const size = available.get(key);
      if (!size) throw new Error(`Missing viewport: ${key}`);
      card.style.flex = state.scale === 'fit' ? '' : `0 0 ${size.width * state.scale + 2}px`;
      resizeCard(card, size);
    }
  }

  function selectSize(size: Viewport, selected: boolean) {
    const key = viewportKey(size);
    if (selected) {
      if (state.viewports.some(item => viewportKey(item) === key)) return;
      if (state.viewports.length >= 128) return message('Select at most 128 viewports.', true);
      state.viewports.push(size);
    } else {
      if (state.viewports.length === 1) return message('Keep at least one viewport open.', true);
      state.viewports = state.viewports.filter(item => viewportKey(item) !== key);
    }
    message('');
    renderPreviews();
    renderCatalog();
    changed();
  }

  function renderPreviews() {
    const selected = new Set(state.viewports.map(viewportKey));
    for (const [key, card] of cards) {
      if (selected.has(key)) continue;
      resizeObserver.unobserve(card);
      card.remove();
      cards.delete(key);
    }
    for (const size of state.viewports) {
      const key = viewportKey(size);
      if (cards.has(key)) continue;
      const card = $<HTMLElement>('.preview-card', $<HTMLTemplateElement>('#preview-template').content).cloneNode(true) as HTMLElement;
      card.dataset.viewport = key;
      $('h2', card).textContent = `${size.width} × ${size.height}`;
      const frame = $<HTMLIFrameElement>('iframe', card);
      frame.title = `Preview ${size.width} × ${size.height}`;
      frame.style.width = `${size.width}px`;
      frame.style.height = `${size.height}px`;
      frame.src = previewUrl(state.url);
      const remove = $<HTMLButtonElement>('.remove', card);
      remove.setAttribute('aria-label', `Remove ${size.width} × ${size.height}`);
      remove.addEventListener('click', () => selectSize(size, false));
      cards.set(key, card);
      $('#previews').append(card);
      resizeObserver.observe(card);
    }
    for (const card of cards.values()) $<HTMLButtonElement>('.remove', card).disabled = cards.size === 1;
    $('#selected-count').textContent = String(state.viewports.length);
    $('#preview-summary').textContent = `${state.viewports.length} live previews · scroll and navigate independently`;
    layout();
  }

  function renderCatalog() {
    const filter = $<HTMLInputElement>('#search').value.toLowerCase().replaceAll('×', 'x').replaceAll(/\s/g, '');
    const selected = new Set(state.viewports.map(viewportKey));
    const fragment = document.createDocumentFragment();
    const sizes = [...available.values()].sort((a, b) => Number(selected.has(viewportKey(b))) - Number(selected.has(viewportKey(a))) || a.width - b.width || a.height - b.height);
    for (const size of sizes) {
      const key = viewportKey(size);
      if (!key.includes(filter)) continue;
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selected.has(key);
      checkbox.disabled = checkbox.checked && selected.size === 1;
      checkbox.dataset.size = key;
      checkbox.addEventListener('change', () => {
        selectSize(size, checkbox.checked);
        document.querySelector<HTMLInputElement>(`input[data-size="${key}"]`)?.focus();
      });
      const text = document.createElement('span');
      text.textContent = `${size.width} × ${size.height}`;
      label.append(checkbox, text);
      if (!catalogKeys.has(key)) {
        const badge = document.createElement('small');
        badge.textContent = defaultViewports.some(item => viewportKey(item) === key) ? 'STARTER' : 'CUSTOM';
        label.append(badge);
      }
      fragment.append(label);
    }
    $('#catalog').replaceChildren(fragment);
  }

  function resetFrames() {
    for (const card of cards.values()) $<HTMLIFrameElement>('iframe', card).src = previewUrl(state.url);
    $<HTMLAnchorElement>('#open-directly').href = state.url;
  }

  $('#navigate').addEventListener('submit', event => {
    event.preventDefault();
    try {
      state.url = normalizeUrl($<HTMLInputElement>('#target-url').value);
      $<HTMLInputElement>('#target-url').value = state.url;
      resetFrames();
      changed();
      message('Opened the project URL in all previews.');
    } catch (error) { message(errorMessage(error), true); }
  });
  $('#reload').addEventListener('click', () => {
    resetFrames();
    message('All previews returned to the project URL.');
  });
  $<HTMLSelectElement>('#scale').addEventListener('change', () => {
    state.scale = $<HTMLSelectElement>('#scale').value === 'fit' ? 'fit' : Number($<HTMLSelectElement>('#scale').value);
    layout();
    changed();
  });
  $<HTMLInputElement>('#search').addEventListener('input', renderCatalog);
  $<HTMLFormElement>('#custom').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const form = new FormData($<HTMLFormElement>('#custom'));
      const size = parseViewport({ width: Number(form.get('width')), height: Number(form.get('height')) });
      available.set(viewportKey(size), size);
      selectSize(size, true);
      $<HTMLInputElement>('#search').value = '';
      renderCatalog();
    } catch (error) { message(errorMessage(error), true); }
  });
  $('#defaults').addEventListener('click', () => {
    state.viewports = structuredClone(defaultViewports);
    renderPreviews();
    renderCatalog();
    changed();
    message('Restored the four starting sizes. Existing previews kept their page state.');
  });
  $<HTMLButtonElement>('#save').addEventListener('click', async () => {
    $<HTMLButtonElement>('#save').disabled = true;
    const snapshot = JSON.stringify(state);
    try {
      const response = await fetch('api/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Harness-Token': token }, body: snapshot,
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Could not save workspace settings.');
      savedSnapshot = snapshot;
      changed();
      message(`Settings saved to ${configPath}`);
    } catch (error) { message(`Could not save: ${errorMessage(error)}`, true); }
    finally { $<HTMLButtonElement>('#save').disabled = false; }
  });
  $<HTMLAnchorElement>('#open-directly').href = state.url;
  renderPreviews();
  renderCatalog();
} catch (error) { message(errorMessage(error), true); }
