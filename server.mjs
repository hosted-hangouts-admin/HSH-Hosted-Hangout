import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, timingSafeEqual, scryptSync } from 'node:crypto';
import { readFileSync } from 'node:fs';

const production = process.env.NODE_ENV === 'production';
const origin = process.env.ADMIN_ORIGIN || 'http://localhost:8787';
const password = process.env.ADMIN_PASSWORD;
if (!password || password.length < 16 || password.length > 256 || (production && !origin.startsWith('https://'))) {
  throw new Error('Set ADMIN_PASSWORD (16+ characters) and, in production, an HTTPS ADMIN_ORIGIN.');
}
process.umask(0o077);
const db = new DatabaseSync(process.env.DB_PATH || 'hangouts.sqlite');
db.exec(`
  PRAGMA journal_mode=WAL;
  PRAGMA foreign_keys=ON;
  PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL, position INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, number INTEGER UNIQUE, title TEXT NOT NULL,
    category INTEGER NOT NULL REFERENCES categories(id), date TEXT, deadline TEXT, time TEXT, location TEXT,
    address TEXT, host TEXT, hostEmail TEXT, grades TEXT, description TEXT, image TEXT, capacity INTEGER,
    price INTEGER NOT NULL, status TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS families(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE COLLATE NOCASE,
    phone TEXT, optIn INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS signups(id INTEGER PRIMARY KEY, event INTEGER NOT NULL REFERENCES events(id),
    family INTEGER NOT NULL REFERENCES families(id), participant TEXT, quantity INTEGER NOT NULL, price INTEGER NOT NULL,
    status TEXT NOT NULL, notes TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY, signup INTEGER NOT NULL UNIQUE REFERENCES signups(id),
    amount INTEGER NOT NULL, method TEXT NOT NULL, reference TEXT NOT NULL UNIQUE, date TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, action TEXT NOT NULL, target INTEGER,
    created TEXT DEFAULT CURRENT_TIMESTAMP);
  INSERT OR IGNORE INTO categories VALUES (1,'For the Whole Family',10),(2,'Kids Only',20),(3,'Parents Only',30);
  INSERT OR IGNORE INTO settings VALUES(1,'{}');
`);
const q = (sql, ...args) => db.prepare(sql).all(...args);
const one = (sql, ...args) => db.prepare(sql).get(...args);
const run = (sql, ...args) => db.prepare(sql).run(...args);
const config = () => JSON.parse(one('SELECT data FROM settings WHERE id=1').data);
const sessions = new Map();
const salt = randomBytes(16);
const digest = scryptSync(password, salt, 32);
const loginWindow = { start: 0, attempts: 0 };
const files = new Map([['/',['index.html','text/html']],['/app.js',['app.js','text/javascript']],['/style.css',['style.css','text/css']]]);
const publicFields = 'id,number,title,date,deadline,time,location,host,grades,description,image,price';
const events = () => q(`SELECT e.*, c.name AS categoryName,
  COALESCE(SUM(CASE WHEN s.status IN ('reserved','paid') THEN s.quantity END),0) AS occupied,
  COALESCE(SUM(CASE WHEN s.status='waitlist' THEN s.quantity END),0) AS waiting
  FROM events e JOIN categories c ON c.id=e.category LEFT JOIN signups s ON s.event=e.id
  GROUP BY e.id ORDER BY e.date IS NULL,e.date,e.id`);
const roster = () => q(`SELECT s.*,e.title,f.name AS familyName,f.email FROM signups s
  JOIN events e ON s.event=e.id JOIN families f ON s.family=f.id ORDER BY s.id DESC`);
const payments = () => q(`SELECT p.*, e.title, f.name AS familyName FROM payments p JOIN signups s ON p.signup=s.id
  JOIN events e ON s.event=e.id JOIN families f ON s.family=f.id ORDER BY p.date DESC,p.id DESC`);
function fail(message, status=400) { throw Object.assign(new Error(message), {status}); }
function string(value, max=200, required=false) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (result.length > max || (required && !result)) fail('Check required fields and text lengths.');
  return result;
}
function number(value, min=0, max=100000000) {
  if (!['string','number'].includes(typeof value) || String(value).trim()==='' ||
      !Number.isSafeInteger(Number(value)) || Number(value)<min || Number(value)>max) fail('Enter a valid whole number.');
  return Number(value);
}
const optionalNumber = (value, min) => value === '' || value == null ? null : number(value,min);
function date(value, required=false) {
  const result = string(value,10,required);
  if (!result) return null;
  const parsed = new Date(result);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(+parsed) ||
      parsed.toISOString().slice(0,10)!==result) fail('Enter a valid date.');
  return result;
}
function email(value, required=false) {
  const result = string(value,254,required).toLowerCase();
  if (result && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail('Enter a valid email address.');
  return result;
}
function url(value) {
  const result=string(value,1000);
  if (result) {
    try { if (new URL(result).protocol !== 'https:') fail('Use an HTTPS link.'); }
    catch { fail('Use an HTTPS link.'); }
  }
  return result;
}
function choice(value, options) {
  if (!options.includes(value)) fail('Choose a valid option.');
  return value;
}
function existing(table, id) {
  const row = one(`SELECT * FROM ${table} WHERE id=?`,number(id,1));
  if (!row) fail('Record could not be found.',404);
  return row;
}
function capacity(event, quantity, exclude=0) {
  const row = one("SELECT COALESCE(SUM(quantity),0) AS used FROM signups WHERE event=? AND id<>? AND status IN ('reserved','paid')",event.id,exclude);
  if (event.capacity!==null && row.used+quantity>event.capacity) fail('Capacity reached. Use the waitlist or increase capacity.',409);
}
function eventSave(data) {
  const current = data.id ? existing('events',data.id) : null;
  const status = choice(data.status,['draft','published','archived']);
  const eventDate = date(data.date);
  const deadline = date(data.deadline);
  if (deadline && eventDate && deadline>eventDate) fail('Registration deadline must be on or before the event date.');
  const limit = optionalNumber(data.capacity,1);
  if (current && limit!==null) capacity({...current,capacity:limit},0);
  const values = [optionalNumber(data.number,0),string(data.title,200,true),existing('categories',data.category).id,
    eventDate,deadline,string(data.time),string(data.location),string(data.address,400),string(data.host),
    email(data.hostEmail),string(data.grades),string(data.description,6000),url(data.image),limit,number(data.price),status];
  if (current) {
    run('UPDATE events SET number=?,title=?,category=?,date=?,deadline=?,time=?,location=?,address=?,host=?,hostEmail=?,grades=?,description=?,image=?,capacity=?,price=?,status=? WHERE id=?',...values,current.id);
    return current.id;
  }
  return Number(run('INSERT INTO events(number,title,category,date,deadline,time,location,address,host,hostEmail,grades,description,image,capacity,price,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',...values).lastInsertRowid);
}
const actions = {
  event: eventSave,
  duplicate(data) {
    const event=existing('events',data.id);
    return eventSave({...event,id:null,number:null,title:event.title.slice(0,193)+' (copy)',status:'draft'});
  },
  category(data) {
    const fields=[string(data.name,80,true),number(data.position,0,9999)];
    if (data.id) {
      const {id}=existing('categories',data.id);
      run('UPDATE categories SET name=?,position=? WHERE id=?',...fields,id);
      return id;
    }
    return Number(run('INSERT INTO categories(name,position) VALUES(?,?)',...fields).lastInsertRowid);
  },
  family(data) {
    const fields=[string(data.name,160,true),email(data.email,true),string(data.phone,50),data.optIn===true?1:0];
    if (data.id) {
      const {id}=existing('families',data.id);
      run('UPDATE families SET name=?,email=?,phone=?,optIn=? WHERE id=?',...fields,id);
      return id;
    }
    return Number(run('INSERT INTO families(name,email,phone,optIn) VALUES(?,?,?,?)',...fields).lastInsertRowid);
  },
  signup(data) {
    const event=existing('events',data.event);
    if (event.status==='archived') fail('Restore this hangout before adding a signup.');
    const family=existing('families',data.family);
    const quantity=number(data.quantity,1,100);
    const status=choice(data.status,['reserved','waitlist']);
    if (status==='reserved') capacity(event,quantity);
    if (status==='waitlist' && config().waitlists===false) fail('Waitlists are disabled.');
    const price=data.price==='' || data.price==null ? event.price : number(data.price);
    return Number(run('INSERT INTO signups(event,family,participant,quantity,price,status,notes) VALUES(?,?,?,?,?,?,?)',
      event.id,family.id,string(data.participant),quantity,price,status,string(data.notes,1500)).lastInsertRowid);
  },
  promote(data) {
    const signup=existing('signups',data.id);
    const event=existing('events',signup.event);
    if (signup.status!=='waitlist' || event.status==='archived') fail('Only active waitlist entries can be promoted.');
    capacity(event,signup.quantity,signup.id);
    run("UPDATE signups SET status='reserved' WHERE id=?",signup.id);
    return signup.id;
  },
  cancel(data) {
    const {id,status}=existing('signups',data.id);
    if (!['waitlist','reserved'].includes(status)) fail('Only unpaid entries can be cancelled here.');
    run("UPDATE signups SET status='cancelled' WHERE id=?",id);
    return id;
  },
  payment(data) {
    const signup=existing('signups',data.id);
    if (signup.status!=='reserved') fail('Only reserved signups can be marked paid.');
    const method=choice(data.method,['Zeffy','PayPal','Card','Cash','Check','Other','Complimentary']);
    const amount=signup.quantity*signup.price;
    if ((amount===0)!==(method==='Complimentary')) fail('Use Complimentary for zero-dollar reservations only.');
    const reference=method==='Complimentary' ? 'complimentary:'+signup.id : string(data.reference,180,true);
    if (method!=='Complimentary' && reference.startsWith('complimentary:')) fail('Enter the external payment reference.');
    run('INSERT INTO payments(signup,amount,method,reference,date) VALUES(?,?,?,?,?)',signup.id,amount,method,reference,date(data.date,true));
    run("UPDATE signups SET status='paid' WHERE id=?",signup.id);
    return signup.id;
  },
  settings(data) {
    const values={title:string(data.title,120,true),catalogTitle:string(data.catalogTitle,120,true),
      launch:date(data.launch),close:date(data.close),waitlists:data.waitlists===true,showImages:data.showImages===true,
      showSpots:data.showSpots===true,logo:url(data.logo),checkoutUrl:url(data.checkoutUrl),
      footer:string(data.footer,1000),launchMessage:string(data.launchMessage,1000),
      reminderSubject:string(data.reminderSubject),reminderBody:string(data.reminderBody,6000)};
    if (values.launch && values.close && values.launch>values.close) fail('Closing date must follow launch.');
    run('UPDATE settings SET data=? WHERE id=1',JSON.stringify(values));
    return 1;
  },
  renumber(data) {
    const category=existing('categories',data.category).id;
    const sort=choice(data.sort,['date','title']);
    const start=number(data.start,0,999999);
    const rows=q(`SELECT id FROM events WHERE category=? AND status='draft' ORDER BY ${sort} IS NULL,${sort},id`,category);
    if (!rows.length) fail('There are no drafts in this category.');
    run("UPDATE events SET number=NULL WHERE category=? AND status='draft'",category);
    rows.forEach(({id},index)=>run('UPDATE events SET number=? WHERE id=?',start+index,id));
    return null;
  }
};
const csvValue = value => {
  let text=String(value??'');
  if (/^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(text)) text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
};
function csv(res, name, fields, rows) {
  res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${name}.csv"`});
  res.end('\uFEFF'+[fields,...rows.map(row=>fields.map(field=>row[field]))].map(row=>row.map(csvValue).join(',')).join('\r\n'));
}
function json(res, data, status=200) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});
  res.end(JSON.stringify(data));
}
async function body(req) {
  if (!(req.headers['content-type']||'').startsWith('application/json')) fail('Expected JSON.',415);
  let size=0;
  const chunks=[];
  for await (const chunk of req) {
    size+=chunk.length;
    if (size>32768) fail('Request is too large.',413);
    chunks.push(chunk);
  }
  try {
    const data=JSON.parse(Buffer.concat(chunks));
    if (data && typeof data==='object' && !Array.isArray(data)) return data;
  } catch {}
  fail('Invalid request body.');
}
const cookie = (token, maxAge) => `hsh_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${production?'; Secure':''}`;
function today() {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  return ['year','month','day'].map(key=>parts.find(part=>part.type===key).value).join('-');
}
createServer(async (req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' https:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  if (production) res.setHeader('Strict-Transport-Security','max-age=31536000');
  try {
    const path=new URL(req.url,origin).pathname;
    const token=(req.headers.cookie||'').match(/(?:^|;\s*)hsh_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    if (req.method==='POST' && req.headers.origin!==origin) fail('Unexpected request origin.',403);
    if (req.method==='GET' && files.has(path)) {
      const [file,type]=files.get(path);
      res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});
      return res.end(readFileSync(new URL(file,import.meta.url)));
    }
    if (req.method==='GET' && path==='/api/catalog') {
      const allowed=process.env.PUBLIC_ORIGIN;
      if (allowed && allowed===req.headers.origin) res.setHeader('Access-Control-Allow-Origin',allowed);
      res.setHeader('Vary','Origin');
      const settings=config();
      const day=today();
      const open=(!settings.launch||day>=settings.launch)&&(!settings.close||day<=settings.close);
      const published=(!settings.launch||day>=settings.launch) ? q(`SELECT ${publicFields.split(',').map(field=>'e.'+field).join(',')},c.name AS category,e.capacity,
        COALESCE((SELECT SUM(quantity) FROM signups WHERE event=e.id AND status IN ('reserved','paid')),0) AS occupied
        FROM events e JOIN categories c ON e.category=c.id WHERE e.status='published' AND (e.date IS NULL OR e.date>=?)
        ORDER BY c.position,e.date IS NULL,e.date,e.id`,day) : [];
      return json(res,{open,title:settings.catalogTitle||'Hosted Hangouts',launchMessage:settings.launchMessage||'',
        siteTitle:settings.title||'Hosted Hangouts',logo:settings.logo||'',footer:settings.footer||'',
        events:published.map(({capacity,occupied,image,...event})=>({...event,
          image:settings.showImages===false?'':image,spots:settings.showSpots===false||capacity===null?null:capacity-occupied,
          registrationOpen:open&&(!event.deadline||day<=event.deadline)&&(capacity===null||occupied<capacity),
          checkoutUrl:open&&(!event.deadline||day<=event.deadline)&&(capacity===null||occupied<capacity)?settings.checkoutUrl||'':''}))});
    }
    if (req.method==='POST' && path==='/api/login') {
      const data=await body(req);
      const now=Date.now();
      if (now-loginWindow.start>60000) Object.assign(loginWindow,{start:now,attempts:0});
      if (loginWindow.attempts>=8) fail('Try again in a minute.',429);
      if (!timingSafeEqual(scryptSync(string(data.password,256),salt,32),digest)) {
        loginWindow.attempts++;
        fail('Incorrect password.',401);
      }
      for (const [key,expiry] of sessions) if(expiry<=now) sessions.delete(key);
      if(token) sessions.delete(token);
      const next=randomBytes(32).toString('hex');
      sessions.set(next,now+28800000);
      res.setHeader('Set-Cookie',cookie(next,28800));
      return json(res,{ok:true});
    }
    if (!token || (sessions.get(token)||0)<=Date.now()) fail('Sign in to continue.',401);
    if (req.method==='POST' && path==='/api/logout') {
      sessions.delete(token);
      res.setHeader('Set-Cookie',cookie('',0));
      return json(res,{ok:true});
    }
    if (req.method==='GET' && path==='/api/admin') return json(res,{
      events:events(), families:q('SELECT * FROM families ORDER BY name'), signups:roster(), payments:payments(),
      categories:q('SELECT * FROM categories ORDER BY position,name'), settings:config(), day:today(),
      audit:q('SELECT * FROM audit ORDER BY id DESC LIMIT 40')
    });
    if (req.method==='GET' && path.startsWith('/api/export/')) {
      const name=path.split('/').pop();
      const exports={
        events:[events,['id','number','title','categoryName','date','deadline','time','location','host','grades','description','image','capacity','price','status','occupied','waiting']],
        families:[()=>q('SELECT * FROM families ORDER BY name'),['id','name','email','phone','optIn']],
        signups:[roster,['id','title','familyName','email','participant','quantity','price','status','created']],
        payments:[payments,['id','signup','title','familyName','amount','method','reference','date']]
      };
      if (!Object.hasOwn(exports,name)) fail('Export not found.',404);
      const [rows,fields]=exports[name];
      run('INSERT INTO audit(action) VALUES(?)','export '+name);
      return csv(res,name,fields,rows());
    }
    if (req.method==='POST' && path.startsWith('/api/admin/')) {
      const action=path.split('/').pop();
      if (!Object.hasOwn(actions,action)) fail('Action not found.',404);
      const data=await body(req);
      db.exec('BEGIN IMMEDIATE');
      try {
        const id=actions[action](data);
        run('INSERT INTO audit(action,target) VALUES(?,?)',action,id);
        db.exec('COMMIT');
        return json(res,{ok:true,id});
      } catch (error) {
        db.exec('ROLLBACK');
        if (String(error.message).includes('UNIQUE constraint failed')) fail('That number, email, or reference is already in use.',409);
        throw error;
      }
    }
    fail('Page not found.',404);
  } catch(error) {
    if (!error.status) console.error(error);
    if (!res.headersSent) json(res,{error:error.status?error.message:'An unexpected error occurred.'},error.status||500);
    else res.end();
  }
}).listen(Number(process.env.PORT||8787),process.env.BIND||'127.0.0.1',()=>console.log('Hosted Hangouts admin ready'));
