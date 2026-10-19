import {cp,mkdir,readFile,access} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2),at=args.indexOf('--skills-dir');
if(at>=0&&!args[at+1])throw Error('--skills-dir requires a directory');
const parent=at>=0?path.resolve(args[at+1]):path.join(os.homedir(),'.agents','skills');
const destination=path.join(parent,'scilayer');
try {
  const existing=await readFile(path.join(destination,'SKILL.md'),'utf8');
  if(!existing.includes('name: scilayer')||!existing.includes('# SciLayer'))throw Error('目标目录包含其他技能，拒绝覆盖：'+destination);
}catch(e){if(e.code!=='ENOENT')throw e;}
if(!args.includes('--skill-only')) {
  await access(path.join(root,'node_modules/@modelcontextprotocol/sdk/package.json'));
  await access(path.join(root,'dist-mcp/editor.html'));
  // Paths are passed as environment values, never interpolated into shell code.
  const command=process.platform==='win32'?'powershell.exe':'codex';
  const registration=['mcp','add','figure-workbench','--',process.execPath,path.join(root,'mcp/server.mjs')];
  const commandArgs=process.platform==='win32'?['-NoProfile','-Command','& codex.cmd mcp add figure-workbench -- $env:SCILAYER_INSTALL_NODE $env:SCILAYER_INSTALL_MCP; exit $LASTEXITCODE']:registration;
  const result=spawnSync(command,commandArgs,{stdio:'inherit',windowsHide:true,env:{...process.env,SCILAYER_INSTALL_NODE:process.execPath,SCILAYER_INSTALL_MCP:path.join(root,'mcp/server.mjs')}});
  if(result.error||result.status!==0)throw Error('MCP注册失败。确保Codex CLI已安装，或使用README的手动注册命令。');
}
await mkdir(parent,{recursive:true});
await cp(path.join(root,'skills/scilayer'),destination,{recursive:true});
console.log('SciLayer skill installed: '+destination);
console.log('Invoke $scilayer in Codex. Reload MCP / restart Codex if tools are not visible.');
