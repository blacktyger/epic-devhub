import React from 'react';
import clsx from 'clsx';
import useIsBrowser from '@docusaurus/useIsBrowser';
import {useColorMode} from '@docusaurus/theme-common';
import {translate} from '@docusaurus/Translate';

/**
 * Two-state theme switch.
 *
 * Replaces the theme's own three-state cycle, which was a reported bug rather than a preference.
 * `respectPrefersColorScheme` is true, and upstream's `getNextColorMode` then cycles
 * `dark -> null -> light`, where `null` means "follow the system". On a machine set to dark, going
 * from dark to light took two clicks and the first one appeared to do nothing, because system
 * resolved back to dark. Upstream's own comment says the order is defined there and can be
 * customised by swizzling, so this is the sanctioned fix rather than a workaround.
 *
 * The next mode is computed from the *resolved* mode, not from the stored choice. `value` here is
 * `colorModeChoice`, which is null while the reader is following their system, and flipping against
 * null is what produced the dead click. One press now always inverts what is on screen.
 *
 * Cost of the change: there is no longer a way to return to "follow the system" from the navbar. That
 * is the trade upstream made in the other direction, and for a docs site a switch that does what it
 * looks like is worth more than a third state nobody found.
 *
 * Both icons are always in the markup and CSS picks one from `html[data-theme]`, which is the same
 * technique upstream uses and the reason it works before React hydrates: the inline script in
 * `<head>` sets that attribute before first paint, so there is no flash of the wrong glyph.
 *
 * The glyph shows the mode you would switch *to*, and the accessible name says so in words.
 */
export default function ColorModeToggle({className, buttonClassName, value, onChange}) {
  const isBrowser = useIsBrowser();
  const {colorMode} = useColorMode();
  const next = colorMode === 'dark' ? 'light' : 'dark';
  const nextMode = translate({
    id: next === 'light' ? 'theme.colorToggle.ariaLabel.mode.light' : 'theme.colorToggle.ariaLabel.mode.dark',
    message: `${next} mode`,
  });
  const currentMode = translate({
    id: colorMode === 'light' ? 'theme.colorToggle.ariaLabel.mode.light' : 'theme.colorToggle.ariaLabel.mode.dark',
    message: `${colorMode} mode`,
  });
  const title = translate(
    {
      id: 'theme.colorToggle.title',
      message: 'Switch to {mode}',
      description: 'Tooltip for the color mode toggle',
    },
    {mode: nextMode},
  );
  const ariaLabel = translate(
    {
      id: 'theme.colorToggle.ariaLabel',
      message: 'Switch to {nextMode}, currently {currentMode}',
      description: 'The ARIA label for the color mode toggle',
    },
    {nextMode, currentMode},
  );

  return (
    <div className={clsx('epicThemeToggle', className)}>
      <button
        type="button"
        className={clsx('clean-btn', 'epicThemeToggle-button', buttonClassName)}
        // Disabled until hydrated, matching upstream: before that the click has nowhere to go, and a
        // button that looks live and does nothing is worse than one that says it is not ready.
        disabled={!isBrowser}
        title={title}
        aria-label={ariaLabel}
        onClick={() => onChange(next)}>
        {/* Shown in dark mode: press for light. */}
        <svg
          className="epicThemeToggle-icon epicThemeToggle-icon--sun"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.4v2.2M12 19.4v2.2M2.4 12h2.2M19.4 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" />
        </svg>
        {/* Shown in light mode: press for dark. */}
        <svg
          className="epicThemeToggle-icon epicThemeToggle-icon--moon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true">
          <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2z" />
        </svg>
      </button>
    </div>
  );
}
