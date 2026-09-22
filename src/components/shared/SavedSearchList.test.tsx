import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SavedSearchList } from './SavedSearchList';
import { SavedSearchRow } from '../../types';

/**
 * Saved searches shipped write-only once already: you could create one and
 * then never see it, re-run it, or switch it off. These cover the three
 * controls that fixed that, and in particular that turning alerts off is not
 * the same gesture as deleting - a standing request someone silenced is one
 * they still want to run by hand.
 */

const row = (over: Partial<SavedSearchRow> = {}): SavedSearchRow => ({
  id: 's1',
  label: '"monitor" · under K500',
  query: 'monitor',
  maxPrice: 500,
  alerts: true,
  createdAt: '2026-09-01T00:00:00Z',
  ...over,
});

function renderList(props: Partial<React.ComponentProps<typeof SavedSearchList>> = {}) {
  return render(
    <SavedSearchList
      searches={[row()]}
      onRun={() => {}}
      onToggleAlerts={() => {}}
      onRemove={() => {}}
      {...props}
    />,
  );
}

describe('SavedSearchList', () => {
  it('renders nothing at all when there are no searches', () => {
    const { container } = renderList({ searches: [] });

    // A heading over an empty list, or an invitation to save a search on a
    // page where no search is happening, is noise.
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the generated label, so a row is recognisable without opening it', () => {
    renderList();
    expect(screen.getByText('"monitor" · under K500')).toBeInTheDocument();
  });

  it('re-runs the search when the row is picked', () => {
    const onRun = vi.fn();
    renderList({ onRun });

    fireEvent.click(screen.getByText('"monitor" · under K500'));

    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
  });

  it('says whether alerts are on, in words rather than only an icon', () => {
    renderList();
    expect(screen.getByText(/tell you about new matches/i)).toBeInTheDocument();
  });

  it('says so when they are off', () => {
    renderList({ searches: [row({ alerts: false })] });
    expect(screen.getByText('Alerts off')).toBeInTheDocument();
  });

  it('offers to turn alerts off without deleting the search', () => {
    const onToggleAlerts = vi.fn();
    const onRemove = vi.fn();
    renderList({ onToggleAlerts, onRemove });

    fireEvent.click(screen.getByLabelText(/Turn off alerts for/i));

    expect(onToggleAlerts).toHaveBeenCalledTimes(1);
    // Silencing is not deleting. Conflating them would throw away a search
    // someone still wants to run by hand.
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('offers to turn them back on', () => {
    const onToggleAlerts = vi.fn();
    renderList({ searches: [row({ alerts: false })], onToggleAlerts });

    fireEvent.click(screen.getByLabelText(/Turn on alerts for/i));

    expect(onToggleAlerts).toHaveBeenCalledTimes(1);
  });

  it('deletes only when delete is chosen', () => {
    const onRemove = vi.fn();
    const onRun = vi.fn();
    renderList({ onRemove, onRun });

    fireEvent.click(screen.getByLabelText(/Delete saved search/i));

    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
    // Deleting must not also navigate, which would leave someone on a feed
    // filtered by the thing they just got rid of.
    expect(onRun).not.toHaveBeenCalled();
  });

  it('disables the controls on the row that is mid-request', () => {
    renderList({ busyId: 's1' });

    expect(screen.getByLabelText(/Turn off alerts for/i)).toBeDisabled();
    expect(screen.getByLabelText(/Delete saved search/i)).toBeDisabled();
  });

  it('leaves other rows usable while one is busy', () => {
    renderList({
      searches: [row(), row({ id: 's2', label: 'bikes' })],
      busyId: 's1',
    });

    const deletes = screen.getAllByLabelText(/Delete saved search/i);
    expect(deletes[0]).toBeDisabled();
    expect(deletes[1]).toBeEnabled();
  });
});
