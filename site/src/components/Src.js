import React from 'react';
import {repos, versions} from '@site/src/data/versions';

function buildHref(repo, path, line, lines) {
  const target = repos[repo] ?? repos.node;
  const range = lines ? `#L${lines}` : line ? `#L${line}` : '';
  return {
    href: `${target.url}/blob/${target.ref}/${path}${range}`,
    title: `${target.label} ${target.ref} — ${path}`,
  };
}

/**
 * Links a source file on GitHub, pinned to the release refs in src/data/versions.js.
 *
 *   <Src repo="node" path="api/src/handlers.rs" line={448} />
 */
export function Src({repo = 'node', path, line, lines, children}) {
  const {href, title} = buildHref(repo, path, line, lines);
  const label = children ?? (line ? `${path}:${line}` : path);
  return (
    <a className="epicSrc" href={href} target="_blank" rel="noopener noreferrer" title={title}>
      <code>{label}</code>
    </a>
  );
}

/**
 * Links a specific function, struct or constant to the line where it is defined.
 * Renders as a call so it reads as code rather than as a path.
 *
 *   <Fn repo="node" path="core/src/consensus.rs" line={451} name="next_difficulty" />
 */
export function Fn({repo = 'node', path, line, name, kind = 'fn', children}) {
  const {href, title} = buildHref(repo, path, line);
  const label = children ?? (kind === 'fn' ? `${name}()` : name);
  return (
    <a
      className="epicSrc"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`${title}${line ? `:${line}` : ''}`}>
      <code>{label}</code>
    </a>
  );
}

/** Links a repository root. */
export function Repo({name = 'node', children}) {
  const target = repos[name] ?? repos.node;
  return (
    <a href={target.url} target="_blank" rel="noopener noreferrer">
      {children ?? target.label}
    </a>
  );
}

/**
 * Prints a value from src/data/versions.js so versions live in exactly one place.
 *
 *   <Ver k="node" />            -> 4.0.3
 *   <Ver k="ports.nodeApi" />   -> 3413
 */
export function Ver({k}) {
  const value = k
    .split('.')
    .reduce((acc, part) => (acc == null ? undefined : acc[part]), versions);
  if (value === undefined) {
    throw new Error(
      `<Ver k="${k}" /> is not defined in src/data/versions.js. Add it there rather than hard-coding.`,
    );
  }
  return <>{String(value)}</>;
}
