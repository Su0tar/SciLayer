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
  function codex(argv,stdio='inherit'){
    const commandArgs=process.platform==='win32'?['-NoProfile','-Command','$codexArguments = @(ConvertFrom-Json $env:SCILAYER_INSTALL_ARGS); & codex.cmd @codexArguments; exit $LASTEXITCODE']:argv;
    return spawnSync(command,commandArgs,{stdio,encoding:'utf8',windowsHide:true,env:{...process.env,SCILAYER_INSTALL_ARGS:JSON.stringify(argv)}});
  }
  const result=codex(['mcp','add','scilayer','--',process.execPath,path.join(root,'mcp/server.mjs')]);
  if(result.error||result.status!==0)throw Error('MCP注册失败。确保Codex CLI已安装，或使用README的手动注册命令。');
  // Remove only the legacy registration that points to this checkout.
  const legacy=codex(['mcp','get','figure-workbench','--json'],'pipe');
  if(legacy.status===0){
    const old=JSON.parse(legacy.stdout);
    const pointsHere=old.transport?.args?.some(arg=>path.resolve(arg)===path.resolve(root,'mcp/server.mjs'));
    if(pointsHere){
      const removed=codex(['mcp','remove','figure-workbench']);
      if(removed.error||removed.status!==0)throw Error('SciLayer已注册，但旧MCP注册迁移失败。请重试安装。');
      console.log('Migrated legacy MCP registration to scilayer.');
    }else console.log('An unrelated legacy registration was left untouched.');
  }
}
await mkdir(parent,{recursive:true});
await cp(path.join(root,'skills/scilayer'),destination,{recursive:true});
console.log('SciLayer skill installed: '+destination);
console.log('Invoke $scilayer in Codex. Reload MCP / restart Codex if tools are not visible.');
