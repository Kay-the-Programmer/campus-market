import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SocialChannelsBanner } from './SocialChannelsBanner';
import { LIVE_SOCIAL_CHANNELS } from '../../data/socialChannels';

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
      expect(screen.getByText(channel.blurb)).toBeInTheDocument();
    });
  });

  it('is a banner of links and nothing else - no images to load', () => {
    render(<SocialChannelsBanner />);
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('names the banner for assistive technology', () => {
    render(<SocialChannelsBanner />);
    const banner = screen.getByRole('region', { name: /Get the listings before the feed does/ });
    expect(within(banner).getAllByRole('link')).toHaveLength(LIVE_SOCIAL_CHANNELS.length);
  });
});
