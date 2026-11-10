const app = document.querySelector('#app');
const editor = document.querySelector('#editor');
const toast = document.querySelector('#toast');
const publicSite = 'https://mattkawczynskila.github.io/hosted-hangouts/';
const nav = {
  Overview:'See what needs attention across the fundraiser.',
  Hangouts:'Manage drafts, publish events, and open a roster.',
  Signups:'Manage reservations, waitlists, and recorded payments.',
  Families:'Manage adult contacts and email preferences.',
  Finance:'Reconcile recorded funds and outstanding reservations.',
  Messages:'Prepare reminders and announcements for review.',
  Settings:'Manage the catalog, categories, and campaign dates.'
};
let state, page='Overview', eventFilter='', query='', toastTimer;
const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value/100);
const sum = (rows,key) => rows.reduce((total,row)=>total+row[key],0);
const paid = () => sum(state.payments,'amount');
const reserved = () => state.signups.filter(s=>s.status==='reserved');
const due = rows => rows.reduce((total,s)=>total+s.quantity*s.price,0);
const button = (label,action,id='',primary=false) => `<button type="button" data-action="${action}" data-id="${escape(id)}" ${primary?'class="primary"':''}>${escape(label)}</button>`;
const pill = status => `<span class="pill ${escape(status)}">${status==='reserved'?'Payment due':escape(status)}</span>`;
const option = (value,label,selected) => `<option value="${escape(value)}" ${String(value)===String(selected)?'selected':''}>${escape(label)}</option>`;
const selectOptions = (rows,selected) => rows.map(([value,label])=>option(value,label,selected)).join('');
const exportLink = (label,kind) => `<a class="button" href="/api/export/${kind}">${label}</a>`;
function table(headers,rows,empty='Nothing to show yet.') {
  if (!rows.length) return `<div class="card empty">${escape(empty)}</div>`;
  return `<div class="table"><table><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(cells=>`<tr>${cells.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function line(title,sub,action='') {
  return `<div class="line"><div><strong>${escape(title)}</strong><small>${escape(sub)}</small></div>${action}</div>`;
}
function metric(label,value,sub) {
  return `<div class="metric"><h3>${label}</h3><strong>${value}</strong><small>${sub}</small></div>`;
}
function notice(message) {
  toast.textContent=message;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.textContent='',3600);
}
async function api(path,data) {
  const res=await fetch(path,data===undefined?undefined:{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)
  });
  const result=await res.json();
  if (!res.ok) throw Object.assign(new Error(result.error),{status:res.status});
  return result;
}
async function load() { state=await api('/api/admin'); }
function login(error='') {
  state=null;
  if(editor.open) editor.close();
  app.innerHTML=`<main class="card login"><div class="eyebrow">Hollywood Schoolhouse</div><h1>Hosted Hangouts</h1>
    <p class="muted">Sign in to the fundraiser administration portal.</p><form id="login">
    <label>Admin password<input type="password" name="password" required autocomplete="current-password"></label>
    <p class="error" role="alert">${escape(error)}</p><button class="primary">Sign in</button></form></main>`;
}
function go(next,id='') { page=next; eventFilter=id; query=''; render(); }
function render() {
  if (!state) return login();
  const top={Hangouts:button('New hangout','event','',true),Families:button('Add family','family','',true),
    Signups:button('Add signup','signup',eventFilter,true)}[page]||'';
  app.innerHTML=`<div class="shell"><aside><div class="brand"><span class="mark">h</span><div>Hosted Hangouts<small>Hollywood Schoolhouse</small></div></div>
    <nav aria-label="Admin navigation">${Object.keys(nav).map(name=>`<button data-action="page" data-id="${name}" ${page===name?'aria-current="page"':''}>${name}</button>`).join('')}</nav>
    <div class="sidefoot"><a href="${publicSite}" target="_blank" rel="noopener">View public site ↗</a>${button('Sign out','logout')}</div></aside>
    <main><header class="head"><div><p class="eyebrow">Fundraiser administration</p><h1>${page}</h1><p class="muted">${nav[page]}</p></div>${top}</header>
    ${['Hangouts','Signups','Families'].includes(page)?toolbar():''}<div id="content">${content()}</div></main></div>`;
}
function toolbar() {
  return `<div class="bar screen-only"><input id="search" type="search" aria-label="Search ${page.toLowerCase()}" placeholder="Search ${page.toLowerCase()}…" value="${escape(query)}">
    ${page==='Signups'?`<select id="event-filter" aria-label="Filter by hangout">${option('','All hangouts',eventFilter)}${selectOptions(state.events.map(e=>[e.id,e.title]),eventFilter)}</select>
      ${eventFilter?button('Print roster','print'):''}`:''}
    ${exportLink('Download CSV',{Hangouts:'events',Signups:'signups',Families:'families'}[page])}</div>`;
}
function match(...values) { return values.some(value=>String(value??'').toLowerCase().includes(query.trim().toLowerCase())); }
function overview() {
  const upcoming=state.events.filter(e=>e.status==='published'&&e.date&&e.date>=state.day);
  const drafts=state.events.filter(e=>e.status==='draft');
  const waiting=state.signups.filter(s=>s.status==='waitlist');
  return `<div class="hero"><div class="eyebrow">Campaign workspace</div><h2>Plan the next hangout</h2>
    <p>Draft the listing, publish it to the catalog feed, and manage the guest list from the event roster.</p>
    <div class="actions">${button('New hangout','event','',true)}${button('Add signup','signup')}</div></div>
    <div class="metrics">${metric('Recorded funds',money(paid()),'Reconciled payments')}
    ${metric('Outstanding',money(due(reserved())),reserved().length+' unpaid reservations')}
    ${metric('Upcoming',upcoming.length,'Published, dated hangouts')}
    ${metric('Waitlist',sum(waiting,'quantity'),'Spots requested')}</div>
    <div class="columns"><section class="card"><h2>Upcoming hangouts</h2>${upcoming.slice(0,6).map(e=>line(e.title,e.date+' · '+e.occupied+' reserved spots',button('Roster','roster',e.id))).join('')||'<p class="sub muted">Published events with dates will appear here.</p>'}</section>
    <section class="card"><h2>Drafts to review</h2>${drafts.slice(0,6).map(e=>line(e.title,e.categoryName,button('Edit','event',e.id))).join('')||'<p class="sub muted">Your draft list is clear.</p>'}</section></div>`;
}
function hangouts() {
  return table(['Hangout','Date','Status','Spots','Price','Actions'],state.events.filter(e=>match(e.title,e.categoryName,e.status,e.number)).map(e=>[
    `<strong>${escape(e.title)}</strong><br><small>${e.number==null?'':'#'+String(e.number).padStart(3,'0')+' · '}${escape(e.categoryName)}</small>`,
    escape(e.date||'Undated'),pill(e.status),`${e.occupied} / ${e.capacity??'∞'}<br><small>${e.waiting} waiting</small>`,money(e.price),
    `<div class="actions">${button('Edit','event',e.id)}${button('Roster','roster',e.id)}${button('Duplicate','duplicate',e.id)}</div>`
  ]),'No matching hangouts. Create a draft to start.');
}
function signups() {
  const event=state.events.find(e=>String(e.id)===String(eventFilter));
  const rows=state.signups.filter(s=>(!event||s.event===event.id)&&match(s.familyName,s.participant,s.title,s.status,s.email))
    .sort((a,b)=>a.status==='waitlist'&&b.status==='waitlist'?a.id-b.id:0);
  return `${event?`<div class="card summary"><h2>${escape(event.title)}</h2><p class="muted">${event.occupied} reserved or paid · ${event.waiting} waitlisted · ${event.capacity??'Unlimited'} capacity</p></div>`:''}
    ${table(['Family','Participant','Hangout','Qty','Total','Status','Actions'],rows.map(s=>[
    `<strong>${escape(s.familyName)}</strong><br><small>${escape(s.email)}</small>`,escape(s.participant||'—'),escape(s.title),s.quantity,
    money(s.quantity*s.price),pill(s.status),`<div class="actions">${s.notes?button('Notes','notes',s.id):''}
    ${s.status==='waitlist'?button('Promote','promote',s.id):''}${s.status==='reserved'?button('Record payment','payment',s.id):''}
    ${['waitlist','reserved'].includes(s.status)?button('Cancel','cancel',s.id):''}</div>`
  ]),'No matching signups.')}`;
}
function families() {
  return table(['Family contact','Email','Phone','Email opt-in','Actions'],state.families.filter(f=>match(f.name,f.email,f.phone)).map(f=>[
    escape(f.name),escape(f.email),escape(f.phone||'—'),f.optIn?'Yes':'No',button('Edit','family',f.id)
  ]));
}
function finance() {
  const days=Map.groupBy(state.payments,p=>p.date);
  const daily=[...days].sort(([a],[b])=>a.localeCompare(b));
  let running=0;
  const categories=state.categories.map(c=>{
    const ids=new Set(state.events.filter(e=>e.category===c.id).map(e=>e.id));
    const signups=state.signups.filter(s=>ids.has(s.event));
    const signupIds=new Set(signups.map(s=>s.id));
    return [escape(c.name),money(sum(state.payments.filter(p=>signupIds.has(p.signup)),'amount')),
      money(due(signups.filter(s=>s.status==='reserved'))),sum(signups.filter(s=>s.status==='waitlist'),'quantity')];
  });
  return `<div class="metrics">${metric('Recorded funds',money(paid()),state.payments.length+' payment records')}
    ${metric('Outstanding',money(due(reserved())),reserved().length+' unpaid reservations')}</div>
    <div class="stack"><section><div class="sectionhead"><h2>Transactions</h2>${exportLink('Download CSV','payments')}</div>
    ${table(['Date','Family','Hangout','Method','Reference','Amount'],state.payments.map(p=>[escape(p.date),escape(p.familyName),escape(p.title),escape(p.method),escape(p.reference),money(p.amount)]))}</section>
    <section><h2 class="sub">Category breakdown</h2>${table(['Category','Recorded funds','Outstanding','Waitlisted spots'],categories)}</section>
    <section><h2 class="sub">Daily totals</h2>${table(['Date','By payment method','Daily total','Running total'],daily.map(([date,rows])=>{
      const total=sum(rows,'amount');
      running+=total;
      return [escape(date),[...Map.groupBy(rows,p=>p.method)].map(([method,group])=>escape(method)+' '+money(sum(group,'amount'))).join(' · '),money(total),money(running)];
    }))}</section></div>`;
}
function input(name,label,value='',type='text',extras='') {
  return `<label>${label}<input name="${name}" type="${type}" ${type==='checkbox'?(value?'checked':''):`value="${escape(value)}"`} ${extras}></label>`;
}
const textArea = (name,label,value='') => `<label class="wide">${label}<textarea name="${name}">${escape(value)}</textarea></label>`;
const select = (name,label,rows,selected) => `<label>${label}<select name="${name}" required>${selectOptions(rows,selected)}</select></label>`;
function messages() {
  return `<div class="card"><h2>Prepare an email draft</h2><p class="privacy sub">Review the recipient count, then open a draft in your email app. Recipients are placed in BCC.</p>
    <form id="message"><div class="formgrid">${select('audience','Audience',[['families','Opted-in families'],['hosts','Published hangout hosts'],['paid','Paid guests for one hangout'],['test','Test address']])}
      ${select('event','Hangout for paid guests',[['0','Choose a hangout'],...state.events.map(e=>[e.id,e.title])])}
      ${input('test','Test address','','email')}${input('subject','Subject',state.settings.reminderSubject,'text','required maxlength="180"')}
      ${textArea('body','Message',state.settings.reminderBody)}</div><div id="message-preview" class="muted"></div><div><button class="primary">Review recipients</button></div></form></div>`;
}
function settings() {
  const s=state.settings;
  return `<div class="stack"><section class="card"><h2>Campaign and catalog</h2>
    <p class="muted sub">These options feed the public catalog API. Dates follow Los Angeles time.</p>
    <form data-save="settings"><div class="formgrid">
    ${input('title','Site title',s.title||'Hosted Hangouts','text','required')}${input('catalogTitle','Catalog title',s.catalogTitle||'Available Hangouts','text','required')}
    ${input('launch','Launch date',s.launch,'date')}${input('close','Registration closes',s.close,'date')}
    ${input('logo','Logo HTTPS URL',s.logo,'url')}${input('checkoutUrl','Hosted checkout HTTPS URL',s.checkoutUrl,'url')}
    ${input('waitlists','Enable waitlists',s.waitlists!==false,'checkbox')}${input('showImages','Show event images',s.showImages!==false,'checkbox')}
    ${input('showSpots','Show remaining spots',s.showSpots!==false,'checkbox')}
    ${textArea('launchMessage','Prelaunch message',s.launchMessage)}${textArea('footer','Footer text',s.footer)}
    ${input('reminderSubject','Reminder draft subject',s.reminderSubject)}${textArea('reminderBody','Reminder draft body',s.reminderBody)}
    </div><p class="error" role="alert"></p><div><button class="primary">Save settings</button></div></form></section>
    <section class="card"><div class="sectionhead"><h2>Categories</h2>${button('New category','category')}</div>
    ${state.categories.map(c=>line(c.name,'Position '+c.position,button('Edit','category',c.id))).join('')}</section>
    <section class="card"><div class="sectionhead"><h2>Event numbers</h2>${button('Renumber drafts','renumber')}</div><p class="muted">Published and archived event numbers are preserved during batch renumbering.</p></section>
    <section class="card"><h2>Recent activity</h2>${table(['Action','Record','Time (UTC)'],state.audit.map(a=>[escape(a.action),a.target??'—',escape(a.created)]))}</section></div>`;
}
function content() { return ({Overview:overview,Hangouts:hangouts,Signups:signups,Families:families,Finance:finance,Messages:messages,Settings:settings})[page](); }
function dialog(title,action,fields,id='',label='Save') {
  editor.innerHTML=`<div class="sectionhead"><h2 id="editor-title">${title}</h2>${button('Close','close')}</div>
    <form data-save="${action}"><input type="hidden" name="id" value="${escape(id)}"><div class="formgrid">${fields}</div>
    <p class="error" role="alert"></p><div><button class="primary">${label}</button></div></form>`;
  editor.setAttribute('aria-labelledby','editor-title');
  editor.showModal();
}
const categoryOptions = () => state.categories.map(c=>[c.id,c.name]);
const numberInput = (name,label,value='',minimum=0) => input(name,label,value,'number','min="'+minimum+'" step="1"');
function eventEditor(id) {
  const e=state.events.find(e=>e.id===id)||{};
  dialog(id?'Edit hangout':'New hangout','event',
    input('title','Hangout title',e.title,'text','required')+select('category','Category',categoryOptions(),e.category)+
    select('status','Catalog status',[['draft','Draft'],['published','Published'],['archived','Archived']],e.status)+
    numberInput('number','Event number (optional)',e.number)+input('date','Event date',e.date,'date')+
    input('deadline','Registration deadline',e.deadline,'date')+input('time','Time or schedule',e.time)+
    input('location','Public location label',e.location)+input('address','Private address',e.address)+
    input('host','Public host name',e.host)+input('hostEmail','Private host email',e.hostEmail,'email')+
    input('grades','Grades / age group',e.grades)+numberInput('capacity','Capacity (blank for unlimited)',e.capacity,1)+
    numberInput('price','Price per spot in cents',e.price??0)+input('image','Image HTTPS URL',e.image,'url')+
    textArea('description','Public description',e.description),id||'');
}
function signupEditor(id) {
  if (!state.families.length) { notice('Add a family contact first.'); return go('Families'); }
  const active=state.events.filter(e=>e.status!=='archived');
  if (!active.length) { notice('Create a hangout first.'); return go('Hangouts'); }
  dialog('Add signup','signup',
    select('event','Hangout',active.map(e=>[e.id,e.title]),id)+
    select('family','Family',state.families.map(f=>[f.id,f.name+' · '+f.email]))+
    input('participant','Participant name (if needed)')+numberInput('quantity','Spots',1,1)+
    select('status','Status',state.settings.waitlists===false?[['reserved','Reserve spots']]:[['reserved','Reserve spots'],['waitlist','Join waitlist']])+
    numberInput('price','Price override in cents (optional)')+textArea('notes','Private notes'));
}
document.addEventListener('input',event=>{
  if(event.target.id==='search') {
    query=event.target.value;
    document.querySelector('#content').innerHTML=content();
  }
});
document.addEventListener('change',event=>{
  if(event.target.id==='event-filter') go('Signups',event.target.value);
  if(event.target.form?.id==='message') document.querySelector('#message-preview').textContent='';
});
document.addEventListener('click',async event=>{
  const control=event.target.closest('button[data-action]');
  if (!control) return;
  const {action,id}=control.dataset;
  const num=Number(id);
  if(action==='close') return editor.close();
  if(!state) return;
  if(action==='page') return go(id);
  if(action==='roster') return go('Signups',id);
  if(action==='print') return window.print();
  if(action==='event') return eventEditor(num);
  if(action==='signup') return signupEditor(num);
  if(action==='family') {
    const f=state.families.find(f=>f.id===num)||{};
    return dialog(num?'Edit family':'Add family','family',input('name','Adult contact name',f.name,'text','required')+
      input('email','Email',f.email,'email','required')+input('phone','Phone',f.phone,'tel')+
      input('optIn','Opted in to fundraiser announcements',f.optIn,'checkbox'),num||'');
  }
  if(action==='category') {
    const c=state.categories.find(c=>c.id===num)||{};
    return dialog(num?'Edit category':'New category','category',
      input('name','Name',c.name,'text','required')+numberInput('position','Display position',c.position??10),num||'');
  }
  if(action==='renumber') return dialog('Renumber drafts','renumber',
    select('category','Category',categoryOptions())+select('sort','Order',[['date','Event date'],['title','Title']])+
    numberInput('start','First number',1),'','Assign numbers');
  if(action==='payment') {
    const s=state.signups.find(s=>s.id===num);
    const methods=s.price?['Zeffy','PayPal','Card','Cash','Check','Other']:['Complimentary'];
    return dialog('Record '+money(s.price*s.quantity),'payment',
      select('method','Payment method',methods.map(m=>[m,m]))+
      input('date','Payment date',state.day,'date','required')+
      (s.price?input('reference','External receipt or reconciliation reference','','text','required'):'')+
      '<p class="wide muted">Use this after verifying payment. This entry updates the roster and finance reports.</p>',num,'Record payment');
  }
  if(action==='notes') {
    editor.innerHTML=`<div class="sectionhead"><h2 id="editor-title">Private signup notes</h2>${button('Close','close')}</div>
      <p>${escape(state.signups.find(s=>s.id===num)?.notes)}</p>`;
    editor.setAttribute('aria-labelledby','editor-title');
    return editor.showModal();
  }
  if(action==='cancel'&&!confirm('Cancel this unpaid signup and release any reserved spots?')) return;
  if(action==='promote'&&!confirm('Reserve spots for this family? They will appear as payment due.')) return;
  control.disabled=true;
  try {
    if(action==='logout') { await api('/api/logout',{}); page='Overview'; return login(); }
    await api('/api/admin/'+action,{id:num});
    await load();
    render();
    notice(action==='duplicate'?'Draft copy created.':action==='promote'?'Spots reserved.':'Signup cancelled.');
  } catch(error) { if(error.status===401) login(); else notice(error.message); }
  finally { control.disabled=false; }
});
function reviewMessage(form,data) {
  const addresses={
    families:()=>state.families.filter(f=>f.optIn).map(f=>f.email),
    hosts:()=>state.events.filter(e=>e.status==='published').map(e=>e.hostEmail),
    paid:()=>state.signups.filter(s=>s.status==='paid'&&s.event===Number(data.event)).map(s=>s.email),
    test:()=>[data.test]
  };
  const recipients=[...new Set(addresses[data.audience]().filter(Boolean))];
  const preview=form.querySelector('#message-preview');
  if (!recipients.length || !data.body.trim()) {
    preview.textContent='Choose a group with recipients and enter a message.';
    return;
  }
  const link='mailto:?bcc='+encodeURIComponent(recipients.join(','))+'&subject='+encodeURIComponent(data.subject)+'&body='+encodeURIComponent(data.body);
  if (link.length>1800) {
    preview.textContent=recipients.length+' recipients. Use a smaller group or a shorter draft to open it in your email app.';
    return;
  }
  preview.replaceChildren(document.createTextNode(recipients.length+' recipient(s). '));
  const anchor=document.createElement('a');
  anchor.href=link;
  anchor.textContent='Open email draft';
  preview.append(anchor);
}
document.addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.target;
  const data=Object.fromEntries(new FormData(form));
  if(form.id==='message') return reviewMessage(form,data);
  const submit=form.querySelector('button[type=submit],button:not([type])');
  const errorBox=form.querySelector('.error');
  for(const checkbox of form.querySelectorAll('input[type=checkbox]')) data[checkbox.name]=checkbox.checked;
  if(submit) submit.disabled=true;
  if(errorBox) errorBox.textContent='';
  try {
    if(form.id==='login') await api('/api/login',data);
    else await api('/api/admin/'+form.dataset.save,data);
    await load();
    if(editor.open) editor.close();
    render();
    if(form.id!=='login') notice('Saved.');
  } catch(error) {
    if(error.status===401&&form.id!=='login') login();
    else if(errorBox) errorBox.textContent=error.message;
    else notice(error.message);
  } finally { if(submit) submit.disabled=false; }
});
try { await load(); render(); }
catch(error) { login(error.status===401?'':error.message); }
