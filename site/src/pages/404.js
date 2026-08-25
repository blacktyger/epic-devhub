/**
 * The /404.html route, which is the file a static server returns for an unknown path.
 *
 * One line on purpose. The page itself is src/theme/NotFound/index.js, shadowing @theme/NotFound,
 * because the client-side router sends unmatched locations there rather than here. When the two
 * were different components the served HTML was replaced during hydration by the stock Docusaurus
 * not-found page; see the comment in the theme file.
 */
export {default} from '@theme/NotFound';
