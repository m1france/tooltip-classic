const { Plugin, Component, MarkdownRenderer, MarkdownRenderChild, MarkdownView, PluginSettingTab,
  getLanguage, setIcon, editorInfoField, editorLivePreviewField } = require('obsidian');
const { Decoration, ViewPlugin, WidgetType } = require('@codemirror/view');
const { syntaxTree } = require('@codemirror/language');

const triggerClass = 'tooltip-classic-trigger';
const zoneClass = 'tooltip-classic-zone';
const blockSelector = 'p,li,h1,h2,h3,h4,h5,h6,td,th,dt,dd';
const atomSelector = 'a,code,img,svg,math,.math,.internal-embed';
const skipSelector = 'pre,script,style,.tooltip-classic-zone,.tooltip-classic-trigger';
const placeholder = '\ufffc';

const prefixStyles = Object.freeze({ d: 'dotted', t: 'info', b: 'bubble', h: 'highlight' });

const choices = {
  triggerStyle: Object.values(prefixStyles),
  iconPosition: ['upper', 'middle'],
};

const colorProperties = {
  wordColor: 'word-color',
  dotColor: 'dot-color',
  iconColor: 'icon-color',
  highlightColor: 'highlight-color',
  panelText: 'panel-text',
  panelBackground: 'panel-background',
  panelBorder: 'panel-border',
  linkColor: 'link-color',
};

const dimensions = {
  dotSize: [1, 4, 2],
  dotOffset: [1, 8, 4],
  iconSize: [10, 20, 13],
  fontSize: [11, 22, 13],
  width: [160, 620, 320],
  padding: [4, 24, 10],
  radius: [0, 24, 8],
  margin: [0, 12, 6],
  delay: [100, 500, 200],
};

const geometricProperties = {
  dotSize: 'dot-size',
  dotOffset: 'dot-offset',
  iconSize: 'icon-size',
  fontSize: 'font-size',
  width: 'width',
  padding: 'padding',
  radius: 'radius',
  margin: 'margin',
};

function normalizeSettings(data) {
  const clean = {};
  for (const [key, allowed] of Object.entries(choices)) {
    clean[key] = allowed.includes(data?.[key]) ? data[key] : allowed[0];
  }
  for (const key of Object.keys(colorProperties)) {
    const value = typeof data?.[key] === 'string' ? data[key].trim() : '';
    clean[key] = /^#[a-f\d]{6}$/i.test(value) ? value : '';
  }
  for (const [key, [min, max, fallback]] of Object.entries(dimensions)) {
    const value = data?.[key];
    clean[key] = Number.isInteger(value) && value >= min && value <= max ? value : fallback;
  }
  clean.shadow = typeof data?.shadow === 'boolean' ? data.shadow : true;
  return clean;
}

class TooltipSettings extends PluginSettingTab {
  constructor(plugin) {
    super(plugin.app, plugin);
    this.owner = plugin;
  }

  getControlValue(key) {
    return this.owner.settings[key];
  }

  setControlValue(key, value) {
    return this.owner.applySettings({ ...this.owner.settings, [key]: value });
  }

  getSettingDefinitions() {
    const fr = getLanguage() === 'fr';
    const label = (english, french) => fr ? french : english;
    const row = (name, control, desc) => ({ name, control, desc });
    const color = (key, name, desc = label('Hex color. Leave blank to follow the theme.',
      'Couleur hexadécimale. Laisse vide pour suivre le thème.')) => row(name, {
      type: 'text', key, placeholder: label('Theme', 'Thème'),
      validate: (value) => !value.trim() || /^#[a-f\d]{6}$/i.test(value.trim())
        ? undefined : label('Enter a color like #4080A0 or leave blank.', 'Saisis une couleur comme #4080A0 ou laisse le champ vide.'),
    }, desc);
    const size = (key, name, unit = 'px', desc) => {
      const [min, max, defaultValue] = dimensions[key];
      return row(name, { type: 'slider', key, min, max, defaultValue, step: unit === 'ms' ? 10 : 1,
        displayFormat: (value) => `${value} ${unit}` }, desc);
    };

    return [
      { type: 'group', heading: label('Trigger', 'Déclencheur'), items: [
        row(label('Default trigger style', 'Style du déclencheur par défaut'), {
          type: 'dropdown', key: 'triggerStyle', options: {
            dotted: label('Dotted underline', 'Soulignement pointillé'),
            info: label('Info icon', 'Icône info (i)'),
            bubble: label('Speech-bubble icon', 'Icône de bulle'),
            highlight: label('Highlight', 'Surlignage'),
          },
        }, label('Use d/, t/, b/, or h/ before the word to choose a style for a single tooltip.',
          'Ajoute d/, t/, b/ ou h/ avant le mot pour choisir le style d’une seule infobulle.')),
        color('wordColor', label('Word color', 'Couleur du mot')),
        color('highlightColor', label('Highlight color', 'Couleur du surlignage')),
        color('dotColor', label('Dot color', 'Couleur des pointillés')),
        size('dotSize', label('Dot thickness', 'Épaisseur des pointillés')),
        size('dotOffset', label('Underline offset', 'Distance des pointillés')),
        row(label('Icon position', 'Position de l’icône'), { type: 'dropdown', key: 'iconPosition',
          options: { upper: label('Upper right', 'En haut à droite'), middle: label('Centered vertically on the right', 'Centrée verticalement à droite') } }),
        color('iconColor', label('Icon color', 'Couleur de l’icône')),
        size('iconSize', label('Icon size', 'Taille de l’icône')),
      ] },
      { type: 'group', heading: label('Tooltip appearance', 'Apparence de la bulle'), items: [
        color('panelText', label('Text color', 'Couleur du texte')),
        color('panelBackground', label('Background color', 'Couleur du fond')),
        color('panelBorder', label('Border color', 'Couleur de la bordure')),
        color('linkColor', label('Link color', 'Couleur des liens'),
          label('Hex color. Leave blank to use the tooltip text color or the theme.',
            'Couleur hexadécimale. Laisse vide pour reprendre la couleur du texte ou celle du thème.')),
        size('fontSize', label('Font size', 'Taille du texte')),
        size('width', label('Maximum width', 'Largeur maximale')),
        size('padding', label('Inner padding', 'Marge intérieure')),
        size('radius', label('Corner radius', 'Arrondi des coins')),
        row(label('Shadow', 'Ombre'), { type: 'toggle', key: 'shadow' }),
      ] },
      { type: 'group', heading: label('Hover behavior', 'Survol'), items: [
        size('margin', label('Pointer margin', 'Marge de survol'), 'px',
          label('Invisible area around the tooltip that keeps it open.', 'Zone invisible autour de la bulle qui la maintient ouverte.')),
        size('delay', label('Dismissal delay', 'Délai de fermeture'), 'ms'),
        { name: label('Restore defaults', 'Rétablir les valeurs par défaut'), render: (setting) => {
          setting.addButton((button) => button.setButtonText(label('Restore', 'Rétablir')).onClick(async () => {
            await this.owner.applySettings({});
            this.update();
          }));
        } },
      ] },
    ];
  }
}

function maskInline(text) {
  return text.replace(/\\[^\n]|(`+)([^\n]*?)\1(?!`)|\[\[[^\n]*?\]\]|\[[^\[\]\n]*\]\((?:[^()\n]|\([^()\n]*\))*\)|&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);/gi,
    (match) => placeholder.repeat(match.length));
}

function* annotations(text) {
  for (const match of text.matchAll(/\{(?:([dtbh])\/)?([^{}\/\n]+)\/([^{}\n]+)\}/g)) {
    const [raw, prefix, label, description] = match;
    if (!label.trim() || !description.trim() || label.includes(placeholder)) continue;
    const start = match.index;
    const labelStart = start + (prefix ? 3 : 1);
    yield { start, labelStart, slash: labelStart + label.length, end: start + raw.length, style: prefixStyles[prefix] };
  }
}

function descriptionMarkdown(text) {
  let start = 0;
  const lines = [];
  for (const separator of maskInline(text).matchAll(/&/g)) {
    lines.push(text.slice(start, separator.index).trim());
    start = separator.index + 1;
  }
  lines.push(text.slice(start).trim());
  return lines.join('<br>');
}

function splitRenderedLines(fragment) {
  const doc = fragment.ownerDocument;
  const walker = doc.createTreeWalker(fragment, 4, {
    acceptNode: (node) => node.parentElement?.closest(atomSelector) ? 2 : 1,
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (!node.data.includes('&')) continue;
    const parts = node.data.split(/\s*&\s*/);
    const replacement = doc.createDocumentFragment();
    parts.forEach((part, index) => {
      if (index) replacement.append(doc.createElement('br'));
      replacement.append(part);
    });
    node.replaceWith(replacement);
  }
}

function decorateReading(root, plugin, context) {
  if (!root.textContent.includes('{') || root.closest(skipSelector)) return;
  const doc = root.ownerDocument;
  const containers = [...root.querySelectorAll(blockSelector)];
  if (root.matches(blockSelector)) containers.unshift(root);
  if (!containers.length) containers.push(root);

  for (const container of containers) {
    if (container.closest(skipSelector)) continue;
    let text = '';
    const runs = [];
    const walk = (node) => {
      if (node.nodeType === 3) {
        runs.push({ start: text.length, node });
        text += node.data;
      } else if (node.nodeType === 1) {
        if (node.matches(`${blockSelector},${skipSelector},br`)) text += '\n';
        else if (node.matches(atomSelector)) text += placeholder;
        else node.childNodes.forEach(walk);
      }
    };
    container.childNodes.forEach(walk);
    const matches = [...annotations(text)];
    if (!matches.length) continue;
    const boundary = (index) => {
      const run = runs.find((item) => item.start <= index && index < item.start + item.node.length);
      return [run.node, index - run.start];
    };
    const child = new MarkdownRenderChild(container);
    context.addChild(child);
    for (const { start, labelStart, slash, end, style } of matches.reverse()) {
      const descriptionRange = doc.createRange();
      const [slashNode, slashOffset] = boundary(slash);
      descriptionRange.setStart(slashNode, slashOffset + 1);
      descriptionRange.setEnd(...boundary(end - 1));
      const description = descriptionRange.cloneContents();
      splitRenderedLines(description);

      const rawRange = doc.createRange();
      rawRange.setStart(...boundary(start));
      const [endNode, endOffset] = boundary(end - 1);
      rawRange.setEnd(endNode, endOffset + 1);
      const original = rawRange.cloneContents();
      const trigger = plugin.makeTrigger(doc, text.slice(labelStart, slash).trim(), context.sourcePath, style,
        (box) => box.append(description.cloneNode(true)));
      rawRange.deleteContents();
      rawRange.insertNode(trigger);
      child.register(() => {
        if (plugin.active?.anchor === trigger) plugin.close();
        trigger.replaceWith(original);
      });
    }
  }
}

function livePreview(plugin) {
  class TriggerWidget extends WidgetType {
    constructor(label, description, path, style) {
      super();
      this.label = label;
      this.description = description;
      this.path = path;
      this.style = style;
    }

    eq(other) {
      return this.label === other.label && this.description === other.description &&
        this.path === other.path && this.style === other.style;
    }

    toDOM(view) {
      return plugin.makeTrigger(view.dom.ownerDocument, this.label, this.path, this.style,
        (box, component) => MarkdownRenderer.render(plugin.app, descriptionMarkdown(this.description), box, this.path, component));
    }

    destroy(anchor) {
      if (plugin.active?.anchor === anchor) plugin.close();
    }
  }

  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.decorations = this.build(view);
    }

    update(update) {
      const preview = update.state.field(editorLivePreviewField, false);
      const oldPreview = update.startState.field(editorLivePreviewField, false);
      const file = update.state.field(editorInfoField, false)?.file;
      if (update.docChanged || update.viewportChanged || update.selectionSet || preview !== oldPreview ||
        syntaxTree(update.state) !== syntaxTree(update.startState) || file?.path !== this.path) {
        this.decorations = this.build(update.view);
      }
    }

    build(view) {
      const { state } = view;
      this.path = state.field(editorInfoField, false)?.file?.path;
      if (!this.path || !state.field(editorLivePreviewField, false)) return Decoration.none;
      const rules = [];
      const tree = syntaxTree(state);
      let previousLine = 0;
      for (const range of view.visibleRanges) {
        const last = state.doc.lineAt(range.to).number;
        for (let number = Math.max(previousLine + 1, state.doc.lineAt(range.from).number); number <= last; number++) {
          previousLine = number;
          const line = state.doc.line(number);
          if (!line.text.includes('{') || !line.text.includes('/')) continue;
          for (const { start, labelStart, slash, end, style } of annotations(maskInline(line.text))) {
            const from = line.from + start;
            const to = line.from + end;
            if (state.selection.ranges.some((selection) => selection.from <= to && selection.to >= from)) continue;
            const token = tree.resolveInner(from, 1).name;
            if (/code|frontmatter|comment|math|link|url|html/i.test(token)) continue;
            const label = line.text.slice(labelStart, slash).trim();
            const description = line.text.slice(slash + 1, end - 1).trim();
            rules.push(Decoration.replace({ widget: new TriggerWidget(label, description, this.path, style) }).range(from, to));
          }
        }
      }
      return Decoration.set(rules);
    }
  }, { decorations: (view) => view.decorations });
}

module.exports = class TooltipClassic extends Plugin {
  async onload() {
    this.settings = normalizeSettings(await this.loadData());
    this.styledDocuments = new Set();
    this.settingTab = new TooltipSettings(this);
    this.addSettingTab(this.settingTab);
    this.registerMarkdownPostProcessor((element, context) => decorateReading(element, this, context));
    this.registerEditorExtension(livePreview(this));
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.close()));
    this.register(() => {
      this.close();
      for (const doc of this.styledDocuments) this.clearAppearance(doc);
      this.styledDocuments.clear();
      queueMicrotask(() => this.refreshReading());
    });
    this.registerEvent(this.app.workspace.on('window-close', (_window, win) => {
      this.styledDocuments.delete(win.document);
    }));
    this.app.workspace.onLayoutReady(() => this.refreshReading());
  }

  applySettings(data) {
    this.settings = normalizeSettings(data);
    this.close();
    for (const doc of this.styledDocuments) this.applyAppearance(doc);
    const snapshot = this.settings;
    this.pendingSave = (this.pendingSave || Promise.resolve()).catch(() => {}).then(() => this.saveData(snapshot));
    return this.pendingSave;
  }

  async onExternalSettingsChange() {
    this.settings = normalizeSettings(await this.loadData());
    this.close();
    for (const doc of this.styledDocuments) this.applyAppearance(doc);
    this.settingTab.update();
  }

  applyAppearance(doc) {
    const { body } = doc;
    body.dataset.tooltipClassicDefault = this.settings.triggerStyle;
    body.classList.toggle('tooltip-classic-middle', this.settings.iconPosition === 'middle');
    body.classList.toggle('tooltip-classic-flat', !this.settings.shadow);
    for (const [key, property] of Object.entries(colorProperties)) {
      body.style.setProperty(`--tc-${property}`, this.settings[key]);
    }
    for (const [key, property] of Object.entries(geometricProperties)) {
      body.style.setProperty(`--tc-${property}`, `${this.settings[key]}px`);
    }
  }

  clearAppearance(doc) {
    delete doc.body.dataset.tooltipClassicDefault;
    doc.body.classList.remove('tooltip-classic-middle', 'tooltip-classic-flat');
    for (const property of [...Object.values(colorProperties), ...Object.values(geometricProperties)]) {
      doc.body.style.removeProperty(`--tc-${property}`);
    }
  }

  refreshReading() {
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      if (leaf.view instanceof MarkdownView && leaf.view.getMode() === 'preview') leaf.view.previewMode.rerender(true);
    }
  }

  makeTrigger(doc, label, path, style, render) {
    const anchor = doc.createElement('span');
    anchor.className = triggerClass;
    if (style) anchor.dataset.tooltipClassicStyle = style;
    if (!this.styledDocuments.has(doc)) {
      this.styledDocuments.add(doc);
      this.applyAppearance(doc);
    }
    const word = doc.createElement('span');
    word.className = 'tooltip-classic-word';
    word.textContent = label;
    const icon = doc.createElement('span');
    icon.className = 'tooltip-classic-icon';
    icon.setAttribute('aria-hidden', 'true');
    for (const [kind, name] of [['info', 'info'], ['bubble', 'message-circle']]) {
      if (style && style !== kind) continue;
      const graphic = doc.createElement('span');
      graphic.className = `tooltip-classic-glyph-${kind}`;
      setIcon(graphic, name);
      icon.append(graphic);
    }
    anchor.append(word, icon);
    anchor.tabIndex = 0;
    anchor.setAttribute('role', 'button');
    anchor.setAttribute('aria-expanded', 'false');
    const marker = () => {
      const effectiveStyle = style ?? this.settings.triggerStyle;
      return effectiveStyle === 'bubble' || effectiveStyle === 'info' ? icon : word;
    };
    const open = () => this.open(anchor, marker(), path, render);
    for (const target of [word, icon]) {
      target.addEventListener('pointerenter', (event) => {
        if (event.pointerType !== 'touch' && target === marker()) open();
      });
    }
    anchor.addEventListener('focus', () => {
      if (anchor.matches(':focus-visible')) open();
    });
    anchor.addEventListener('click', (event) => {
      if (event.detail === 0 || marker().contains(event.target)) open();
    });
    anchor.addEventListener('keydown', (event) => {
      if (!['Enter', ' ', 'ArrowDown', 'Tab'].includes(event.key) || event.shiftKey) return;
      if (event.key === 'Tab' && this.active?.anchor !== anchor) return;
      event.preventDefault();
      event.stopPropagation();
      open();
      if (!this.active?.ready) return;
      const { box, ready } = this.active;
      void ready.then(() => {
        if (this.active?.box === box) (box.querySelector('a[href]') || box).focus({ preventScroll: true });
      });
    });
    return anchor;
  }

  open(anchor, marker, path, render) {
    if (this.active?.anchor === anchor) return this.active.keep();
    this.close();
    const doc = anchor.ownerDocument;
    const win = doc.defaultView;
    const zone = doc.createElement('div');
    zone.className = zoneClass;
    zone.classList.add('tooltip-classic-positioning');
    const box = doc.createElement('div');
    box.className = 'tooltip-classic-box markdown-rendered';
    box.tabIndex = -1;
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', anchor.textContent);
    box.id = 'tooltip-classic-description';
    zone.append(box);
    doc.body.append(zone);
    anchor.setAttribute('aria-expanded', 'true');
    anchor.setAttribute('aria-controls', box.id);

    const component = new Component();
    component.load();
    const listeners = new win.AbortController();
    const { signal } = listeners;
    let timer;
    let pressed = false;
    const keep = () => window.clearTimeout(timer);
    const schedule = () => {
      keep();
      timer = window.setTimeout(() => {
        if (!pressed && !marker.matches(':hover') && !zone.matches(':hover') &&
            !anchor.contains(doc.activeElement) && !zone.contains(doc.activeElement)) this.close();
      }, this.settings.delay);
    };
    const inside = (node) => node && (anchor.contains(node) || zone.contains(node));
    const position = () => {
      const bounds = marker.getBoundingClientRect();
      const edge = 4;
      const gap = 4;
      const margin = this.settings.margin;
      if (!anchor.isConnected || !bounds.width || bounds.bottom < edge || bounds.top > win.innerHeight - edge) {
        this.close();
        return;
      }
      const above = bounds.top - gap - edge - margin;
      const below = win.innerHeight - bounds.bottom - gap - edge - margin;
      const up = box.scrollHeight <= above || above >= below;
      box.style.setProperty('--tc-available-height', `${Math.max(0, up ? above : below)}px`);
      const left = bounds.left + (bounds.width - zone.offsetWidth) / 2;
      zone.style.setProperty('--tc-left', `${Math.max(edge, Math.min(left, win.innerWidth - zone.offsetWidth - edge))}px`);
      zone.style.setProperty('--tc-top', `${up ? bounds.top - gap + margin - zone.getBoundingClientRect().height : bounds.bottom + gap - margin}px`);
    };
    const resize = new win.ResizeObserver(position);
    const detach = new win.MutationObserver(() => {
      if (!anchor.isConnected) this.close();
    });
    this.active = { anchor, box, keep, dispose: () => {
      listeners.abort();
      resize.disconnect();
      detach.disconnect();
      keep();
      component.unload();
      zone.remove();
      anchor.setAttribute('aria-expanded', 'false');
      anchor.removeAttribute('aria-controls');
    } };

    for (const element of [marker, zone]) {
      element.addEventListener('pointerenter', keep, { signal });
      element.addEventListener('pointerleave', schedule, { signal });
    }
    anchor.addEventListener('focusout', schedule, { signal });
    zone.addEventListener('focusout', schedule, { signal });
    doc.addEventListener('pointerdown', (event) => {
      if (!inside(event.target)) this.close();
      else pressed = zone.contains(event.target);
    }, { capture: true, signal });
    const release = () => {
      pressed = false;
      schedule();
    };
    doc.addEventListener('pointerup', release, { signal });
    doc.addEventListener('pointercancel', release, { signal });
    doc.addEventListener('focusin', (event) => {
      if (!inside(event.target)) schedule();
      else keep();
    }, { signal });
    doc.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (zone.contains(doc.activeElement)) anchor.focus({ preventScroll: true });
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }, { capture: true, signal });
    box.addEventListener('click', (event) => {
      const link = event.target.closest('a.internal-link');
      if (!link) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const destination = link.getAttribute('data-href') || link.getAttribute('href');
      this.close();
      if (destination) void this.app.workspace.openLinkText(destination, path, event.metaKey || event.ctrlKey);
    }, { capture: true, signal });
    doc.addEventListener('scroll', (event) => {
      if (!inside(event.target)) position();
    }, { capture: true, passive: true, signal });
    win.addEventListener('resize', position, { signal });
    win.addEventListener('blur', () => this.close(), { signal });
    resize.observe(marker);
    resize.observe(box);
    detach.observe(doc.body, { childList: true, subtree: true });
    try {
      this.active.ready = Promise.resolve(render(box, component)).then(() => {
        if (signal.aborted) return;
        position();
        zone.classList.remove('tooltip-classic-positioning');
      }).catch((error) => {
        if (!signal.aborted) this.close();
        console.error('Tooltip classic: could not render Markdown', error);
      });
    } catch (error) {
      this.close();
      console.error('Tooltip classic: could not render Markdown', error);
    }
  }

  close() {
    const active = this.active;
    this.active = null;
    active?.dispose();
  }
};
