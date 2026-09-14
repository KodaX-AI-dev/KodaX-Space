import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const browserPath = [
  chromium.executablePath(),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync);
test(
  'Settings installs and cancels a component without starting account onboarding; hidden panel does not probe',
  { skip: !browserPath },
  async (t) => {
    const output = await build({
      stdin: {
        resolveDir: fileURLToPath(new URL('.', import.meta.url)),
        loader: 'tsx',
        contents: `
      import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
      import {I18nProvider} from '../../i18n/I18nProvider.tsx';
      import {ConnectorComponentsPanel} from './ConnectorComponentsPanel.tsx';
      window.calls=[];let component={id:'feishu-cli',version:'1.0.92',state:'missing'};
      window.kodaxSpace={on:()=>()=>{},invoke:async(channel,input)=>{
        window.calls.push({channel,input});
        if(channel==='settings.get')return {ok:true,data:{languageMode:'en-US',effectiveLocale:'en-US'}};
        if(channel==='partner.components.list')return {ok:true,data:{components:[component,{id:'wecom-cli',version:'1.2.0',state:'unsupported'}]}};
        if(channel==='partner.components.install'){component={...component,state:'installing'};return {ok:true,data:{component}};}
        if(channel==='partner.components.cancel'){component={...component,state:'cancelled'};return {ok:true,data:{component}};}
        throw new Error('Unexpected '+channel);
      }};
      function App(){const [active,setActive]=useState(false);return <><button onClick={()=>setActive(!active)}>Settings</button><ConnectorComponentsPanel active={active}/></>}
      createRoot(document.getElementById('root')).render(<I18nProvider><App/></I18nProvider>);
    `,
      },
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'iife',
      jsx: 'automatic',
      define: { 'import.meta.env': '{}' },
    });
    const browser = await chromium.launch({ executablePath: browserPath, headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage({ locale: 'en-US' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('http://components.test/', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
    );
    await page.goto('http://components.test/');
    await page.addScriptTag({ content: output.outputFiles[0].text });
    await page.getByRole('button', { name: 'Settings', exact: true }).waitFor();
    assert.equal(
      await page.evaluate(
        () =>
          Reflect.get(window, 'calls').filter((call: { channel: string }) =>
            call.channel.startsWith('partner.components'),
          ).length,
      ),
      0,
    );
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const feishu = page.getByTestId('component-feishu-cli');
    await feishu.getByRole('button', { name: 'Install' }).click();
    await feishu.getByRole('button', { name: 'Cancel' }).click();
    await feishu.getByText('Cancelled', { exact: true }).waitFor();
    assert.equal(await page.getByTestId('component-wecom-cli').getByRole('button').count(), 0);
    const calls = (await page.evaluate(() => Reflect.get(window, 'calls'))) as {
      channel: string;
    }[];
    assert.equal(calls.filter((call) => call.channel === 'partner.components.install').length, 1);
    assert.equal(calls.filter((call) => call.channel.startsWith('partner.connectors.')).length, 0);
    assert.deepEqual(errors, []);
  },
);
