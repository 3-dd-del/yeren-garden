// Art-directed lighting keyframes, not a geographical solar simulation.
// The 24:00 endpoint repeats 00:00 so interpolation remains continuous at midnight.
const KEYS = [
  { h: 0, top:'#111a32', middle:'#29354d', horizon:'#655067', cloud:'#1c263e', edge:'#66586f', skyLight:'#8e9bbd', groundLight:'#333240', fog:'#3d3c50', sunColor:'#b0bdde', sun:.03, ambient:.67, fill:.36, exposure:1.03, lights:1.7, night:1, day:0 },
  { h: 4.5, top:'#202c46', middle:'#6b6881', horizon:'#b79aa0', cloud:'#444b65', edge:'#b491a3', skyLight:'#a1accb', groundLight:'#44424e', fog:'#676073', sunColor:'#e1bad2', sun:.1, ambient:.92, fill:.42, exposure:1.08, lights:1.2, night:.55, day:.1 },
  { h: 6, top:'#58647e', middle:'#baa0aa', horizon:'#efc5a4', cloud:'#77788c', edge:'#e7b5a2', skyLight:'#d6cfdb', groundLight:'#63554e', fog:'#b9a0a6', sunColor:'#ffd7ad', sun:.9, ambient:1.65, fill:.48, exposure:1.03, lights:.35, night:0, day:.4 },
  { h: 8, top:'#7292b4', middle:'#a7c1ce', horizon:'#d8d6c4', cloud:'#a3b2bd', edge:'#dfd9c9', skyLight:'#cfdded', groundLight:'#6f6d57', fog:'#b8c9cf', sunColor:'#ffebcd', sun:2.3, ambient:2.15, fill:.49, exposure:.95, lights:.02, night:0, day:1 },
  { h: 12, top:'#638cab', middle:'#acc8d5', horizon:'#e0dcd0', cloud:'#a9bdca', edge:'#efebe0', skyLight:'#d6e4f2', groundLight:'#747057', fog:'#b5c4cb', sunColor:'#fff2dc', sun:2.6, ambient:2.3, fill:.5, exposure:.92, lights:0, night:0, day:1 },
  { h: 16.5, top:'#7785a1', middle:'#b4a5af', horizon:'#eac4a5', cloud:'#89869b', edge:'#d8b6b1', skyLight:'#c5cada', groundLight:'#63594f', fog:'#b2a0a9', sunColor:'#ffd0a7', sun:1.6, ambient:1.78, fill:.43, exposure:.98, lights:.08, night:0, day:.7 },
  { h: 18.3333333333, top:'#41445b', middle:'#9b7d92', horizon:'#efac8b', cloud:'#56526a', edge:'#d3a0a5', skyLight:'#a9b0c9', groundLight:'#4c414c', fog:'#957984', sunColor:'#ffa974', sun:.78, ambient:1.34, fill:.4, exposure:1.07, lights:1.15, night:.06, day:.18 },
  { h: 19.5, top:'#262b46', middle:'#635d7d', horizon:'#bc8290', cloud:'#3f3d59', edge:'#976a87', skyLight:'#969fc0', groundLight:'#3a3447', fog:'#635674', sunColor:'#f1a2a0', sun:.08, ambient:.85, fill:.37, exposure:1.08, lights:1.7, night:.4, day:0 },
  { h: 21.5, top:'#141e35', middle:'#32415d', horizon:'#6d617a', cloud:'#243149', edge:'#6c647d', skyLight:'#919fc2', groundLight:'#343644', fog:'#4c4e68', sunColor:'#b2c3e3', sun:.025, ambient:.69, fill:.36, exposure:1.06, lights:1.8, night:1, day:0 },
  { h: 24, top:'#111a32', middle:'#29354d', horizon:'#655067', cloud:'#1c263e', edge:'#66586f', skyLight:'#8e9bbd', groundLight:'#333240', fog:'#3d3c50', sunColor:'#b0bdde', sun:.03, ambient:.67, fill:.36, exposure:1.03, lights:1.7, night:1, day:0 },
];
const colorKeys = ['top', 'middle', 'horizon', 'cloud', 'edge', 'skyLight', 'groundLight', 'fog', 'sunColor'];
function colorMix(a, b, amount) {
  const channels = [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i+2), 16) * (1-amount) + parseInt(b.slice(i, i+2), 16) * amount).toString(16).padStart(2,'0'));
  return '#' + channels.join('');
}
export function sampleTime(minutes) {
  const h = Math.max(0, Math.min(1440, minutes)) / 60;
  let end = KEYS.findIndex(key => key.h > h);
  if (end < 0) end = KEYS.length - 1;
  end = Math.max(1, end);
  const a = KEYS[end - 1], b = KEYS[end];
  let amount = (h-a.h) / (b.h-a.h);
  amount = amount * amount * (3-2*amount);
  const state = {};
  for (const key of Object.keys(a)) {
    state[key] = colorKeys.includes(key) ? colorMix(a[key], b[key], amount) : a[key] + (b[key] - a[key]) * amount;
  }
  return state;
}
export function getTimeDescription(minutes) {
  const safe = Math.max(0, Math.min(1439, Math.round(minutes)));
  const hours = Math.floor(safe / 60), remainder = safe % 60;
  const time = `${String(hours).padStart(2,'0')}:${String(remainder).padStart(2,'0')}`;
  const period = hours < 5 ? 'night' : hours < 8 ? 'morning' : hours < 17 ? 'day' : hours < 19 ? 'sunset' : 'night';
  const label = { night:'灯火入夜', morning:'清晨初光', day:'日光正好', sunset:'日落时分' }[period];
  return { time, hours, minutes: remainder, period, label, spoken: `${hours}点${remainder}分，${label}` };
}
