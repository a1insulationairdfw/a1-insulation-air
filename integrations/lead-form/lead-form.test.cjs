const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const backend = fs.readFileSync(__dirname + '/Code.gs', 'utf8');
const loader = fs.readFileSync(__dirname + '/../../assets/lead-form.js', 'utf8');

function service() {
  const rows = [['headers']];
  const props = {SHEET_ID:'test-sheet',TOKEN_SECRET:'test-secret',NOTIFY_EMAIL:'owner@example.invalid'};
  const state = {emails:0, failMail:false, locked:false};
  const sheet = {
    getLastRow:()=>rows.length,
    appendRow:row=>rows.push(row),
    getParent:()=>({getUrl:()=> 'https://docs.google.com/spreadsheets/d/test'}),
    getRange:(row,col,height,width)=>({
      getValues:()=>rows.slice(row-1,row-1+height).map(r=>r.slice(col-1,col-1+width)),
      setValues:values=>values.forEach((v,i)=>v.forEach((cell,j)=>rows[row-1+i][col-1+j]=cell)),
      createTextFinder:value=>({matchEntireCell:()=>({findNext:()=>rows.some(r=>r[1]===value)?{}:null})})
    })
  };
  const context = vm.createContext({
    Date, console,
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v})},
    Utilities:{
      computeHmacSha256Signature:(data,secret)=>crypto.createHmac('sha256',secret).update(data).digest(),
      base64EncodeWebSafe:bytes=>Buffer.from(bytes).toString('base64url'),
      formatDate:()=> '2026-10-12'
    },
    SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet}),flush:()=>{}},
    LockService:{getScriptLock:()=>({waitLock:()=>{assert.equal(state.locked,false);state.locked=true},releaseLock:()=>state.locked=false})},
    MailApp:{getRemainingDailyQuota:()=>state.failMail?0:100,sendEmail:()=>{state.emails++}}
  });
  vm.runInContext(backend, context);
  function input() {
    const id = crypto.randomUUID(), issuedAt = Date.now()-3000;
    return {name:'Test customer',phone:'4695550100',email:'',city:'Dallas',service:'HVAC repair',preferred:'',details:'TEST ONLY',website:'',
      context:{requestId:id,issuedAt,signature:context.signature_(id,issuedAt),utm_source:'a1_test',utm_medium:'qa',utm_campaign:'test',referrer_host:'',landing_path:'/a1-insulation-air/'}};
  }
  return {context,rows,state,input};
}

test('confirmed save persists once and notifies once on a repeated request',()=>{
  const s=service(), input=s.input();
  assert.equal(s.context.submitServiceRequest(input).saved,true);
  assert.equal(s.context.submitServiceRequest(input).saved,true);
  assert.equal(s.rows.length,2);
  assert.equal(s.state.emails,1);
  assert.equal(s.rows[1][14],'Sent');
});
test('invalid phone, forged token, and honeypot never save or notify',()=>{
  for(const mutate of [i=>i.phone='12',i=>i.context.signature='fake',i=>i.website='spam']) {
    const s=service(), input=s.input();mutate(input);
    assert.throws(()=>s.context.submitServiceRequest(input));
    assert.equal(s.rows.length,1);assert.equal(s.state.emails,0);
  }
});
test('email quota failure preserves a saved request and timer later notifies',()=>{
  const s=service();s.state.failMail=true;
  assert.equal(s.context.submitServiceRequest(s.input()).saved,true);
  assert.equal(s.rows[1][14],'Pending');assert.equal(s.state.emails,0);
  s.state.failMail=false;s.context.retryLeadEmails_();
  assert.equal(s.rows[1][14],'Sent');assert.equal(s.state.emails,1);
  s.context.retryLeadEmails_();assert.equal(s.state.emails,1);
});
test('spreadsheet formulas are stored as literal customer text',()=>{
  const s=service(), input=s.input();input.name='=IMPORTXML("example")';input.phone='+14695550100';
  s.context.submitServiceRequest(input);
  assert.equal(s.rows[1][2].startsWith("'="),true);
  assert.equal(s.rows[1][3].startsWith("'+"),true);
});
test('daily save cap rejects additional requests without losing prior records',()=>{
  const s=service();s.context.PropertiesService.getScriptProperties().setProperty('DAILY_REQUESTS',JSON.stringify({day:'2026-10-12',count:100}));
  assert.throws(()=>s.context.submitServiceRequest(s.input()));assert.equal(s.rows.length,1);
});

function website(endpoint='https://script.google.com/macros/s/test/exec', hasForm=true) {
  const original={style:{},before:(...nodes)=>state.nodes.push(...nodes)};
  const state={nodes:[],events:[],timers:[],listener:null};
  const context=vm.createContext({URL,URLSearchParams,Uint8Array,console,crypto:crypto.webcrypto,
    location:{search:'?utm_source=a1_test&utm_medium=qa&utm_campaign=demo',origin:'https://a1insulationairdfw.github.io',hostname:'a1insulationairdfw.github.io',pathname:'/a1-insulation-air/'},
    document:{referrer:'',querySelector:()=>hasForm?original:null,createElement:()=>({style:{},setAttribute(){},remove(){}})},
    sessionStorage:{getItem:()=>null,setItem:(key,value)=>state.context=JSON.parse(value)},
    setTimeout:f=>{state.timers.push(f);return state.timers.length},clearTimeout(){},
    window:{A1_LEAD_FORM:{endpoint,measurementId:'G-TEST'},crypto:crypto.webcrypto,addEventListener:(name,f)=>state.listener=f,removeEventListener:()=>state.listener=null,gtag:(...args)=>state.events.push(args)}
  });
  vm.runInContext(loader,context);
  state.original=original;
  if(state.nodes.length) state.nonce=new URL(state.nodes[1].src).searchParams.get('nonce');
  return state;
}
test('empty config keeps the original Google Form intact',()=>{
  const s=website('');assert.equal(s.nodes.length,0);assert.equal(s.original.style.display,undefined);
});
test('service landing pages retain marketing labels before navigating to a form page',()=>{
  const s=website('https://script.google.com/macros/s/test/exec',false);
  assert.equal(s.nodes.length,0);
  assert.equal(s.context.utm_source,'a1_test');
  assert.equal(s.context.utm_medium,'qa');
  assert.equal(s.context.utm_campaign,'demo');
});
test('load failure keeps the original form available',()=>{
  const s=website();s.timers[0]();assert.equal(s.original.style.display,undefined);assert.equal(s.listener,null);
});
test('untrusted, wrong-token, failed, and duplicate messages cannot inflate GA4 leads',()=>{
  const s=website(), source={postMessage(){}};
  const message=(type,overrides={})=>({origin:'https://test.googleusercontent.com',source,data:{type,nonce:s.nonce,requestId:crypto.randomUUID()},...overrides});
  s.listener(message('a1:saved'));assert.equal(s.events.length,0);
  s.listener(message('a1:ready',{origin:'https://attacker.invalid'}));assert.equal(s.original.style.display,undefined);
  s.listener(message('a1:ready'));assert.equal(s.original.style.display,'none');
  s.listener(message('a1:failed'));assert.equal(s.events.length,0);
  const saved=message('a1:saved');s.listener(saved);s.listener(saved);
  assert.equal(s.events.length,1);
  assert.equal(s.events[0][1],'generate_lead');
  assert.deepEqual(Object.keys(s.events[0][2]).sort(),['form_id','send_to']);
});

