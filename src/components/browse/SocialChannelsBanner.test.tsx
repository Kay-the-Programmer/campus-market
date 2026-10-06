import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SocialChannelsBanner } from './SocialChannelsBanner';
import { LIVE_SOCIAL_CHANNELS } from '../../data/socialChannels';

/*
 * The real encoder draws to a canvas, which jsdom does not have. What is worth
 * asserting here is not the pixels - the browser proves those - but that every
 * channel gets a code generated from the same url its button links to, which a
 * stub that echoes its input shows precisely.
 */
const toDataURL = vi.fn(async (url: string) => `data:image/png;base64,${btoa(url)}`);
vi.mock('qrcode', () => ({ default: { toDataURL: (url: string) => toDataURL(url) } }));

beforeEach(() => {
  toDataURL.mockClear();
});

/** The code for `url`, as the stub above would have written it. */
const codeFor = (url: string) => `data:image/png;base64,${btoa(url)}`;

describe('SocialChannelsBanner', () => {
  it('offers every live channel, with a join link that leaves the page safely', () => {
    render(<SocialChannelsBanner />);

    const links = screen.getAllByRole('link', { name: /^Join Campus Market on / });
    expect(links).toHaveLength(LIVE_SOCIAL_CHANNELS.length);

    LIVE_SOCIAL_CHANNELS.forEach((channel, i) => {
      expect(links[i]).toHaveAttribute('href', channel.url);
      expect(links[i]).toHaveAttribute('target', '_blank');
      // noopener is the one that matters: the destination must not be handed a
      // reference to this window.
      expect(links[i].getAttribute('rel')).toContain('noopener');
      expect(screen.getByText(channel.label)).toBeInTheDocument();
    });
  });

  it('generates a code per channel, encoding the same url the button opens', async () => {
    render(<SocialChannelsBanner />);

    await waitFor(() => {
      expect(screen.getAllByRole('img')).toHaveLength(LIVE_SOCIAL_CHANNELS.length);
    });

    expect(toDataURL.mock.calls.map(([url]) => url))
      .toEqual(LIVE_SOCIAL_CHANNELS.map((c) => c.url));

    for (const channel of LIVE_SOCIAL_CHANNELS) {
      const img = screen.getByAltText(new RegExp(`QR code .*${channel.label}`));
      expect(img).toHaveAttribute('src', codeFor(channel.url));
    }
  });

  it('draws the codes once, not on every render', async () => {
    const { rerender } = render(<SocialChannelsBanner />);
    await waitFor(() => expect(toDataURL).toHaveBeenCalledTimes(LIVE_SOCIAL_CHANNELS.length));

    rerender(<SocialChannelsBanner className="mt-8" />);
    rerender(<SocialChannelsBanner />);

    // A regression guard with history: the channel list used to be rebuilt on
    // every render, which re-ran the effect, and the cleanup of the run that
    // had started the work cancelled it - so the codes never appeared at all.
    expect(toDataURL).toHaveBeenCalledTimes(LIVE_SOCIAL_CHANNELS.length);
    expect(screen.getAllByRole('img')).toHaveLength(LIVE_SOCIAL_CHANNELS.length);
  });

  it('keeps the join buttons when the encoder fails', async () => {
    toDataURL.mockRejectedValueOnce(new Error('no canvas here'));
    render(<SocialChannelsBanner />);

    await waitFor(() => expect(toDataURL).toHaveBeenCalled());

    const links = screen.getAllByRole('link', { name: /^Join Campus Market on / });
    expect(links).toHaveLength(LIVE_SOCIAL_CHANNELS.length);
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('names the banner for assistive technology', () => {
    render(<SocialChannelsBanner />);
    const banner = screen.getByRole('region', { name: /Get the listings before the feed does/ });
    expect(within(banner).getAllByRole('link').length).toBeGreaterThan(0);
  });
});
