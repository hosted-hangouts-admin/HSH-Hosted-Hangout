import assert from 'node:assert/strict';
const origin = process.env.ADMIN_ORIGIN || 'http://localhost:8787';
let session = '';
async function request(path, data, status=200) {
  const response = await fetch(origin+path,{
    method:data===undefined?'GET':'POST',
    headers:{Origin:origin,Cookie:session,'Content-Type':'application/json'},
    body:data===undefined?undefined:JSON.stringify(data)
  });
  assert.equal(response.status,status,await response.clone().text());
  if(response.headers.has('set-cookie')) session=response.headers.get('set-cookie').split(';')[0];
  return response.headers.get('content-type').includes('json')?response.json():response.text();
}
await request('/api/admin',undefined,401);
await request('/api/login',{password:process.env.ADMIN_PASSWORD});
const draft={title:'Example hangout',category:1,status:'draft',capacity:1,price:15000,address:'Private address',hostEmail:'host@example.test'};
const event=(await request('/api/admin/event',draft)).id;
assert.equal((await request('/api/catalog')).events.length,0);
await request('/api/admin/event',{...draft,id:event,status:'published'});
const listing=(await request('/api/catalog')).events[0];
assert.equal(listing.title,draft.title);
assert.equal(listing.address,undefined);
assert.equal(listing.hostEmail,undefined);
const family=(await request('/api/admin/family',{name:'Example Family',email:'family@example.test'})).id;
const registration={event,family,quantity:1,status:'reserved'};
const attempts=await Promise.allSettled([
  fetch(origin+'/api/admin/signup',{method:'POST',headers:{Origin:origin,Cookie:session,'Content-Type':'application/json'},body:JSON.stringify(registration)}),
  fetch(origin+'/api/admin/signup',{method:'POST',headers:{Origin:origin,Cookie:session,'Content-Type':'application/json'},body:JSON.stringify(registration)})
]);
assert.deepEqual(attempts.map(result=>result.value.status).sort(),[200,409]);
const signup=(await request('/api/admin')).signups[0].id;
const waiting=(await request('/api/admin/signup',{...registration,status:'waitlist'})).id;
await request('/api/admin/promote',{id:waiting},409);
await request('/api/admin/cancel',{id:signup});
await request('/api/admin/promote',{id:waiting});
const payment={id:waiting,method:'Zeffy',reference:'example-receipt',date:'2026-11-10'};
await request('/api/admin/payment',payment);
await request('/api/admin/payment',payment,400);
assert.equal((await request('/api/admin')).payments[0].amount,15000);
assert.match(await request('/api/export/payments'),/example-receipt/);
await request('/api/logout',{});
await request('/api/export/payments',undefined,401);
console.log('Passed: authentication, publishing, catalog privacy, concurrent capacity, waitlist, payment and CSV.');
