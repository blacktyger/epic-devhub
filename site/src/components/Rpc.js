import React, {useId, useMemo, useRef, useState} from 'react';
import Link from '@docusaurus/Link';
import {group as findGroup, surfaces} from '@site/src/data/rpcSpec';
import {versions, repos} from '@site/src/data/versions';

/**
 * Reference blocks and a request console for the JSON-RPC surfaces.
 *
 * The console assembles a request from editable parameters and shows the captured response. It
 * makes no network call, by decision: a docs page that fires real requests at a wallet is a page
 * that can spend money, and one that fires them at a node needs the reader's API secret typed
 * into a text field. Neither is a thing to build into documentation. What a reader actually needs
 * is the exact request body, correct on the first try, and something to copy.
 *
 * Every method block renders the same shape, in the same order, with no variation between
 * entries, because this is a lookup surface and a reader arrived from search.
 */

const RISK_LABEL = {
  read: 'Read only',
  spend: 'Can move funds',
  state: 'Changes state',
  secret: 'Exposes secret',
  destructive: 'Destructive',
};

function riskClass(risk) {
  if (risk === 'spend') return 'epicRiskSpend';
  if (risk === 'state') return 'epicRiskState';
  if (risk === 'secret') return 'epicRiskSecret';
  if (risk === 'destructive') return 'epicRiskDestructive';
  return 'epicRiskRead';
}

/** Parse what the reader typed into the JSON value it represents. */
function parseValue(raw) {
  const text = raw.trim();
  if (text === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    // A bare word is the common case: treat it as a string rather than refusing to render.
    return text;
  }
}

function buildRequest(method, values) {
  const params =
    method.paramStyle === 'named'
      ? Object.fromEntries(method.params.map((p) => [p.name, parseValue(values[p.name])]))
      : method.params.map((p) => parseValue(values[p.name]));

  return {
    jsonrpc: '2.0',
    id: 1,
    method: method.name,
    params,
  };
}

function CopyButton({text, label = 'Copy'}) {
  const [state, setState] = useState('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('done');
      setTimeout(() => setState('idle'), 1600);
    } catch {
      setState('failed');
      setTimeout(() => setState('idle'), 1600);
    }
  };

  return (
    <button type="button" className="epicRpcCopy" onClick={copy}>
      {state === 'done' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
    </button>
  );
}

const REQUEST_TABS = [
  {id: 'request', label: 'Request', copy: 'Copy request'},
  {id: 'shell', label: 'Shell command', copy: 'Copy curl'},
];

function RequestBlock({request, curl}) {
  const [activeTab, setActiveTab] = useState('request');
  const panelId = useId();
  const requestText = useMemo(() => JSON.stringify(request, null, 2), [request]);
  const text = activeTab === 'request' ? requestText : curl;
  const lines = text.split('\n').length;
  const tabRefs = useRef({});
  const active = REQUEST_TABS.find((tab) => tab.id === activeTab);

  // A tablist is expected to hold one tab stop and move between tabs with the arrow keys. Without
  // this the role is a lie: a screen reader announces "tab 1 of 2" and the arrows do nothing.
  const onKeyDown = (event) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const index = REQUEST_TABS.findIndex((tab) => tab.id === activeTab);
    const next = REQUEST_TABS[(index + delta + REQUEST_TABS.length) % REQUEST_TABS.length];
    setActiveTab(next.id);
    tabRefs.current[next.id]?.focus();
  };

  return (
    <div className="epicRpcJson">
      <div className="epicRpcJsonBar epicRpcCodeTabs">
        {/* role=tablist accepts only tabs as children, so the line count and the copy button are
            siblings of the tablist rather than inside it. */}
        <div
          className="epicRpcTabs"
          role="tablist"
          aria-label="Request format"
          onKeyDown={onKeyDown}>
          {REQUEST_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              id={`${panelId}-${tab.id}-tab`}
              className={`epicRpcTab ${activeTab === tab.id ? 'isActive' : ''}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`${panelId}-panel`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>
        <span className="epicRpcJsonMeta">{lines} lines</span>
        <CopyButton text={text} label={active.copy} />
      </div>
      <pre
        id={`${panelId}-panel`}
        className="epicRpcPre"
        role="tabpanel"
        aria-labelledby={`${panelId}-${activeTab}-tab`}
        tabIndex={0}>
        <code>{text}</code>
      </pre>
    </div>
  );
}

function ResponseBlock({value, truncated = false}) {
  const missing = value === undefined || value === null;
  const text = useMemo(() => (missing ? 'N/A' : JSON.stringify(value, null, 2)), [missing, value]);
  const lines = text.split('\n').length;
  const long = lines > 24;

  return (
    <div className="epicRpcJson">
      <div className="epicRpcJsonBar">
        <span className="epicRpcJsonLabel">Response</span>
        {!missing ? (
          <>
            <span className="epicRpcJsonMeta">
              {lines} lines{truncated ? ', two hex values shortened' : ''}
            </span>
            <CopyButton text={text} />
          </>
        ) : null}
      </div>
      <pre className={long ? 'epicRpcPre epicRpcPreLong' : 'epicRpcPre'} tabIndex={0}>
        <code>{text}</code>
      </pre>
    </div>
  );
}

function SourceLink({src}) {
  const repo = repos[src.repo];
  if (!repo) return null;
  const href = `https://github.com/${repo.repo}/blob/${repo.ref}/${src.path}${
    src.line ? `#L${src.line}` : ''
  }`;
  return (
    <a className="epicRpcSrc" href={href} target="_blank" rel="noopener noreferrer">
      {src.path}
      {src.line ? `:${src.line}` : ''}
    </a>
  );
}

export function RpcConsole({method, surface}) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(method.params.map((p) => [p.name, p.default ?? ''])),
  );

  const request = buildRequest(method, values);
  const curl = [
    `curl -s ${surface.credential === 'basic' ? `-u epic:$(cat ${surface.secretPath}) ` : ''}\\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '${JSON.stringify(request)}' \\`,
    `  http://127.0.0.1:${versionValue(surface.portKey)}${surface.path}`,
  ].join('\n');

  return (
    <div className="epicRpcConsole">
      {method.params.length > 0 ? (
        <fieldset className="epicRpcParams">
          <legend>Parameters</legend>
          {method.params.map((p) => (
            <div className="epicRpcParam" key={p.name}>
              <label htmlFor={`${method.name}-${p.name}`}>
                <span className="epicRpcParamName">{p.name}</span>
                <span className="epicRpcParamType">{p.type}</span>
                {p.required ? <span className="epicRpcParamReq">required</span> : null}
              </label>
              <input
                id={`${method.name}-${p.name}`}
                className="epicRpcInput"
                type="text"
                value={values[p.name]}
                spellCheck={false}
                onChange={(e) => setValues({...values, [p.name]: e.target.value})}
              />
              <p className="epicRpcParamHelp">{p.help}</p>
            </div>
          ))}
        </fieldset>
      ) : (
        <p className="epicRpcNoParams">This method takes no parameters.</p>
      )}

      <RequestBlock request={request} curl={curl} />
      <ResponseBlock
        value={method.example?.response}
        truncated={!!method.example?.responseTruncated}
      />
    </div>
  );
}

function versionValue(key) {
  return key.split('.').reduce((acc, part) => acc?.[part], versions) ?? '';
}

/** One method's full reference entry. Same shape every time. */
export function RpcMethod({method, surface}) {
  return (
    <section className="epicRpcMethod" id={method.name}>
      <div className="epicRpcHead">
        <h3 className="epicRpcName">
          <a href={`#${method.name}`}>{method.name}</a>
        </h3>
        <span className={`epicRiskBadge ${riskClass(method.risk)}`}>{RISK_LABEL[method.risk]}</span>
      </div>

      <p className="epicRpcSummary">{method.summary}</p>

      {method.riskNote ? <p className="epicRpcRiskNote">{method.riskNote}</p> : null}

      <dl className="epicRpcMeta">
        <dt>Surface</dt>
        <dd>
          <code>{surface.path}</code> on port {versionValue(surface.portKey)}
        </dd>
        <dt>Parameters</dt>
        <dd>
          {method.params.length === 0
            ? 'none'
            : `${method.params.length} ${method.paramStyle}`}
        </dd>
        <dt>Declared in</dt>
        <dd>
          <SourceLink src={method.src} />
        </dd>
      </dl>

      {method.notes?.length ? (
        <ul className="epicRpcNotes">
          {method.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}

      <RpcConsole method={method} surface={surface} />
    </section>
  );
}

/** A whole group: the working context, then one entry per method. */
export function RpcGroup({id}) {
  const spec = findGroup(id);
  if (!spec) throw new Error(`RpcGroup: unknown group "${id}"`);
  const surface = surfaces[spec.surface];

  return (
    <div className="epicRpcGroup">
      <dl className="epicRpcContext">
        <dt>Endpoint</dt>
        <dd>
          <code>
            http://127.0.0.1:{versionValue(surface.portKey)}
            {surface.path}
          </code>
        </dd>
        <dt>Credential</dt>
        <dd>{surface.credentialNote}</dd>
        <dt>Methods here</dt>
        <dd>{spec.methods.length}</dd>
        <dt>Documented against</dt>
        <dd>
          node <Link to="/downloads">{versions.node}</Link>, wallet {versions.wallet}
        </dd>
      </dl>

      {/* Method names are rendered by this component, so Docusaurus never sees them and cannot
          put them in the right-hand table of contents. On a page with ten methods that leaves a
          reader with no way to jump, which is the one thing a lookup page has to get right, so
          the index is built here instead. */}
      <nav className="epicRpcIndex" aria-label={`${spec.title} methods`}>
        <p className="epicRpcIndexLabel">Jump to</p>
        <ul>
          {spec.methods.map((method) => (
            <li key={method.name}>
              <a href={`#${method.name}`}>{method.name}</a>
            </li>
          ))}
        </ul>
      </nav>

      {spec.methods.map((method) => (
        <RpcMethod key={method.name} method={method} surface={surface} />
      ))}
    </div>
  );
}
