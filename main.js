/*!
MIT License

Copyright (c) 2026 Mathis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
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
};

const geometricProperties = {
  dotSize: 'dot-size',
  dotOffset: 'dot-offset',
  iconSize: 'icon-size',
  fontSize: 'font-size',
  width: 'width',
  padding: 'padding',
  radius: 'radius',
};

const viewportEdge = 8;
const triggerGap = 4;

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
      { type: 'group', heading: label('Reset', 'Réinitialisation'), items: [
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

function getViewportBounds(win, doc) {
  const vv = win.visualViewport;
  const docWidth = doc.documentElement?.clientWidth;
  const docHeight = doc.documentElement?.clientHeight;
  return {
    left: vv ? vv.offsetLeft : 0,
    top: vv ? vv.offsetTop : 0,
    width: vv ? vv.width : (docWidth || win.innerWidth),
    height: vv ? vv.height : (docHeight || win.innerHeight),
  };
}

function getClipRect(element, doc, win) {
  let left = -Infinity;
  let top = -Infinity;
  let right = Infinity;
  let bottom = Infinity;
  const clipping = /^(auto|scroll|hidden|clip)$/;
  let current = element.parentElement;
  while (current && current !== doc.body && current !== doc.documentElement) {
    const style = win.getComputedStyle(current);
    const clipX = clipping.test(style.overflowX);
    const clipY = clipping.test(style.overflowY);
    if (clipX || clipY) {
      const rect = current.getBoundingClientRect();
      if (clipX) {
        left = Math.max(left, rect.left);
        right = Math.min(right, rect.right);
      }
      if (clipY) {
        top = Math.max(top, rect.top);
        bottom = Math.min(bottom, rect.bottom);
      }
    }
    current = current.parentElement;
  }
  if (left === -Infinity && top === -Infinity && right === Infinity && bottom === Infinity) return null;
  return { left, top, right, bottom };
}

function toPlainRect(rect) {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function selectAnchorRect(marker, point = null, preferredIndex = null) {
  const rects = typeof marker.getClientRects === 'function' ? [...marker.getClientRects()].filter((r) => r.width > 0 && r.height > 0) : [];
  if (!rects.length) return { rect: toPlainRect(marker.getBoundingClientRect()), index: null };
  if (rects.length === 1) return { rect: toPlainRect(rects[0]), index: 0 };
  if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
    const hitIndex = rects.findIndex((r) =>
      point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom);
    if (hitIndex !== -1) return { rect: toPlainRect(rects[hitIndex]), index: hitIndex };
    let bestIndex = 0;
    let bestDist = Infinity;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const dx = point.x < r.left ? r.left - point.x : point.x > r.right ? point.x - r.right : 0;
      const dy = point.y < r.top ? r.top - point.y : point.y > r.bottom ? point.y - r.bottom : 0;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
      }
    }
    return { rect: toPlainRect(rects[bestIndex]), index: bestIndex };
  }
  const index = preferredIndex !== null && preferredIndex < rects.length ? preferredIndex : 0;
  return { rect: toPlainRect(rects[index]), index };
}

function planTooltipConstraints({ anchorRect, naturalHeight, viewport, clipRect = null, maxWidth, edge = 8, gap = 4 }) {
  if (!anchorRect || anchorRect.width <= 0 || anchorRect.height <= 0 || viewport.width <= 0 || viewport.height <= 0) {
    return { visible: false, up: true, availableHeight: 0, maxWidth };
  }
  const vpRight = viewport.left + viewport.width;
  const vpBottom = viewport.top + viewport.height;
  const visLeft = clipRect ? Math.max(viewport.left, clipRect.left) : viewport.left;
  const visRight = clipRect ? Math.min(vpRight, clipRect.right) : vpRight;
  const visTop = clipRect ? Math.max(viewport.top, clipRect.top) : viewport.top;
  const visBottom = clipRect ? Math.min(vpBottom, clipRect.bottom) : vpBottom;

  if (anchorRect.bottom <= visTop + 1 || anchorRect.top >= visBottom - 1 ||
      anchorRect.right <= visLeft + 1 || anchorRect.left >= visRight - 1) {
    return { visible: false, up: true, availableHeight: 0, maxWidth };
  }

  const spaceAbove = Math.max(0, anchorRect.top - gap - (viewport.top + edge));
  const spaceBelow = Math.max(0, (vpBottom - edge) - (anchorRect.bottom + gap));
  const up = naturalHeight <= spaceAbove || spaceAbove >= spaceBelow;
  return {
    visible: true,
    up,
    availableHeight: Math.max(0, up ? spaceAbove : spaceBelow),
    maxWidth,
  };
}

function resolveTooltipPosition({ anchorRect, boxWidth, boxHeight, up, viewport, edge = 8, gap = 4 }) {
  const minLeft = viewport.left + edge;
  const maxLeft = Math.max(minLeft, viewport.left + viewport.width - boxWidth - edge);
  const centeredLeft = anchorRect.left + (anchorRect.width - boxWidth) / 2;
  const left = Math.max(minLeft, Math.min(centeredLeft, maxLeft));

  const minTop = viewport.top + edge;
  const maxTop = Math.max(minTop, viewport.top + viewport.height - boxHeight - edge);
  const rawTop = up ? anchorRect.top - gap - boxHeight : anchorRect.bottom + gap;
  const top = Math.max(minTop, Math.min(rawTop, maxTop));
  return { left, top };
}

function isPointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function isPointInSafeGap({ x, y, up, anchorRect, boxRect, origin, target }) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !anchorRect || !boxRect) return false;
  if (up) {
    if (y < boxRect.bottom - 1 || y >= anchorRect.top) return false;
  } else {
    if (y <= anchorRect.bottom || y > boxRect.top + 1) return false;
  }
  if (target === 'marker') {
    return x >= anchorRect.left && x <= anchorRect.right;
  }
  const ox = origin && Number.isFinite(origin.x) ? origin.x : (anchorRect.left + anchorRect.right) / 2;
  const rawOy = origin && Number.isFinite(origin.y) ? origin.y : (up ? anchorRect.top + 2 : anchorRect.bottom - 2);
  const oy = up ? Math.max(rawOy, anchorRect.top + 2) : Math.min(rawOy, anchorRect.bottom - 2);
  const facingY = up ? boxRect.bottom : boxRect.top;
  return isPointInTriangle(x, y, ox, oy, boxRect.left, facingY, boxRect.right, facingY);
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
    body.style.removeProperty('--tc-margin');
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
    doc.body.style.removeProperty('--tc-margin');
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
    let lastPointerType = 'mouse';
    anchor.addEventListener('pointerdown', (event) => {
      lastPointerType = event.pointerType || 'mouse';
    }, { capture: true });
    const open = (options) => this.open(anchor, marker(), path, render, options);
    for (const target of [word, icon]) {
      target.addEventListener('pointerenter', (event) => {
        if (event.pointerType !== 'touch' && target === marker()) {
          open({ mode: 'pointer', event });
        }
      });
      target.addEventListener('pointermove', (event) => {
        if (event.pointerType !== 'touch' && target === marker() && this.active?.anchor === anchor) {
          this.active.trackMarkerPointer(event);
        }
      });
    }
    anchor.addEventListener('focus', () => {
      if (anchor.matches(':focus-visible')) open({ mode: 'keyboard' });
    });
    anchor.addEventListener('click', (event) => {
      if (event.detail === 0) {
        open({ mode: 'keyboard' });
      } else if (marker().contains(event.target)) {
        open({ mode: lastPointerType === 'touch' ? 'touch' : 'pointer', event });
      }
    });
    anchor.addEventListener('keydown', (event) => {
      if (!['Enter', ' ', 'ArrowDown', 'Tab'].includes(event.key) || event.shiftKey) return;
      if (event.key === 'Tab' && this.active?.anchor !== anchor) return;
      event.preventDefault();
      event.stopPropagation();
      open({ mode: 'keyboard' });
      if (!this.active?.ready) return;
      const { box, ready } = this.active;
      void ready.then(() => {
        if (this.active?.box === box) (box.querySelector('a[href]') || box).focus({ preventScroll: true });
      });
    });
    return anchor;
  }

  open(anchor, marker, path, render, options = {}) {
    const mode = options.mode || 'pointer';
    if (this.active?.anchor === anchor) {
      if (mode === 'keyboard') this.active.setMode('keyboard');
      else if (mode === 'touch') this.active.setMode('touch');
      if (options.event) this.active.trackMarkerPointer(options.event);
      return;
    }
    this.close();
    const doc = anchor.ownerDocument;
    const win = doc.defaultView || window;
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

    let keyboardActive = mode === 'keyboard';
    let touchActive = mode === 'touch';
    let pressed = false;
    let lastPointer = options.event && Number.isFinite(options.event.clientX)
      ? { x: options.event.clientX, y: options.event.clientY } : null;
    let lastTriggerPoint = lastPointer;
    let lastArea = mode === 'pointer' ? 'marker' : null;
    let exitOrigin = null;
    let preferredRectIndex = null;
    let placement = null;

    const inside = (node) => Boolean(node && (anchor.contains(node) || zone.contains(node)));
    const currentAnchorRect = () => {
      const { rect, index } = selectAnchorRect(marker, lastTriggerPoint, preferredRectIndex);
      preferredRectIndex = index;
      return rect;
    };

    const position = () => {
      if (!anchor.isConnected) {
        this.close();
        return;
      }
      const viewport = getViewportBounds(win, doc);
      const clipRect = getClipRect(anchor, doc, win);
      const anchorRect = currentAnchorRect();
      const maxWidth = Math.max(0, Math.min(this.settings.width, viewport.width - viewportEdge * 2));
      zone.style.setProperty('--tc-max-width', `${maxWidth}px`);

      const prevScrollTop = box.scrollTop;
      box.style.removeProperty('--tc-available-height');
      const naturalHeight = Math.ceil(box.getBoundingClientRect().height);

      const plan = planTooltipConstraints({
        anchorRect,
        naturalHeight,
        viewport,
        clipRect,
        maxWidth,
        edge: viewportEdge,
        gap: triggerGap,
      });
      if (!plan.visible) {
        this.close();
        return;
      }

      box.style.setProperty('--tc-available-height', `${plan.availableHeight}px`);
      box.scrollTop = prevScrollTop;

      const boxRect = zone.getBoundingClientRect();
      const { left, top } = resolveTooltipPosition({
        anchorRect,
        boxWidth: boxRect.width,
        boxHeight: boxRect.height,
        up: plan.up,
        viewport,
        edge: viewportEdge,
        gap: triggerGap,
      });
      zone.style.setProperty('--tc-left', `${left}px`);
      zone.style.setProperty('--tc-top', `${top}px`);

      placement = {
        up: plan.up,
        anchorRect,
        boxRect: {
          left,
          top,
          right: left + boxRect.width,
          bottom: top + boxRect.height,
          width: boxRect.width,
          height: boxRect.height,
        },
      };
    };

    const trackMarkerPointer = (event) => {
      if (!Number.isFinite(event.clientX)) return;
      const point = { x: event.clientX, y: event.clientY };
      lastPointer = point;
      lastTriggerPoint = point;
      lastArea = 'marker';
      exitOrigin = null;
      const { index } = selectAnchorRect(marker, point, null);
      if (index !== null && index !== preferredRectIndex) {
        preferredRectIndex = index;
        position();
      }
    };

    const canBridgeGap = (x, y, target) => {
      if (!placement) return false;
      return isPointInSafeGap({
        x,
        y,
        up: placement.up,
        anchorRect: placement.anchorRect,
        boxRect: placement.boxRect,
        origin: exitOrigin,
        target,
      });
    };

    const resize = new win.ResizeObserver(position);
    const detach = new win.MutationObserver(() => {
      if (!anchor.isConnected) this.close();
    });
    this.active = {
      anchor,
      box,
      setMode: (nextMode) => {
        keyboardActive = nextMode === 'keyboard';
        touchActive = nextMode === 'touch';
      },
      trackMarkerPointer,
      dispose: () => {
        listeners.abort();
        resize.disconnect();
        detach.disconnect();
        component.unload();
        zone.remove();
        anchor.setAttribute('aria-expanded', 'false');
        anchor.removeAttribute('aria-controls');
      },
    };

    marker.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'touch') return;
      trackMarkerPointer(event);
    }, { signal });
    marker.addEventListener('pointerleave', (event) => {
      if (event.pointerType === 'touch' || keyboardActive || touchActive || pressed) return;
      if (inside(event.relatedTarget)) return;
      exitOrigin = lastTriggerPoint || { x: event.clientX, y: event.clientY };
      if (!canBridgeGap(event.clientX, event.clientY, 'box')) this.close();
    }, { signal });

    zone.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'touch') return;
      lastPointer = { x: event.clientX, y: event.clientY };
      lastArea = 'box';
      exitOrigin = null;
    }, { signal });
    zone.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      lastPointer = { x: event.clientX, y: event.clientY };
      lastArea = 'box';
      exitOrigin = null;
    }, { signal });
    zone.addEventListener('pointerleave', (event) => {
      if (event.pointerType === 'touch' || keyboardActive || touchActive || pressed) return;
      if (inside(event.relatedTarget)) return;
      if (!canBridgeGap(event.clientX, event.clientY, 'marker')) this.close();
    }, { signal });

    doc.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      lastPointer = { x: event.clientX, y: event.clientY };
      if (pressed && event.buttons === 0) pressed = false;
      if (keyboardActive || touchActive || pressed) return;
      if (marker.contains(event.target)) {
        trackMarkerPointer(event);
        return;
      }
      if (zone.contains(event.target)) {
        lastArea = 'box';
        exitOrigin = null;
        return;
      }
      if (lastArea === 'marker') {
        if (!exitOrigin) exitOrigin = lastTriggerPoint || lastPointer;
        if (canBridgeGap(event.clientX, event.clientY, 'box')) return;
      } else if (lastArea === 'box') {
        if (canBridgeGap(event.clientX, event.clientY, 'marker')) return;
      }
      this.close();
    }, { capture: true, passive: true, signal });

    doc.documentElement.addEventListener('pointerleave', (event) => {
      if (event.pointerType !== 'touch' && !keyboardActive && !touchActive && !pressed) this.close();
    }, { signal });

    anchor.addEventListener('focusout', (event) => {
      if (keyboardActive && !inside(event.relatedTarget)) this.close();
    }, { signal });
    zone.addEventListener('focusout', (event) => {
      if (keyboardActive && !inside(event.relatedTarget)) this.close();
    }, { signal });
    doc.addEventListener('pointerdown', (event) => {
      if (!inside(event.target)) {
        this.close();
        return;
      }
      if (event.pointerType !== 'touch') {
        keyboardActive = false;
        touchActive = false;
      }
      pressed = zone.contains(event.target);
    }, { capture: true, signal });
    const release = (event) => {
      if (!pressed) return;
      pressed = false;
      if (keyboardActive || touchActive) return;
      const under = Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
        ? doc.elementFromPoint(event.clientX, event.clientY)
        : event.target;
      if (!inside(under)) this.close();
    };
    doc.addEventListener('pointerup', release, { signal });
    doc.addEventListener('pointercancel', release, { signal });
    win.addEventListener('dragend', release, { signal });
    doc.addEventListener('focusin', (event) => {
      if (keyboardActive && !inside(event.target)) this.close();
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
      if (!inside(event.target)) {
        position();
        if (this.active && !keyboardActive && !touchActive && !pressed && lastPointer) {
          const under = doc.elementFromPoint(lastPointer.x, lastPointer.y);
          if (!inside(under)) this.close();
        }
      }
    }, { capture: true, passive: true, signal });
    win.addEventListener('resize', position, { signal });
    win.visualViewport?.addEventListener('resize', position, { signal });
    win.visualViewport?.addEventListener('scroll', position, { signal });
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
