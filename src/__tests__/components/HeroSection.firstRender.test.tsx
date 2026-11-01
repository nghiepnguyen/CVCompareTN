// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { useMotionValue } from 'motion/react';
import { HeroSection } from '../../components/views/landing/HeroSection';
import { UI_LABELS } from '../../translations';

const login = vi.fn();
function Hero() {
  const opacity = useMotionValue(1);
  const scale = useMotionValue(1);
  return <HeroSection t={UI_LABELS.vi} login={login} opacity={opacity} scale={scale} />;
}
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  login.mockClear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('shows the heading, explanation and primary action on the first render', () => {
  render(<Hero />);
  const elements = [
    screen.getByRole('heading', { level: 1 }),
    screen.getByText(UI_LABELS.vi.heroDesc),
    screen.getByRole('button', { name: UI_LABELS.vi.startNow }),
  ];
  for (const element of elements) {
    let node: HTMLElement | null = element;
    while (node && node.tagName !== 'SECTION') {
      expect(node.style.opacity).not.toBe('0');
      expect(node.style.filter).not.toContain('blur(10px)');
      node = node.parentElement;
    }
  }
  fireEvent.click(elements[2]);
  expect(login).toHaveBeenCalledOnce();
});

it('makes decorative CSS animations respect reduced-motion preferences', () => {
  const { container } = render(<Hero />);
  for (const element of container.querySelectorAll('[class]')) {
    expect((element.getAttribute('class') ?? '').split(' ').some((name: string) => name.startsWith('animate-'))).toBe(false);
  }
});
