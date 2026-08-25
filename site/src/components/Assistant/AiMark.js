import React from 'react';

/**
 * The assistant's mark: two four-pointed stars, unequal and offset.
 *
 * A single symmetrical sparkle was tried and rejected. On its own it reads as "save to favourites",
 * and a magnifier obviously reads as search, so the mark that means "this is generative" has to be
 * neither. Two unequal stars at an offset is the convention that has settled across assistant
 * interfaces, and it survives being 16px tall.
 *
 * It never ships without a text label beside it. No icon carries this meaning alone, which is why
 * every caller pairs it with words and why this is `aria-hidden`: the accessible name lives on the
 * control, not here.
 *
 * Render at 16px or above. At 14 the smaller star closes up and the mark reads as one blob.
 */
export default function AiMark({size = 16, className}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false">
      <path d="M9 2.2l1.5 4.3L14.8 8l-4.3 1.5L9 13.8 7.5 9.5 3.2 8l4.3-1.5z" fill="currentColor" />
      <path
        d="M17.2 13.4l.9 2.5 2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9z"
        fill="currentColor"
        opacity="0.75"
      />
    </svg>
  );
}
