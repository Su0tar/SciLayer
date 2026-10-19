import {access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
console.log('SciLayer root:',root);console.log('Node:',process.version);
let failed=Number(process.versions.node.split('.')[0])<22;
for(const file of ['node_modules/@modelcontextprotocol/sdk/package.json','dist/index.html','dist-mcp/editor.html','skills/scilayer/SKILL.md']){
  try{await access(new URL('../'+file,import.meta.url));console.log('OK',file);}catch{failed=true;console.log('MISSING',file);}
}
try{const r=await fetch('http://127.0.0.1:4317/api/status',{signal:AbortSignal.timeout(1500)});const d=await r.json();console.log('Service:',d.application,d.version);if(!r.ok||d.application!=='figure-workbench')failed=true;}
catch{console.log('Service is stopped; MCP starts it on demand, or run npm start.');}
console.log('No image-generation API key is required for Codex built-in imagegen.');
process.exitCode=failed?1:0;
