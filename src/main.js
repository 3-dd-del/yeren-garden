import { createCampusScene } from './scene.js';
import { getTimeDescription } from './time.js';
const icons = __ICONS__;
for (const node of document.querySelectorAll('[data-icon]')) node.innerHTML = icons[node.dataset.icon] || '';
const slider = document.querySelector('#time-slider');
const page = document.querySelector('#campus-page');
const container = document.querySelector('#scene-stage');
const loading = document.querySelector('#scene-loading');
const loadingLabel = document.querySelector('#loading-label');
const errorPanel = document.querySelector('#scene-error');
const toast = document.querySelector('#toast');
const presets = [...document.querySelectorAll('[data-time]')];
let campus;
let minutes = Number(slider.value);
let toastTimer;
let loadingScene = false;

function updateTime(value) {
  minutes = Math.max(0, Math.min(1439, Math.round(Number(value))));
  const state = getTimeDescription(minutes);
  slider.value = String(minutes);
  slider.setAttribute('aria-valuetext', state.spoken);
  document.querySelector('#current-time').textContent = state.time;
  document.querySelector('#current-time').setAttribute('datetime', state.time);
  document.querySelector('#period-label').textContent = state.label;
  document.querySelector('#thumb-time').textContent = state.time;
  document.querySelector('#timeline-thumb-guide').style.left = `${minutes / 1439 * 100}%`;
  page.dataset.period = state.period;
  for (const preset of presets) {
    const selected = Number(preset.dataset.time) === minutes;
    preset.classList.toggle('is-active', selected);
    preset.setAttribute('aria-pressed', String(selected));
  }
  campus?.setTime(minutes);
}
const timePanel=document.querySelector('#campus-time');
const orbitHelp=document.querySelector('.orbit-help');
const hideTimePanel=document.querySelector('#hide-time-panel');
const showTimePanel=document.querySelector('#show-time-panel');
function setTimePanelVisible(visible,{focus=false}={}){
  timePanel.hidden=!visible;
  orbitHelp.hidden=!visible;
  showTimePanel.hidden=visible;
  page.dataset.timelineHidden=String(!visible);
  hideTimePanel.setAttribute('aria-expanded',String(visible));
  showTimePanel.setAttribute('aria-expanded',String(visible));
  if(focus)(visible?slider:showTimePanel).focus({preventScroll:true});
}
hideTimePanel.addEventListener('click',()=>setTimePanelVisible(false,{focus:true}));
showTimePanel.addEventListener('click',()=>setTimePanelVisible(true,{focus:true}));
timePanel.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();setTimePanelVisible(false,{focus:true});}
});
document.querySelector('.skip-link').addEventListener('click',event=>{event.preventDefault();setTimePanelVisible(true,{focus:true});});
slider.addEventListener('input', event => updateTime(event.target.value));
for (const button of presets) button.addEventListener('click', () => updateTime(button.dataset.time));

function notify(text) {
  clearTimeout(toastTimer);
  toast.textContent = text;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4500);
}
async function loadFileModelData() {
  if (location.protocol !== 'file:' || window.__CAMPUS_MODEL_BASE64__) return;
  await new Promise((resolve, reject) => {
    const script=document.createElement('script');
    script.src=new URL('./assets/campus-model.js',document.baseURI).href;
    script.onload=resolve;
    script.onerror=()=>reject(new Error('本地模型数据载入失败。'));
    document.head.appendChild(script);
  });
}
async function loadScene() {
  if (loadingScene) return;
  loadingScene = true;
  campus?.dispose();
  campus = null;
  loading.hidden = false;
  errorPanel.hidden = true;
  loadingLabel.textContent = '正在走进校园…';
  container.dataset.ready = 'false';
  document.querySelectorAll('[data-scene-action]').forEach(button=>button.disabled=true);
  try {
    await loadFileModelData();
    campus = await createCampusScene(container, { initialMinutes: minutes, onProgress: percent => {
      loadingLabel.textContent = percent < 100 ? `正在走进校园 · ${percent}%` : '正在点亮校园…';
    }});
    loading.hidden = true;
    container.dataset.ready = 'true';
    updateTime(minutes);
    document.querySelectorAll('[data-scene-action]').forEach(button=>button.disabled=false);

  } catch (error) {
    console.error('Campus scene loading failed:', error);
    loading.hidden = true;
    errorPanel.hidden = false;
    const webglError = /WebGL|context/i.test(String(error));
    document.querySelector('#error-description').textContent = webglError
      ? '浏览器暂时无法创建三维画面，请开启硬件加速或使用支持 WebGL 的浏览器后重试。'
      : '三维模型未能载入，请确认通过本地服务打开页面后重试。';
  } finally { loadingScene = false; }
}
document.querySelector('#retry-button').addEventListener('click', loadScene);
container.addEventListener('campus-context-lost', () => {
  errorPanel.hidden = false;
  document.querySelector('#error-description').textContent = '三维画面连接已中断，点击重新加载即可恢复。';
  container.dataset.ready = 'false';
});
const tabs=[...document.querySelectorAll('[role="tab"]')];
for(const button of document.querySelectorAll('[data-floor]'))button.addEventListener('click',()=>campus?.setFloor(button.dataset.floor));
container.addEventListener('campus-floor-change',event=>{for(const button of document.querySelectorAll('[data-floor]'))button.setAttribute('aria-pressed',String(button.dataset.floor===event.detail.level));});
const hero=document.querySelector('.hero-copy');
page.dataset.view='campus';
function activateTab(view,{focus=false}={}){
  if(page.dataset.inspecting==='true')campus?.resetView();
  page.dataset.view=view;
  if(view==='time')setTimePanelVisible(true);
  for(const tab of tabs){const selected=tab.dataset.view===view;tab.classList.toggle('is-current',selected);tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;}
  for(const [id,active] of [['panorama-copy',view==='campus'],['time-copy',view==='time']]){const el=document.getElementById(id);el.inert=!active;el.setAttribute('aria-hidden',String(!active));}
  if(focus)slider.focus({preventScroll:true});
}
for(const tab of tabs){
  tab.addEventListener('click',()=>activateTab(tab.dataset.view));
  tab.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const view=event.key==='Home'?'campus':event.key==='End'?'time':tab.dataset.view==='campus'?'time':'campus';activateTab(view);tabs.find(t=>t.dataset.view===view).focus();});
}
document.querySelector('a[href="#campus-time"]').addEventListener('click',event=>{event.preventDefault();activateTab('time',{focus:true});});
document.querySelector('#focus-timeline').addEventListener('click',()=>setTimePanelVisible(true,{focus:true}));
document.querySelector('#inspect-interior').addEventListener('click',()=>campus?.inspectInterior());
document.querySelector('#reset-view').addEventListener('click',()=>campus?.resetView());
for(const button of document.querySelectorAll('[data-roof-mode]'))button.addEventListener('click',()=>campus?.setRoofMode(button.dataset.roofMode));
container.addEventListener('campus-inspection-change',event=>{
  page.dataset.inspecting=String(event.detail.active);hero.inert=event.detail.active;
  document.querySelector('.inspection-caption').hidden=!event.detail.active;
});
container.addEventListener('campus-roof-change',event=>{
  const modes=Object.values(event.detail.state),allSame=modes.every(mode=>mode===modes[0]);
  for(const button of document.querySelectorAll('[data-roof-mode]'))button.setAttribute('aria-pressed',String(allSame&&button.dataset.roofMode===modes[0]));
  const hidden=Object.entries(event.detail.state).filter(([,mode])=>mode==='hidden').map(([id])=>({east:'东翼',west:'西翼',entry:'门厅'}[id]));
  document.querySelector('#roof-state-note').textContent=hidden.length?hidden.join('、')+'屋顶已隐藏 · 点击「完整」恢复':modes.includes('lifted')?'屋顶已抬升 · 可拖动环绕查看梁柱屋架':'点击任一屋顶，即可隐藏并查看内部';
});
const fullscreen = document.querySelector('#fullscreen-button');
fullscreen.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else notify('当前浏览器不支持全屏，可使用浏览器的全屏快捷键。');
  } catch { notify('当前环境未能进入全屏，可使用浏览器的全屏快捷键。'); }
});
document.addEventListener('fullscreenchange', () => {
  const active = !!document.fullscreenElement;
  document.querySelector('#fullscreen-label').textContent = active ? '退出全屏' : '全屏观看';
  fullscreen.setAttribute('aria-label', active ? '退出全屏' : '全屏观看校园');
  fullscreen.querySelector('[data-icon]').innerHTML = icons[active ? 'minimize' : 'maximize'];
});
updateTime(minutes);
loadScene();


