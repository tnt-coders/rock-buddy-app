import { JSDOM } from 'jsdom';

// A browser DOM lets these tests exercise real React components without Electron or a backend.
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://desktop.test/',
});
Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    sessionStorage: dom.window.sessionStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
});

// JSDOM does not implement native dialogs; actual focus trapping is checked in Electron.
window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
window.HTMLDialogElement.prototype.close = function () { this.open = false; };
