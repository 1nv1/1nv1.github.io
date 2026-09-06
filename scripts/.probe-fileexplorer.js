// Temporary probe: verify the file-explorer config builds /documents without error.
'use strict';
const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync('js/file-explorer.js', 'utf8');
const i0 = src.indexOf('const DOCUMENTS_MANIFEST');
const i1 = src.indexOf('let historyIndex = 0;');
if (i0 < 0 || i1 < 0 || i1 <= i0) { console.error('markers not found'); process.exit(1); }

const configBlock = src.slice(i0, i1);

const sandbox = { console, JSON };
vm.createContext(sandbox);
vm.runInContext('(function(){\n' + configBlock + '\n globalThis.__probe = ROOT.children.find(function(c){return c.name==="documents";});\n})();', sandbox);

const docsNode = sandbox.__probe;
if (!docsNode) { console.error('No /documents node found'); process.exit(1); }
console.log('documents node children:');
(docsNode.children || []).forEach(c => console.log('   ' + c.name + '  [' + c.type + ']  ->  ' + c.realPath));
console.log('OK — /documents built successfully with ' + docsNode.children.length + ' entries.');
