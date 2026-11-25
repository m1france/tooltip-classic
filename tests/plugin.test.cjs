const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const runtime = readFileSync(require.resolve('../src/main.js'), 'utf8');
const loadRuntime = (extraGlobals = {}) => {
  class StubComponent {
    load() {}
    unload() {}
  }
  const context = {
    module: {},
    console,
    Promise,
    Math,
    Number,
    Object,
    Set,
    Array,
    RegExp,
    Boolean,
    Infinity,
    queueMicrotask,
    require: () => ({
      Plugin: class {
        register() {}
        registerEvent() {}
        registerMarkdownPostProcessor() {}
        registerEditorExtension() {}
        addSettingTab() {}
        async loadData() { return {}; }
        async saveData() {}
      },
      Component: StubComponent,
      PluginSettingTab: class {
        constructor(app, plugin) { this.app = app; this.plugin = plugin; }
        update() {}
      },
      MarkdownView: class {},
      MarkdownRenderer: { render: async () => {} },
      getLanguage: () => 'en',
      setIcon: () => {},
    }),
    ...extraGlobals,
  };
  return runInNewContext(
    runtime + '\n({ TooltipClassic: module.exports, normalizeSettings, annotations, maskInline, descriptionMarkdown, selectAnchorRect, planTooltipConstraints, resolveTooltipPosition, isPointInSafeGap })',
    context,
  );
};

function createFakeDom({ viewport = { width: 1200, height: 800 }, boxMeasure } = {}) {
  class FakeEvent {
    constructor(type, props = {}) {
      this.type = type;
      this.bubbles = Boolean(props.bubbles);
      this.cancelable = true;
      this.defaultPrevented = false;
      this.propagationStopped = false;
      this.immediatePropagationStopped = false;
      Object.assign(this, props);
    }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() { this.propagationStopped = true; }
    stopImmediatePropagation() { this.immediatePropagationStopped = true; this.propagationStopped = true; }
  }

  class FakeClassList {
    constructor(el) { this.el = el; this.set = new Set(); }
    add(...names) { names.forEach((n) => this.set.add(n)); }
    remove(...names) { names.forEach((n) => this.set.delete(n)); }
    toggle(name, force) {
      if (force === undefined) force = !this.set.has(name);
      if (force) this.set.add(name);
      else this.set.delete(name);
      return force;
    }
    contains(name) { return this.set.has(name); }
  }

  class FakeStyle {
    constructor() { this.map = new Map(); }
    setProperty(k, v) {
      if (v === '' || v == null) this.map.delete(k);
      else this.map.set(k, String(v));
    }
    removeProperty(k) { this.map.delete(k); }
    getPropertyValue(k) { return this.map.get(k) || ''; }
  }

  class FakeElement {
    constructor(tagName, ownerDocument) {
      this.tagName = tagName.toUpperCase();
      this.nodeType = 1;
      this.ownerDocument = ownerDocument;
      this.children = [];
      this.parentElement = null;
      this.dataset = {};
      this.attributes = new Map();
      this.style = new FakeStyle();
      this.classList = new FakeClassList(this);
      this.listeners = new Map();
      this._textContent = '';
      this.scrollTop = 0;
      this._rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
      this._clientRects = null;
    }
    set className(val) {
      this.classList.set = new Set(String(val).split(/\s+/).filter(Boolean));
    }
    get className() { return [...this.classList.set].join(' '); }
    set textContent(val) { this._textContent = String(val); }
    get textContent() {
      if (this._textContent) return this._textContent;
      return this.children.map((c) => c.textContent).join('');
    }
    get isConnected() {
      let cur = this;
      while (cur) {
        if (cur === this.ownerDocument.body || cur === this.ownerDocument.documentElement) return true;
        cur = cur.parentElement;
      }
      return false;
    }
    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    removeAttribute(k) { this.attributes.delete(k); }
    getAttribute(k) { return this.attributes.get(k) ?? null; }
    append(...nodes) {
      for (const n of nodes) {
        if (typeof n === 'string') {
          this._textContent += n;
        } else {
          n.parentElement = this;
          this.children.push(n);
        }
      }
    }
    remove() {
      if (!this.parentElement) return;
      const idx = this.parentElement.children.indexOf(this);
      if (idx !== -1) this.parentElement.children.splice(idx, 1);
      this.parentElement = null;
    }
    contains(node) {
      let cur = node;
      while (cur) {
        if (cur === this) return true;
        cur = cur.parentElement;
      }
      return false;
    }
    closest(selector) {
      if (selector === 'a.internal-link') {
        let cur = this;
        while (cur) {
          if (cur.tagName === 'A' && cur.classList.contains('internal-link')) return cur;
          cur = cur.parentElement;
        }
      }
      return null;
    }
    querySelector() { return null; }
    matches(selector) {
      if (selector === ':focus-visible') return Boolean(this._focusVisible);
      return false;
    }
    focus() { this.ownerDocument.activeElement = this; }
    getBoundingClientRect() {
      if (boxMeasure && (this.classList.contains('tooltip-classic-box') || this.classList.contains('tooltip-classic-zone'))) {
        return boxMeasure(this);
      }
      return { ...this._rect };
    }
    getClientRects() {
      if (this._clientRects) return this._clientRects.map((r) => ({ ...r }));
      return [this.getBoundingClientRect()];
    }
    addEventListener(type, fn, opts = {}) {
      const options = typeof opts === 'boolean' ? { capture: opts } : opts;
      if (options.signal?.aborted) return;
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      const entry = { fn, capture: Boolean(options.capture) };
      this.listeners.get(type).push(entry);
      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          const list = this.listeners.get(type);
          if (!list) return;
          const idx = list.indexOf(entry);
          if (idx !== -1) list.splice(idx, 1);
        });
      }
    }
    dispatchEvent(event) {
      event.target ??= this;
      const path = [];
      let cur = this;
      while (cur) {
        path.unshift(cur);
        cur = cur.parentElement;
      }
      for (const el of path) {
        if (event.propagationStopped) break;
        const list = [...(el.listeners.get(event.type) || [])];
        for (const entry of list) {
          if (!entry.capture) continue;
          event.currentTarget = el;
          entry.fn(event);
          if (event.immediatePropagationStopped) break;
        }
      }
      if (!event.propagationStopped) {
        const list = [...(this.listeners.get(event.type) || [])];
        for (const entry of list) {
          if (entry.capture) continue;
          event.currentTarget = this;
          entry.fn(event);
          if (event.immediatePropagationStopped) break;
        }
      }
      if (event.bubbles) {
        for (let i = path.length - 2; i >= 0; i--) {
          if (event.propagationStopped) break;
          const el = path[i];
          const list = [...(el.listeners.get(event.type) || [])];
          for (const entry of list) {
            if (entry.capture) continue;
            event.currentTarget = el;
            entry.fn(event);
            if (event.immediatePropagationStopped) break;
          }
        }
      }
      return !event.defaultPrevented;
    }
  }

  class FakeAbortController {
    constructor() {
      const listeners = [];
      this.signal = {
        aborted: false,
        addEventListener: (type, fn) => { if (type === 'abort') listeners.push(fn); },
      };
      this._listeners = listeners;
    }
    abort() {
      if (this.signal.aborted) return;
      this.signal.aborted = true;
      for (const fn of [...this._listeners]) fn();
    }
  }

  const doc = {
    body: null,
    documentElement: null,
    activeElement: null,
    defaultView: null,
    _pointTarget: null,
    createElement(tag) { return new FakeElement(tag, doc); },
    elementFromPoint() { return doc._pointTarget; },
    addEventListener(type, fn, opts) { doc.documentElement.addEventListener(type, fn, opts); },
    dispatchEvent(event) { return doc.documentElement.dispatchEvent(event); },
  };
  doc.documentElement = new FakeElement('html', doc);
  doc.documentElement.clientWidth = viewport.width;
  doc.documentElement.clientHeight = viewport.height;
  doc.body = new FakeElement('body', doc);
  doc.documentElement.append(doc.body);

  const win = {
    innerWidth: viewport.width,
    innerHeight: viewport.height,
    visualViewport: {
      offsetLeft: 0,
      offsetTop: 0,
      width: viewport.width,
      height: viewport.height,
      addEventListener() {},
    },
    AbortController: FakeAbortController,
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    getComputedStyle: () => ({ overflowX: 'visible', overflowY: 'visible' }),
    addEventListener(type, fn, opts) { doc.documentElement.addEventListener(`win:${type}`, fn, opts); },
    dispatchWindowEvent(type, props) {
      return doc.documentElement.dispatchEvent(new FakeEvent(`win:${type}`, props));
    },
  };
  doc.defaultView = win;
  return { doc, win, FakeEvent };
}

test('settings from disk fall back per field and keep valid choices (without safety margin or delay)', () => {
  const { normalizeSettings } = loadRuntime();
  const config = normalizeSettings({
    triggerStyle: 'bubble', iconPosition: 'middle', wordColor: ' #F0A001 ',
    panelBackground: 'url(https://example.com)', margin: 10, delay: 400, width: 9999, shadow: false,
  });
  assert.equal('margin' in config, false);
  assert.equal('delay' in config, false);
  assert.equal(normalizeSettings(null).width, 320);
  assert.equal(config.triggerStyle, 'bubble');
  assert.equal(config.iconPosition, 'middle');
  assert.equal(config.wordColor, '#F0A001');
  assert.equal(config.panelBackground, '');
  assert.equal(config.width, 320);
  assert.equal(config.shadow, false);
});

test('inline Markdown keeps delimiters within code and links', () => {
  const { annotations, maskInline, descriptionMarkdown } = loadRuntime();
  const source = '{word/`a & {b/c}` & [web](https://example.com/?a=1&b=2) & [[Note|Alias]]}';
  const matches = [...annotations(maskInline(source))];
  assert.equal(matches.length, 1);
  assert.equal(matches[0].end, source.length);
  assert.equal(descriptionMarkdown(source.slice(matches[0].slash + 1, -1)),
    '`a & {b/c}`<br>[web](https://example.com/?a=1&b=2)<br>[[Note|Alias]]');
});

test('per-tooltip style prefixes leave the word and Markdown description intact', () => {
  const { annotations, maskInline } = loadRuntime();
  const sample = '{hello/plain} {d/dots/one} {t/source/[[Note|Link]]} {b/chat/[Web](https://example.com/a/b)} {h/mark/==text==} {d/letter}';
  const matches = [...annotations(maskInline(sample))].map(({ labelStart, slash, end, style }) =>
    [sample.slice(labelStart, slash), sample.slice(slash + 1, end - 1), style]);
  assert.deepEqual(matches, [
    ['hello', 'plain', undefined],
    ['dots', 'one', 'dotted'],
    ['source', '[[Note|Link]]', 'info'],
    ['chat', '[Web](https://example.com/a/b)', 'bubble'],
    ['mark', '==text==', 'highlight'],
    ['d', 'letter', undefined],
  ]);
});

test('long tooltip stays centered over trigger and clamps cleanly on all viewport sizes', () => {
  const { planTooltipConstraints, resolveTooltipPosition } = loadRuntime();

  // Desktop viewport: long tooltip capped at 320px centers above trigger (Image 2 & 3 fix)
  const desktop = { left: 0, top: 0, width: 1280, height: 800 };
  const anchor = { left: 700, right: 810, top: 300, bottom: 322, width: 110, height: 22 };
  const plan = planTooltipConstraints({
    anchorRect: anchor, naturalHeight: 140, viewport: desktop, maxWidth: 320, edge: 8, gap: 4,
  });
  assert.equal(plan.visible, true);
  assert.equal(plan.up, true);
  const pos = resolveTooltipPosition({
    anchorRect: anchor, boxWidth: 320, boxHeight: 140, up: plan.up, viewport: desktop, edge: 8, gap: 4,
  });
  // Center of anchor is 755; 755 - 160 = 595 (NOT 4px on the left edge!)
  assert.equal(pos.left, 595);
  assert.equal(pos.top, 300 - 4 - 140);

  // Mobile narrow viewport (320px wide): clamps inside [8, 320 - 8] without overflowing
  const mobile = { left: 0, top: 0, width: 320, height: 568 };
  const edgeAnchor = { left: 260, right: 310, top: 40, bottom: 60, width: 50, height: 20 };
  const mobilePlan = planTooltipConstraints({
    anchorRect: edgeAnchor, naturalHeight: 180, viewport: mobile, maxWidth: 304, edge: 8, gap: 4,
  });
  assert.equal(mobilePlan.visible, true);
  assert.equal(mobilePlan.up, false); // Flips below because only 28px above
  const mobilePos = resolveTooltipPosition({
    anchorRect: edgeAnchor, boxWidth: 304, boxHeight: 180, up: mobilePlan.up, viewport: mobile, edge: 8, gap: 4,
  });
  assert.equal(mobilePos.left, 8); // 320 - 304 - 8
  assert.equal(mobilePos.top, 64); // 60 + 4

  // Scrolled outside clipping ancestor (e.g. behind Obsidian header): closes
  const clipped = planTooltipConstraints({
    anchorRect: { left: 200, right: 300, top: 30, bottom: 50, width: 100, height: 20 },
    naturalHeight: 100,
    viewport: desktop,
    clipRect: { left: 0, right: 1280, top: 80, bottom: 800 },
    maxWidth: 320,
  });
  assert.equal(clipped.visible, false);
});

test('selectAnchorRect picks hovered line segment on wrapped multi-line triggers', () => {
  const { selectAnchorRect } = loadRuntime();
  const wrappedMarker = {
    getClientRects: () => [
      { left: 500, right: 750, top: 200, bottom: 224, width: 250, height: 24 },
      { left: 50, right: 200, top: 224, bottom: 248, width: 150, height: 24 },
    ],
    getBoundingClientRect: () => ({ left: 50, right: 750, top: 200, bottom: 248, width: 700, height: 48 }),
  };

  const firstLine = selectAnchorRect(wrappedMarker, { x: 600, y: 210 });
  assert.equal(firstLine.index, 0);
  assert.equal(firstLine.rect.left, 500);

  const secondLine = selectAnchorRect(wrappedMarker, { x: 120, y: 235 });
  assert.equal(secondLine.index, 1);
  assert.equal(secondLine.rect.left, 50);
});

test('safe gap allows moving from trigger straight into tooltip while rejecting sideways exit', () => {
  const { isPointInSafeGap } = loadRuntime();
  const anchorRect = { left: 390, right: 500, top: 250, bottom: 272, width: 110, height: 22 };
  const boxRect = { left: 285, right: 605, top: 146, bottom: 246, width: 320, height: 100 };

  // Moving upward from trigger across the 4px gap into box stays open
  assert.equal(isPointInSafeGap({
    x: 445, y: 248, up: true, anchorRect, boxRect, origin: { x: 445, y: 255 }, target: 'box',
  }), true);

  // Moving diagonally up-left across the 4px gap toward a link in box stays open
  assert.equal(isPointInSafeGap({
    x: 420, y: 247, up: true, anchorRect, boxRect, origin: { x: 445, y: 255 }, target: 'box',
  }), true);

  // Moving horizontally right off trigger onto "- 09 71 21 64 42" closes immediately
  assert.equal(isPointInSafeGap({
    x: 520, y: 260, up: true, anchorRect, boxRect, origin: { x: 495, y: 260 }, target: 'box',
  }), false);

  // Moving to the far edge of the screen closes immediately
  assert.equal(isPointInSafeGap({
    x: 1150, y: 248, up: true, anchorRect, boxRect, origin: { x: 495, y: 260 }, target: 'box',
  }), false);
});

test('tooltip closes immediately with zero delay on pointer leave, mouse click+leave, or scroll away', async () => {
  const { doc, win, FakeEvent } = createFakeDom({
    viewport: { width: 1200, height: 800 },
    boxMeasure: (el) => {
      if (el.classList.contains('tooltip-classic-box')) {
        return { left: 285, top: 146, right: 605, bottom: 246, width: 320, height: 100 };
      }
      const left = Number.parseFloat(el.style.getPropertyValue('--tc-left')) || 285;
      const top = Number.parseFloat(el.style.getPropertyValue('--tc-top')) || 146;
      return { left, top, right: left + 320, bottom: top + 100, width: 320, height: 100 };
    },
  });

  const { TooltipClassic, normalizeSettings } = loadRuntime();
  const plugin = new TooltipClassic();
  plugin.settings = normalizeSettings({ triggerStyle: 'dotted', iconPosition: 'upper', width: 320 });
  plugin.styledDocuments = new Set();

  const note = doc.createElement('p');
  const sibling = doc.createElement('span');
  doc.body.append(note);
  note.append(sibling);

  const anchor = plugin.makeTrigger(doc, 'Flora Institut', 'test.md', undefined, (box) => {
    box.append('Fiche Google mal configuré.');
  });
  note.append(anchor);
  const word = anchor.children[0];
  word._rect = { left: 390, right: 500, top: 250, bottom: 272, width: 110, height: 22 };

  // 1. Hover opens immediately
  word.dispatchEvent(new FakeEvent('pointerenter', { pointerType: 'mouse', clientX: 440, clientY: 260 }));
  assert.ok(plugin.active);
  await plugin.active.ready;
  assert.equal(plugin.active.box.parentElement.classList.contains('tooltip-classic-positioning'), false);

  // Verify position is centered above word (445 - 160 = 285)
  const zone1 = plugin.active.box.parentElement;
  assert.equal(zone1.style.getPropertyValue('--tc-left'), '285px');
  assert.equal(zone1.style.getPropertyValue('--tc-top'), '146px');

  // 2. Clicking trigger with mouse does NOT pin it open when cursor moves away
  doc._pointTarget = word;
  anchor.dispatchEvent(new FakeEvent('pointerdown', { bubbles: true, pointerType: 'mouse', clientX: 440, clientY: 260 }));
  anchor.focus();
  anchor.dispatchEvent(new FakeEvent('click', { bubbles: true, detail: 1, clientX: 440, clientY: 260 }));
  doc.dispatchEvent(new FakeEvent('pointerup', { bubbles: true, pointerType: 'mouse', clientX: 440, clientY: 260 }));
  assert.ok(plugin.active);

  // Moving cursor onto sibling text to the right closes IMMEDIATELY (0ms)
  doc._pointTarget = sibling;
  word.dispatchEvent(new FakeEvent('pointerleave', {
    pointerType: 'mouse', clientX: 520, clientY: 260, relatedTarget: sibling,
  }));
  assert.equal(plugin.active, null);

  // 3. Hover again, move across 4px gap into box, then leave box -> closes immediately
  word.dispatchEvent(new FakeEvent('pointerenter', { pointerType: 'mouse', clientX: 440, clientY: 255 }));
  await plugin.active.ready;
  const zone2 = plugin.active.box.parentElement;
  word.dispatchEvent(new FakeEvent('pointerleave', {
    pointerType: 'mouse', clientX: 440, clientY: 248, relatedTarget: note,
  }));
  assert.ok(plugin.active); // Still open while crossing the 4px gap
  zone2.dispatchEvent(new FakeEvent('pointerenter', {
    bubbles: true, pointerType: 'mouse', clientX: 440, clientY: 240,
  }));
  assert.ok(plugin.active);

  // Click/select inside box then release outside -> closes immediately
  doc._pointTarget = zone2;
  zone2.dispatchEvent(new FakeEvent('pointerdown', { bubbles: true, pointerType: 'mouse', clientX: 440, clientY: 200 }));
  doc._pointTarget = sibling;
  doc.dispatchEvent(new FakeEvent('pointerup', { bubbles: true, pointerType: 'mouse', clientX: 700, clientY: 200 }));
  assert.equal(plugin.active, null);

  // 4. Scroll document away from stationary cursor -> closes immediately
  word.dispatchEvent(new FakeEvent('pointerenter', { pointerType: 'mouse', clientX: 440, clientY: 260 }));
  await plugin.active.ready;
  doc._pointTarget = sibling; // After scrolling, cursor is now over sibling instead of trigger
  doc.dispatchEvent(new FakeEvent('scroll', { bubbles: false }));
  assert.equal(plugin.active, null);

  // 5. Dragging a link out of box (dragend without pointerup) clears pressed and closes
  word.dispatchEvent(new FakeEvent('pointerenter', { pointerType: 'mouse', clientX: 440, clientY: 260 }));
  await plugin.active.ready;
  const zone3 = plugin.active.box.parentElement;
  zone3.dispatchEvent(new FakeEvent('pointerenter', { pointerType: 'mouse', clientX: 440, clientY: 200 }));
  zone3.dispatchEvent(new FakeEvent('pointerdown', { bubbles: true, pointerType: 'mouse', clientX: 440, clientY: 200 }));
  doc._pointTarget = sibling;
  win.dispatchWindowEvent('dragend', { clientX: 800, clientY: 200 });
  assert.equal(plugin.active, null);

  // 6. Pointer leaving the document viewport closes immediately
  word.dispatchEvent(new FakeEvent('pointerenter', { pointerType: 'mouse', clientX: 440, clientY: 260 }));
  await plugin.active.ready;
  doc.documentElement.dispatchEvent(new FakeEvent('pointerleave', { pointerType: 'mouse' }));
  assert.equal(plugin.active, null);

  // 7. Keyboard focus-visible opens and stays open until focusout or Escape
  anchor._focusVisible = true;
  anchor.focus();
  anchor.dispatchEvent(new FakeEvent('focus'));
  await plugin.active.ready;
  assert.ok(plugin.active);
  anchor.dispatchEvent(new FakeEvent('focusout', { relatedTarget: sibling }));
  assert.equal(plugin.active, null);
});
