import React from 'react';
import AssistantHost from '@site/src/components/Assistant/AssistantHost';

/**
 * Swizzled Root, which wraps the whole app and survives route changes.
 *
 * The assistant is mounted here rather than inside a page or a layout so that its conversation is not
 * discarded when the reader navigates, and so the keyboard shortcut works from any route. It renders
 * nothing at all until opened.
 */
export default function Root({children}) {
  return (
    <>
      {children}
      <AssistantHost />
    </>
  );
}
