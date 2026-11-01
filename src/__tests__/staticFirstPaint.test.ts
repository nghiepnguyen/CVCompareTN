// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { UI_LABELS } from '../translations';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';

const template = readFileSync('index.html', 'utf8');

describe('HTML first paint before the app bundle executes', () => {
  for (const lang of ['vi', 'en'] as const) {
    it(lang + ': keeps pre-rendered content visible when JavaScript is enabled but the bundle is delayed', () => {
      const html = template.replace('<div id="root"></div>',
        '<div id="root"><div id="seo-static"><h1>' + UI_LABELS[lang].heroTitle +
        '</h1><a href="/' + lang + '/privacy">Privacy</a></div></div>');
      // Execute inline head scripts, but never fetch/execute the external app bundle.
      const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://cvfit.pro/' + lang + '/' });
      try {
        const content = dom.window.document.getElementById('seo-static')!;
        expect(content.textContent).toContain(UI_LABELS[lang].heroTitle);
        expect(dom.window.getComputedStyle(content).display).not.toBe('none');
        expect(dom.window.getComputedStyle(content).visibility).not.toBe('hidden');
        expect(content.querySelector('a')?.getAttribute('href')).toBe('/' + lang + '/privacy');
      } finally {
        dom.window.close();
      }
    });
  }
});

it('replaces the static subtree on the first React commit without duplicate content', () => {
  const host = document.createElement('div');
  host.innerHTML = '<div id="seo-static"><h1>Static content</h1></div>';
  document.body.append(host);
  try {
    render(createElement('main', null, 'App ready'), { container: host });
    expect(document.getElementById('seo-static')).toBeNull();
    expect(screen.getByText('App ready')).toBeTruthy();
  } finally {
    cleanup();
    host.remove();
  }
});
