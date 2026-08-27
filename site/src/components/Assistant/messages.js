import {translate} from '@docusaurus/Translate';

/**
 * Assistant chrome lives in Docusaurus' translation catalogue, alongside the rest of the site UI.
 * Keeping the calls here gives the panel, modal, page actions and markdown renderer one vocabulary
 * without introducing a second locale store.
 */
export const assistantMessage = {
  resizePanel: () => translate({id: 'assistant.host.resizePanel', message: 'Resize the assistant panel'}),
  loading: () => translate({id: 'assistant.host.loading', message: 'Loading the assistant'}),

  modalLabel: () => translate({id: 'assistant.modal.label', message: 'Ask or search the documentation'}),
  modalInputLabel: () => translate({id: 'assistant.modal.inputLabel', message: 'Ask a question, or search the documentation'}),
  modalPlaceholder: () => translate({id: 'assistant.modal.placeholder', message: 'Ask or search…'}),
  modalClear: () => translate({id: 'assistant.modal.clear', message: 'Clear the box'}),
  modalOptionsWithQuery: () => translate({id: 'assistant.modal.optionsWithQuery', message: 'Ask the assistant, or open a page'}),
  modalSuggestedQuestions: () => translate({id: 'assistant.modal.suggestedQuestions', message: 'Suggested questions'}),
  modalAskAi: (question) => translate({id: 'assistant.modal.askAi', message: 'Ask AI: {question}'}, {question}),
  modalAskAiNote: () => translate({id: 'assistant.modal.askAiNote', message: 'Answers from these docs, with the sections it used'}),
  modalSearchMissing: () => translate({id: 'assistant.modal.searchMissing', message: 'The search index did not load, so only the assistant is available.'}),
  modalDevIndexMissing: () => translate({id: 'assistant.modal.devIndexMissing', message: 'Keyword results need an index. Run npm run build once, then reload.'}),
  modalNoMatches: () => translate({id: 'assistant.modal.noMatches', message: 'No page matches those words. Ask the assistant instead.'}),
  modalSeeAll: (query) => translate({id: 'assistant.modal.seeAll', message: 'See all results for “{query}”'}, {query}),
  modalDevIndexStale: () => translate({id: 'assistant.modal.devIndexStale', message: 'Dev: index is from the last build.'}),
  shortcutMove: () => translate({id: 'assistant.shortcut.move', message: 'move'}),
  shortcutOpen: () => translate({id: 'assistant.shortcut.open', message: 'open'}),
  shortcutAskDirectly: () => translate({id: 'assistant.shortcut.askDirectly', message: 'ask directly'}),
  shortcutClose: () => translate({id: 'assistant.shortcut.close', message: 'close'}),
  shortcutSend: () => translate({id: 'assistant.shortcut.send', message: 'send'}),
  shortcutNewline: () => translate({id: 'assistant.shortcut.newline', message: 'newline'}),

  pageCopied: () => translate({id: 'assistant.page.copiedAnnouncement', message: 'Page copied as Markdown'}),
  pageCopyFailed: () => translate({id: 'assistant.page.copyFailedAnnouncement', message: 'Could not copy this page'}),
  pageAsk: () => translate({id: 'assistant.page.ask', message: 'Ask about this page'}),
  pageCopiedLabel: () => translate({id: 'assistant.page.copied', message: 'Copied'}),
  pageCopyFailedLabel: () => translate({id: 'assistant.page.copyFailed', message: 'Copy failed'}),
  pageCopy: () => translate({id: 'assistant.page.copy', message: 'Copy page'}),

  externalLink: () => translate({id: 'assistant.markdown.externalLink', message: ' (opens in a new tab)'}),
  codeText: () => translate({id: 'assistant.markdown.codeText', message: 'text'}),
  copyAfterAnswer: () => translate({id: 'assistant.markdown.copyAfterAnswer', message: 'Copy is available once the answer finishes'}),
  copyCodeLabel: (language) => translate({id: 'assistant.markdown.copyCodeLabel', message: 'Copy {language} to clipboard'}, {language}),
  copy: () => translate({id: 'assistant.markdown.copy', message: 'Copy'}),
  copied: () => translate({id: 'assistant.markdown.copied', message: 'Copied'}),

  errorRate: () => translate({id: 'assistant.error.rate', message: 'That is the question limit for now. Try again in a few minutes.'}),
  errorNetwork: () => translate({id: 'assistant.error.network', message: 'Connection lost.'}),
  errorUnavailable: () => translate({id: 'assistant.error.unavailable', message: 'AI assistant currently unavailable.'}),
  errorLabel: () => translate({id: 'assistant.error.label', message: 'Error'}),
  tryAgain: () => translate({id: 'assistant.error.tryAgain', message: 'Try again'}),

  lengthLimit: (count) => translate({id: 'assistant.notice.lengthLimit', message: 'That is longer than the {count} character limit. Try trimming it.'}, {count}),
  sessionLimit: () => translate({id: 'assistant.notice.sessionLimit', message: 'You have reached the question limit for this session. Reload the page to start a new one, or use the search box.'}),
  budgetDegraded: () => translate({id: 'assistant.notice.budgetDegraded', message: 'The assistant has used its budget for today, so here are the closest sections of the documentation instead.'}),
  budgetUnavailable: () => translate({id: 'assistant.notice.budgetUnavailable', message: 'The assistant is unavailable for the rest of today. The search box covers the same documentation.'}),
  noticeLabel: () => translate({id: 'assistant.notice.label', message: 'Notice'}),
  sectionLink: (number) => translate({id: 'assistant.notice.sectionLink', message: 'Documentation section {number}'}, {number}),

  announceWorking: () => translate({id: 'assistant.announce.working', message: 'Working on an answer'}),
  announceLimit: () => translate({id: 'assistant.announce.limit', message: 'Question limit reached for this session'}),
  announceDegraded: () => translate({id: 'assistant.announce.degraded', message: 'The assistant is over budget for today, showing documentation sections instead'}),
  announceUnavailable: () => translate({id: 'assistant.announce.unavailable', message: 'The assistant is unavailable'}),
  announceStopped: () => translate({id: 'assistant.announce.stopped', message: 'Answer stopped'}),
  announceFailed: () => translate({id: 'assistant.announce.failed', message: 'Could not generate an answer'}),
  announceConnectionLost: () => translate({id: 'assistant.announce.connectionLost', message: 'Connection lost'}),
  announceComplete: () => translate({id: 'assistant.announce.complete', message: 'Answer complete'}),
  announceCompleteSources: (count) => count === 1
    ? translate({id: 'assistant.announce.completeSource', message: 'Answer complete, 1 source'})
    : translate({id: 'assistant.announce.completeSources', message: 'Answer complete, {count} sources'}, {count}),

  dialogLabel: () => translate({id: 'assistant.panel.dialogLabel', message: 'Epic documentation assistant'}),
  title: () => translate({id: 'assistant.panel.title', message: 'Docs assistant'}),
  scopeLive: () => translate({id: 'assistant.panel.scopeLive', message: 'Answers from the Epic developer documentation, and it can check the live chain and the EpicCash repositories. It can be wrong, so check the linked section.'}),
  scopeDocs: () => translate({id: 'assistant.panel.scopeDocs', message: 'Answers from the Epic developer documentation, and it knows which page you are on. It can be wrong, so check the linked section.'}),
  close: () => translate({id: 'assistant.panel.close', message: 'Close the assistant'}),
  conversation: () => translate({id: 'assistant.panel.conversation', message: 'Conversation with the documentation assistant'}),
  emptyLead: () => translate({id: 'assistant.panel.emptyLead', message: 'Ask about the node, the wallet, epicbox, mining or the APIs.'}),
  youAsked: () => translate({id: 'assistant.panel.youAsked', message: 'You asked:'}),
  assistantAnswered: () => translate({id: 'assistant.panel.assistantAnswered', message: 'Assistant answered:'}),
  reading: () => translate({id: 'assistant.panel.reading', message: 'Reading the documentation'}),
  liveDataLabel: () => translate({id: 'assistant.panel.liveDataLabel', message: 'Live data checked for this answer'}),
  activityUnavailable: () => translate({id: 'assistant.panel.activityUnavailable', message: ' (unavailable)'}),
  stopped: () => translate({id: 'assistant.panel.stopped', message: 'Stopped. What arrived is above.'}),
  sourcesLabel: () => translate({id: 'assistant.panel.sourcesLabel', message: 'Sources for this answer'}),
  sources: () => translate({id: 'assistant.panel.sources', message: 'Sources'}),
  followups: () => translate({id: 'assistant.panel.followups', message: 'Follow-up suggestions'}),
  composerLabel: () => translate({id: 'assistant.panel.composerLabel', message: 'Ask a question about the Epic Cash developer documentation'}),
  composerPlaceholder: () => translate({id: 'assistant.panel.composerPlaceholder', message: 'Ask about Epic…'}),
  composerHint: () => translate({id: 'assistant.panel.composerHint', message: 'Press Enter to send, Shift plus Enter for a new line, Escape to close.'}),
  stopGenerating: () => translate({id: 'assistant.panel.stopGenerating', message: 'Stop generating'}),
  stop: () => translate({id: 'assistant.panel.stop', message: 'Stop'}),
  sendQuestion: () => translate({id: 'assistant.panel.sendQuestion', message: 'Send question'}),
  ask: () => translate({id: 'assistant.panel.ask', message: 'Ask'}),
  modelLabel: () => translate({id: 'assistant.panel.modelLabel', message: 'Which model answers your questions'}),
  questionsLeft: (count) => count === 1
    ? translate({id: 'assistant.panel.questionLeft', message: '1 question left'})
    : translate({id: 'assistant.panel.questionsLeft', message: '{count} questions left'}, {count}),
  footLive: () => translate({id: 'assistant.panel.footLive', message: 'Answers can be wrong, so verify against the linked page.'}),
  footDocs: () => translate({id: 'assistant.panel.footDocs', message: 'Answers are generated and can be wrong. Verify against the linked page.'}),

  modelNote: (id) => {
    if (id === 'opus-4-6') return translate({id: 'assistant.model.opus-4-6.note', message: 'Slower. Better at writing code.'});
    return translate({id: 'assistant.model.sonnet-4-6.note', message: 'Fast. Best for lookups.'});
  },

  toolActivity: (name) => {
    switch (name) {
      case 'epic_chain_status': return translate({id: 'assistant.tool.epic_chain_status', message: 'Checking the live Epic chain'});
      case 'epic_chain_window': return translate({id: 'assistant.tool.epic_chain_window', message: 'Measuring recent network difficulty'});
      case 'epic_block': return translate({id: 'assistant.tool.epic_block', message: 'Looking up an Epic block'});
      case 'epic_mempool': return translate({id: 'assistant.tool.epic_mempool', message: 'Checking the transaction pool'});
      case 'epic_node_peers': return translate({id: 'assistant.tool.epic_node_peers', message: 'Checking which node versions peers are running'});
      case 'epic_github_releases': return translate({id: 'assistant.tool.epic_github_releases', message: 'Checking EpicCash releases'});
      case 'epic_github_activity': return translate({id: 'assistant.tool.epic_github_activity', message: 'Checking recent EpicCash development activity'});
      case 'epic_github_repo': return translate({id: 'assistant.tool.epic_github_repo', message: 'Checking an EpicCash repository'});
      default: return translate({id: 'assistant.tool.default', message: 'Checking live data'});
    }
  },
};
