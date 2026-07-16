import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const outputRoot=path.resolve('outputs','complete-parity-task-06');
const profileRoot=path.resolve('outputs','.visual-profile-task-06');
const port=9326, serverPort=4176;
await mkdir(outputRoot,{recursive:true});await mkdir(profileRoot,{recursive:true});
const browser=spawn(edge,['--headless=new','--disable-extensions','--disable-background-networking',`--remote-debugging-port=${port}`,`--user-data-dir=${profileRoot}`,'--window-size=1440,1000',`http://127.0.0.1:${serverPort}/scripts/fixtures/task06.html?section=transcription`],{stdio:'ignore',windowsHide:true});
try{
 const page=await waitForPage();const socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});
 let nextId=0;const pending=new Map();socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(!message.id)return;const waiter=pending.get(message.id);if(!waiter)return;pending.delete(message.id);message.error?waiter.reject(new Error(message.error.message)):waiter.resolve(message.result)});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))});
 await send('Page.enable');await send('Runtime.enable');await settle(send,'.settings-workspace');
 await click(send,'在线模式');await capture(send,'stt-online.png');await click(send,'新增转写服务');await click(send,'服务商');await capture(send,'stt-custom-provider-open.png');
 await send('Page.navigate',{url:`http://127.0.0.1:${serverPort}/scripts/fixtures/task06.html?section=ai`});await settle(send,'.settings-workspace');await capture(send,'ai-services.png');await click(send,'新增 AI 服务');await click(send,'服务商');await send('Runtime.evaluate',{expression:"document.querySelector('[role=listbox]')?.scrollIntoView({block:'center'})"});await delay(180);await capture(send,'ai-custom-provider-open.png');socket.close();
}finally{browser.kill()}
async function click(send,text){await send('Runtime.evaluate',{expression:`[...document.querySelectorAll('button')].find(node=>node.getAttribute('aria-label')===${JSON.stringify(text)}||node.textContent?.trim()===${JSON.stringify(text)})?.click()`});await delay(300)}
async function settle(send,selector){for(let i=0;i<50;i++){const result=await send('Runtime.evaluate',{expression:`Boolean(document.querySelector(${JSON.stringify(selector)}))`,returnByValue:true});if(result.result?.value){await send('Runtime.evaluate',{expression:"document.head.insertAdjacentHTML('beforeend','<style>*{animation:none!important;transition:none!important}</style>')"});await delay(700);return}await delay(100)}throw new Error(`Missing ${selector}`)}
async function capture(send,name){await send('Emulation.setDeviceMetricsOverride',{width:1439,height:1000,deviceScaleFactor:1,mobile:false});await delay(80);await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await delay(180);const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});await writeFile(path.join(outputRoot,name),Buffer.from(data,'base64'))}
async function waitForPage(){let lastError;for(let i=0;i<50;i++){try{const response=await fetch(`http://127.0.0.1:${port}/json/list`);const pages=await response.json();const page=pages.find(entry=>entry.type==='page'&&entry.url.includes('/scripts/fixtures/task06.html'));if(page)return page}catch(error){lastError=error}await delay(100)}throw lastError??new Error('No Edge fixture target')}
function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
