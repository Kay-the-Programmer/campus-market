import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

/*
 * The boundary exists to stop one thrown error from blanking the whole app, so
 * what is worth asserting is exactly that: something renders, and it is not a
 * blank page.
 */

const Boom = ({ explode }: { explode: boolean }) => {
  if (explode) throw new Error('render failed');
  return <p>all good</p>;
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React logs caught render errors to console.error regardless of the
    // boundary, and componentDidCatch adds its own. Silenced so a passing run
    // is not full of red that means nothing.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <Boom explode={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('shows the recovery screen instead of a blank page when a child throws', () => {
    render(
      <ErrorBoundary>
        <Boom explode />
      </ErrorBoundary>,
    );

    expect(screen.getByText('This page stopped working')).toBeInTheDocument();
    // Both ways out are offered - a retry that remounts, and an escape home.
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to browsing/i })).toBeInTheDocument();
  });

  it('reports the failure so it is not silent', () => {
    render(
      <ErrorBoundary>
        <Boom explode />
      </ErrorBoundary>,
    );

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Unhandled render error'),
      expect.any(Error),
      expect.anything(),
    );
  });
});
