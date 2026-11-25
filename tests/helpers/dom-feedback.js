// DOM e relógio mínimos para exercitar a lógica real de feedback em Node.
// Não substituem uma verificação visual ou de acessibilidade em navegador.
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function environment() {
  let now = 0, sequence = 0;
  const timers = new Map(), storage = new Map();
  class Target {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(fn);
    }
    removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
    emit(type, properties = {}) {
      const event = { target: this, currentTarget: this, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...properties };
      for (const fn of [...(this.listeners.get(type) || [])]) { fn(event); if (event.stopped) break; }
      return event;
    }
  }
  class Element extends Target {
    constructor(tag) {
      super(); this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null;
      this.attrs = {}; this.dataset = {}; this.disabled = false; this.inert = false;
      this.classList = {
        contains: name => this.className.split(/\s+/).includes(name),
        add: name => { this.className = [...new Set([...this.className.split(/\s+/), name])].join(' ').trim(); },
        remove: name => { this.className = this.className.split(/\s+/).filter(item => item !== name).join(' '); },
        toggle: (name, force) => { const value = force ?? !this.classList.contains(name); this.classList[value ? 'add' : 'remove'](name); return value; },
      };
    }
    set className(value) { this.attrs.class = value; }
    get className() { return this.attrs.class || ''; }
    setAttribute(key, value) {
      this.attrs[key] = String(value);
      if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, x) => x.toUpperCase())] = String(value);
    }
    getAttribute(key) { return this.attrs[key] ?? null; }
    removeAttribute(key) { delete this.attrs[key]; }
    get tabIndex() { return this.attrs.tabindex !== undefined ? Number(this.attrs.tabindex) : ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A'].includes(this.tagName) ? 0 : -1; }
    get isConnected() { return this === document.body || Boolean(this.parentElement?.isConnected); }
    appendChild(child) { this.children.push(child); child.parentElement = this; return child; }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    contains(child) { return child === this || this.children.some(node => node.contains(child)); }
    remove() {
      if (this.contains(document.activeElement)) document.activeElement = document.body;
      if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this);
      this.parentElement = null;
    }
    matches(selector) {
      return selector.split(',').some(part => {
        part = part.trim();
        if (part.startsWith('#')) return this.attrs.id === part.slice(1);
        if (part.startsWith('.')) return this.classList.contains(part.slice(1));
        const match = part.match(/^(\w+)?(?:\[([^=\]]+)(?:="?([^"\]]+)"?)?\])?$/);
        if (!match) throw new Error(`Selector não suportado pelo DOM de teste: ${part}`);
        const [, tag, attr, value] = match;
        const attrValue = attr === 'inert' ? (this.inert ? '' : undefined) : attr?.startsWith('data-') ? this.dataset[attr.slice(5).replace(/-([a-z])/g, (_, x) => x.toUpperCase())] : this.attrs[attr];
        return (!tag || this.tagName === tag.toUpperCase()) && (!attr || (attrValue !== undefined && (value === undefined || attrValue === value)));
      });
    }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getClientRects() { return !this.isConnected || this.closest('.hidden') || this.attrs.hidden !== undefined ? [] : [{}]; }
    focus() {
      if (this.disabled || this.closest('[inert]') || !this.getClientRects().length) return;
      document.activeElement = this;
      document.emit('focusin', { target: this });
    }
    set innerHTML(html) {
      this.html = html; this.children = [];
      const stack = [this];
      for (const match of html.matchAll(/<\/?[a-z][^>]*>/gi)) {
        const token = match[0];
        if (token.startsWith('</')) { stack.pop(); continue; }
        const tag = token.match(/^<(\w[\w-]*)/)[1];
        const child = new Element(tag);
        for (const attr of token.slice(tag.length + 1, -1).matchAll(/([\w-]+)(?:="([^"]*)")?/g)) child.setAttribute(attr[1], attr[2] || '');
        stack.at(-1).appendChild(child);
        if (!['input', 'img', 'br', 'hr'].includes(tag)) stack.push(child);
      }
    }
    get innerHTML() { return this.html; }
  }
  const document = new Target();
  document.body = new Element('body'); document.activeElement = document.body;
  document.createElement = tag => new Element(tag);
  document.querySelector = selector => document.body.querySelector(selector);
  const window = {
    location: { href: 'https://autoshine.test/cadastro.html', origin: 'https://autoshine.test', pathname: '/cadastro.html', assign(url) { this.assigned = url; } },
    setTimeout(fn, delay) { const id = ++sequence; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  class ClockDate extends Date { static now() { return now; } }
  const context = vm.createContext({ document, window, HTMLElement: Element, URL, Date: ClockDate,
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  });
  const source = fs.readFileSync(path.join(__dirname, '../../assets/js/app.js'), 'utf8');
  const feedback = source.slice(source.indexOf('// Feedback visual'), source.indexOf('function initializePasswordVisibilityToggles'));
  const confirmation = source.slice(source.indexOf('function ensureConfirmDialog'), source.indexOf('// ── Utilitários'));
  const escape = source.slice(source.indexOf('function escapeHtml'), source.indexOf('function createSlug'));
  vm.runInContext(feedback + confirmation + escape, context);
  return { document, window, context, storage, source,
    run: code => vm.runInContext(code, context),
    element(tag = 'button') { return document.body.appendChild(new Element(tag)); },
    tick(ms) {
      const end = now + ms;
      while (true) {
        const entry = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry) break;
        now = entry[1].at; timers.delete(entry[0]); entry[1].fn();
      }
      now = end;
    },
  };
}
module.exports = { environment };
