import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
const run=promisify(execFile);
const account='runtime_client_'+randomUUID();
const service='kodax-space-test-runtime';
const imported=await import('electron');
const electron=imported.default;
const script=path.join(os.tmpdir(),'alpha7-keyring-'+randomUUID()+'.cjs');
await writeFile(script,`const {app}=require('electron');process.on('unhandledRejection',()=>app.exit(1));process.stdout.write('electron-boot\\n');
app.whenReady().then(async()=>{ const keyring=require(${JSON.stringify(path.resolve('node_modules/@napi-rs/keyring/keytar.js'))});
await keyring.setPassword(process.argv[2],process.argv[3],'isolated-test-value');
process.stdout.write('electron-created\\n');app.quit(); });`);
async function stage(name,exe,args,env){
const start=Date.now();process.stdout.write(name+' start\n');
try{const result=await run(exe,args,{timeout:15000,killSignal:'SIGKILL',env:{...process.env,...env}});process.stdout.write(result.stdout);process.stdout.write(name+' done '+(Date.now()-start)+'ms\n');}
catch(e){process.stdout.write(e.stdout??'');process.stdout.write(name+' failed '+(Date.now()-start)+'ms code='+e.code+' killed='+e.killed+'\n');}
}
await stage('creator',electron,[script,service,account]);
await stage('node-delete',process.execPath,['--input-type=module','-e',"const m=await import('@napi-rs/keyring/keytar.js'); await (m.default??m).deletePassword(process.argv[1],process.argv[2]);",service,account]);
await stage('security-delete','/usr/bin/security',['delete-generic-password','-s',service,'-a',account]);
