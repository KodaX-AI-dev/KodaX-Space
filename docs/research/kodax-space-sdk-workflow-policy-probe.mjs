import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const sdkRoot = 'C:/Works/GitProj/KodaX-AI/KodaX';
const entry = (name) => pathToFileURL(path.join(sdkRoot, 'dist', `sdk-${name}.js`)).href;
const { connectKodaXClient } = await import(entry('client'));
const { createKodaXRuntime } = await import(entry('runtime'));
const { KodaXBaseProvider, registerModelProvider } = await import(entry('llm'));
const parent = path.resolve('scratch/workflow-host-audit');
await mkdir(parent, { recursive: true });
const homeDir = await mkdtemp(path.join(parent, 'public-'));
const providerName = 'space-workflow-audit';
const sequential = `async function run(wf) {
  const a = await wf.runAgent({name:'one',prompt:'CHILD-FIXTURE one',readOnly:true});
  const b = await wf.runAgent({name:'two',prompt:'CHILD-FIXTURE two',readOnly:true});
  return {synthesis:a.finalText+b.finalText};
}`;
const parallel = `async function run(wf) {
  const results = await wf.parallel(wf.args.names.map(name =>
    async () => await wf.runAgent({name,prompt:'CHILD-FIXTURE '+name,readOnly:true})));
  return {synthesis:results.filter(Boolean).map(row=>row.finalText).join(' ')};
}`;
const manifest = {name:'space-workflow-audit',description:'Read offline evidence',readOnly:true,
  maxAgents:8,maxConcurrency:8,tokenBudget:1000,phases:['inspect'],patterns:['fan-out-and-synthesize']};
let policy, outputTokens = 2, active = 0, peak = 0, childCalls = 0;
class Provider extends KodaXBaseProvider {
  name = providerName;
  supportsThinking = false;
  config = {apiKeyEnv:'SPACE_WORKFLOW_AUDIT_KEY',model:'fixture',supportsThinking:false};
  async stream(messages, tools) {
    try { return await this.respond(messages, tools); }
    catch (error) { (evidence.fixtureErrors ??= []).push({ message: error.message, stack: error.stack }); throw error; }
  }
  async respond(messages, tools) {
    const learningTool = tools.find(tool => tool.name.includes('learning') && tool.name.includes('review'));
    if (learningTool) return {textBlocks:[],thinkingBlocks:[],toolBlocks:[{type:'tool_use',id:randomUUID(),name:learningTool.name,
      input:{memoryPlan:{actions:[],warnings:[]},capabilityDecision:{disposition:'discard'}}}],stopReason:'tool_use'};
    const index = messages.findLastIndex(message => message.role === 'user' &&
      (typeof message.content === 'string' || !message.content.some(block => block.type === 'tool_result')));
    const latest = messages[index];
    const results = messages.slice(index+1).flatMap(message => Array.isArray(message.content)
      ? message.content.filter(block=>block.type === 'tool_result') : []);
    if (JSON.stringify(latest).includes('ROOT-WORKFLOW-FIXTURE')) {
      const name = results.length === 0 ? 'tool_search' : 'run_workflow';
      if (results.length < 2 && tools.some(tool=>tool.name === name)) return {
        textBlocks:[],thinkingBlocks:[],stopReason:'tool_use',
        toolBlocks:[{type:'tool_use',id:randomUUID(),name,input:name==='tool_search'
          ? {query:'run_workflow'} : {manifest,source:sequential}}],
        usage:{inputTokens:10,outputTokens:0,totalTokens:10},
      };
    } else if (JSON.stringify(messages).includes('CHILD-FIXTURE') && tools.some(tool=>tool.name==='read')) {
      childCalls++; active++; peak=Math.max(peak,active);
      try { await new Promise(resolve=>setTimeout(resolve,150)); } finally { active--; }
    }
    return {textBlocks:[{type:'text',text:'Offline evidence checked.'}],thinkingBlocks:[],toolBlocks:[],stopReason:'end_turn',
      usage:{inputTokens:10,outputTokens,totalTokens:10+outputTokens}};
  }
}
process.env.SPACE_WORKFLOW_AUDIT_KEY='offline-fixture';
delete process.env.KODAX_WORKFLOW_MAX_CONCURRENCY;
const unregister = registerModelProvider(providerName,()=>new Provider());
let runtime, client;
const evidence = {source:'current worktree rebuilt public dist entries',cases:[]};
try {
  runtime = await createKodaXRuntime({mode:'daemon',homeDir,profile:'space-workflow-audit',defaultProvider:providerName,
    externalAgents:{factories:[],policy:()=>({allowed:false})}});
  evidence.authorizationCapability = runtime.capabilities.productExecutionAuthorization;
  client = await connectKodaXClient({homeDir,profile:'space-workflow-audit',
    async authorizeExecution(request) { assert.ok(request.input.sessionId); return policy ? {workflowHostPolicy:policy} : undefined; }});
  const session = async (mode='sa') => {
    const created=await client.sessions.create({projectPath:homeDir});
    await client.sessions.updateSettings(created.id,{provider:providerName,agentMode:mode,permissionMode:'full-access'});
    return created.id;
  };
  const launch = async (sessionId, source=sequential, override={}) => {
    evidence.stage={kind:'declarative',sessionId,policy};
    const started=await client.workflows.start({sessionId,projectRoot:homeDir,args:{names:['one','two']},source:{kind:'inline',manifest,source},...override});
    assert.equal(started.kind,'started');
    evidence.stage.runId=started.runId;
    const outcome=await client.runs.await(started.runId);
    const process=(await client.workflows.list({runId:started.runId}))[0];
    return {outcome,process};
  };
  policy={maxAgents:1};
  let result=await launch(await session(),sequential,{authorization:{workflowHostPolicy:{maxAgents:8}},workflowHostPolicy:{maxAgents:8}});
  assert.equal(result.process.totalSpawned,1); assert.equal(result.process.status,'failed');
  evidence.cases.push({name:'Main ceiling survives Renderer forgery',spawned:result.process.totalSpawned});
  policy={tokenBudget:1};
  result=await launch(await session());
  assert.equal(result.process.totalSpawned,1); assert.match(result.process.error,/tokenBudget/);
  evidence.cases.push({name:'output budget blocks subsequent work',spawned:result.process.totalSpawned});
  outputTokens=0;
  result=await launch(await session());
  assert.equal(result.process.totalSpawned,2); assert.equal(result.process.status,'completed');
  evidence.cases.push({name:'known zero output does not spend input tokens',spawned:result.process.totalSpawned});
  outputTokens=2; policy={maxAgents:1}; childCalls=0;
  result=await launch(await session(),parallel);
  assert.equal(result.process.totalSpawned,1); assert.equal(childCalls,1);
  evidence.cases.push({name:'parallel admissions reserve lifetime Agent slots',spawned:result.process.totalSpawned,childCalls});
  policy=undefined; peak=0;
  await client.config.patch({workflow:{maxConcurrency:1}});
  result=await launch(await session(),parallel);
  assert.equal(result.process.totalSpawned,2); assert.equal(peak,1);
  evidence.cases.push({name:'existing Host concurrency config is effective',peak});
  const sid=await session('ama');
  const input={sessionId:sid,inputId:randomUUID(),text:'ROOT-WORKFLOW-FIXTURE: use a Workflow to inspect offline evidence.'};
  const accepted=await client.inputs.submit(input);
  assert.equal(accepted.state,'submitted');
  const outcome=await client.runs.await(accepted.runId);
  assert.equal(outcome.phase,'completed');
  const tools=(await client.statistics.readTools(sid)).items;
  assert.ok(tools.some(tool=>tool.name==='run_workflow' && tool.state==='completed'));
  const history=await client.sessions.readHistory(sid);
  assert.deepEqual(history.items.filter(item=>item.type==='user').map(item=>[item.inputId,item.text]),[[input.inputId,input.text]]);
  assert.ok((await client.workflows.list()).every(row=>path.resolve(row.runDir).startsWith(path.join(homeDir,'.kodax','workflow-runs')+path.sep)));
  evidence.cases.push({name:'Product AMA Workflow uses Host directory and preserves canonical input identity'});
  evidence.success=true;
} catch(error) {
  evidence.success=false; evidence.error={name:error.name,code:error.code,message:error.message,stack:error.stack};
} finally {
  await client?.disconnect(); await runtime?.close(); unregister();
}
await writeFile(path.join(parent,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
process.stdout.write(JSON.stringify(evidence,null,2)+'\n');
process.exitCode=evidence.success?0:1;
