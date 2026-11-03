import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test, { type TestContext } from 'node:test';
import { build } from 'esbuild';
import type { ChannelInput, ChannelOutput } from '@kodax-space/space-ipc-schema';

interface Fixture {
  show(input: ChannelInput<'notification.show'>): Promise<ChannelOutput<'notification.show'>>;
  state: {
    supported: boolean;
    mode: string;
    notification?: EventEmitter;
    clicks: unknown[];
    badgeRefreshes: number;
    windowCalls: string[];
  };
}

async function notificationFixture(t: TestContext): Promise<Fixture> {
  const directory = await mkdtemp(path.join(tmpdir(), 'space-native-notification-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const entry = fileURLToPath(new URL('./notification.ts', import.meta.url));
  const output = path.join(directory, 'fixture.mjs');
  const modules: Record<string, string> = {
    'fixture:state': `export const channels={};export const state={supported:true,mode:'failed',clicks:[],badgeRefreshes:0,windowCalls:[]};`,
    electron: `import{EventEmitter}from'node:events';import{state}from'fixture:state';
      export class Notification extends EventEmitter{
        static isSupported(){return state.supported}
        constructor(){super();if(state.mode==='constructor-throw')throw Error('Cannot create');state.notification=this}
        show(){if(state.mode==='throw')throw Error('Native failure');
          if(state.mode!=='pending')queueMicrotask(()=>this.emit(state.mode,'OS rejected delivery'))}
      }`,
    './register.js': `import{channels}from'fixture:state';export const registerChannel=(name,handler)=>channels[name]=handler;`,
    './push.js': `import{state}from'fixture:state';export const pushToRenderer=(channel,value)=>state.clicks.push({channel,value});`,
  };
  await build({
    stdin: {
      contents: `import{registerNotificationChannels,setNotificationWindowGetter}from${JSON.stringify(entry)};
      import{channels,state}from'fixture:state';
      setNotificationWindowGetter(()=>({isDestroyed:()=>false,isMinimized:()=>true,
        restore:()=>state.windowCalls.push('restore'),show:()=>state.windowCalls.push('show'),focus:()=>state.windowCalls.push('focus')}));
      registerNotificationChannels(()=>state.badgeRefreshes++);
      export{state};export const show=channels['notification.show'];`,
      resolveDir: directory,
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: output,
    logLevel: 'silent',
    sourcemap: 'inline',
    plugins: [
      {
        name: 'native-owners',
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, (args) =>
            args.path in modules ? { path: args.path, namespace: 'fixture' } : undefined,
          );
          builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
            contents: modules[args.path]!,
            loader: 'js',
          }));
        },
      },
    ],
  });
  return import(pathToFileURL(output).href) as Promise<Fixture>;
}

test('native notification delivery failure is returned instead of reporting a successful show', async (t) => {
  const fixture = await notificationFixture(t);
  assert.deepEqual(await fixture.show({ title: 'KodaX Space', body: 'Task complete' }), {
    shown: false,
    reason: 'failed',
  });
  assert.equal(fixture.state.badgeRefreshes, 0);
});

test('confirmed native delivery refreshes pending badges and retains the Session click target', async (t) => {
  const fixture = await notificationFixture(t);
  fixture.state.mode = 'show';
  assert.deepEqual(await fixture.show({ title: 'Space', body: 'Done', sessionId: 'session-1' }), {
    shown: true,
  });
  assert.equal(fixture.state.badgeRefreshes, 1);
  fixture.state.notification!.emit('click');
  assert.deepEqual(fixture.state.windowCalls, ['restore', 'show', 'focus']);
  assert.deepEqual(fixture.state.clicks, [
    { channel: 'notification.clicked', value: { sessionId: 'session-1' } },
  ]);
});

test('unsupported and synchronously failing native notifications return explicit outcomes', async (t) => {
  const fixture = await notificationFixture(t);
  fixture.state.supported = false;
  assert.deepEqual(await fixture.show({ title: 'Space', body: '' }), {
    shown: false,
    reason: 'unsupported',
  });
  fixture.state.supported = true;
  fixture.state.mode = 'throw';
  assert.deepEqual(await fixture.show({ title: 'Space', body: '' }), {
    shown: false,
    reason: 'failed',
  });
  fixture.state.mode = 'constructor-throw';
  assert.deepEqual(await fixture.show({ title: 'Space', body: '' }), {
    shown: false,
    reason: 'failed',
  });
});

test('an unconfirmed native request is bounded without reporting a visible notification', async (t) => {
  const fixture = await notificationFixture(t);
  fixture.state.mode = 'pending';
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let settled = false;
  const delivery = fixture.show({ title: 'Space', body: '' }).then((result) => {
    settled = true;
    return result;
  });
  t.mock.timers.tick(9_999);
  await Promise.resolve();
  assert.equal(settled, false);
  t.mock.timers.tick(1);
  assert.deepEqual(await delivery, { shown: false, reason: 'not_confirmed' });
  assert.equal(fixture.state.badgeRefreshes, 0);
  fixture.state.notification!.emit('failed');
  assert.equal(fixture.state.notification!.listenerCount('show'), 0);
  assert.equal(fixture.state.notification!.listenerCount('failed'), 0);
});

test('a late permission grant refreshes the badge once after IPC confirmation expires', async (t) => {
  const fixture = await notificationFixture(t);
  fixture.state.mode = 'pending';
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const delivery = fixture.show({ title: 'Space', body: '' });
  t.mock.timers.tick(10_000);
  assert.deepEqual(await delivery, { shown: false, reason: 'not_confirmed' });
  fixture.state.notification!.emit('show');
  fixture.state.notification!.emit('show');
  assert.equal(fixture.state.badgeRefreshes, 1);
});
