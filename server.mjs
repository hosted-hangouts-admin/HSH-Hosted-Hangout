import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, 'data.json');
const PORT = process.env.PORT || 3000;

// Default seed database matching HSH records
const defaultDatabase = {
  events: [
    {
      id: 201,
      title: "Living Centerpieces: An Evening in Flowers",
      host: "Daisy Hutton, Brianne Watson & Alicia Quinonez",
      specialGuest: "Brooke Wetzel of The Plum Dahlia",
      category: "Creative Arts",
      grade: "Parents Only",
      status: "Open", // Open, Waitlist, Sold Out, Draft
      date: "2026-11-13",
      displayDate: "Fri, Nov 13 • 5:30 - 8:00 PM (Starts 6 PM)",
      location: "Daisy Hutton’s House • 6301 Arrowhead Pl, LA 90068",
      price: 150,
      totalSpots: 15,
      waitlistCap: 10,
      image: "Living%20Centerpieces%20HH%20Inviteb.jpeg",
      fallbackImage: "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=700&q=80",
      description: "Join Brooke Wetzel (30+ years in botanical art and sustainable floral design) to craft your very own living botanical centerpiece! An intimate evening with drinks, flowers, and community in the Hollywood Hills.",
      attendees: [
        { id: 1, name: "Alma Kawczynski", grade: "Parents Only", quantity: 1, paid: 150, method: "card", notes: "Table preference with Claire", checkedIn: true },
        { id: 2, name: "Claire Foster", grade: "Parents Only", quantity: 1, paid: 150, method: "card", notes: "", checkedIn: true },
        { id: 3, name: "Sarah B.", grade: "Parents Only", quantity: 1, paid: 150, method: "p2p", notes: "Venmo payment sent 10/24", checkedIn: false },
        { id: 4, name: "Elena Ross", grade: "Parents Only", quantity: 1, paid: 150, method: "card", notes: "", checkedIn: true }
      ]
    }
  ]
};

// Database persistence helpers
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (err) {
    console.error("Error reading database, using defaults:", err);
  }
  saveData(defaultDatabase);
  return defaultDatabase;
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error("Error saving database:", err);
  }
}

// Request parsing helper
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const db = loadData();

  // 1. PUBLIC CATALOG API: GET /api/catalog
  if (req.method === 'GET' && url.pathname === '/api/catalog') {
    const publicEvents = db.events
      .filter(e => e.status !== 'Draft')
      .map(e => {
        const spotsTaken = e.attendees.reduce((sum, a) => sum + (a.quantity || 1), 0);
        return {
          id: e.id,
          title: e.title,
          host: e.host,
          specialGuest: e.specialGuest,
          category: e.category,
          grade: e.grade,
          status: e.status,
          date: e.date,
          displayDate: e.displayDate,
          location: e.location,
          price: e.price,
          totalSpots: e.totalSpots,
          spotsRemaining: Math.max(0, e.totalSpots - spotsTaken),
          spotsTaken: spotsTaken,
          image: e.image,
          fallbackImage: e.fallbackImage,
          description: e.description,
          attendeeCount: e.attendees.length
        };
      });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(publicEvents));
    return;
  }

  // 2. PUBLIC SIGNUP API: POST /api/signup
  if (req.method === 'POST' && url.pathname === '/api/signup') {
    try {
      const payload = await parseBody(req);
      const event = db.events.find(e => e.id === Number(payload.eventId));
      if (!event) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: "Event not found" }));
        return;
      }

      const quantity = Number(payload.spots) || 1;
      const spotsTaken = event.attendees.reduce((sum, a) => sum + (a.quantity || 1), 0);
      if (spotsTaken + quantity > event.totalSpots && event.status !== 'Waitlist') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: "Sorry, not enough spots remaining." }));
        return;
      }

      const newAttendee = {
        id: Date.now(),
        name: payload.name.trim(),
        grade: payload.grade || "Parents Only",
        quantity: quantity,
        paid: Number(payload.paid) || (event.price * quantity),
        method: payload.method || "card",
        notes: payload.notes || "",
        checkedIn: false
      };

      event.attendees.push(newAttendee);
      saveData(db);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, attendee: newAttendee }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: "Invalid signup payload" }));
    }
    return;
  }

  // 3. ADMIN API: GET /api/admin/events
  if (req.method === 'GET' && url.pathname === '/api/admin/events') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(db.events));
    return;
  }

  // 4. ADMIN API: POST /api/admin/events (Create Event)
  if (req.method === 'POST' && url.pathname === '/api/admin/events') {
    try {
      const payload = await parseBody(req);
      const newEvent = {
        id: Date.now(),
        title: payload.title || "Untitled Hangout",
        host: payload.host || "HSH Host",
        specialGuest: payload.specialGuest || "",
        category: payload.category || "Parent Socials",
        grade: payload.grade || "Parents Only",
        status: payload.status || "Open",
        date: payload.date || new Date().toISOString().split('T')[0],
        displayDate: payload.displayDate || "TBD",
        location: payload.location || "TBD",
        price: Number(payload.price) || 50,
        totalSpots: Number(payload.totalSpots) || 20,
        waitlistCap: Number(payload.waitlistCap) || 10,
        image: payload.image || "Living%20Centerpieces%20HH%20Inviteb.jpeg",
        description: payload.description || "",
        attendees: []
      };
      db.events.unshift(newEvent);
      saveData(db);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(newEvent));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: "Invalid event data" }));
    }
    return;
  }

  // 5. ADMIN API: PUT /api/admin/events (Edit Event / Capacity / Status / Price)
  if (req.method === 'PUT' && url.pathname.startsWith('/api/admin/events/')) {
    const eventId = Number(url.pathname.split('/').pop());
    const event = db.events.find(e => e.id === eventId);
    if (!event) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: "Event not found" }));
      return;
    }
    try {
      const updates = await parseBody(req);
      Object.assign(event, updates);
      saveData(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(event));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: "Invalid updates" }));
    }
    return;
  }

  // 6. ADMIN API: DELETE /api/admin/events/:id
  if (req.method === 'DELETE' && url.pathname.startsWith('/api/admin/events/')) {
    const eventId = Number(url.pathname.split('/').pop());
    db.events = db.events.filter(e => e.id !== eventId);
    saveData(db);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // 7. ADMIN API: PUT /api/admin/signups (Granular Attendee Edit: Participant, Quantity, Price, Notes, Check-In)
  if (req.method === 'PUT' && url.pathname.startsWith('/api/admin/signups/')) {
    const attendeeId = Number(url.pathname.split('/').pop());
    const updates = await parseBody(req);
    let found = false;

    for (const ev of db.events) {
      const att = ev.attendees.find(a => a.id === attendeeId);
      if (att) {
        if (updates.name !== undefined) att.name = updates.name.trim();
        if (updates.grade !== undefined) att.grade = updates.grade;
        if (updates.quantity !== undefined) att.quantity = Number(updates.quantity);
        if (updates.paid !== undefined) att.paid = Number(updates.paid);
        if (updates.method !== undefined) att.method = updates.method;
        if (updates.notes !== undefined) att.notes = updates.notes;
        if (updates.checkedIn !== undefined) att.checkedIn = Boolean(updates.checkedIn);
        found = true;
        break;
      }
    }

    if (found) {
      saveData(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: "Signup not found" }));
    }
    return;
  }

  // 8. ADMIN API: DELETE /api/admin/signups/:id
  if (req.method === 'DELETE' && url.pathname.startsWith('/api/admin/signups/')) {
    const attendeeId = Number(url.pathname.split('/').pop());
    for (const ev of db.events) {
      ev.attendees = ev.attendees.filter(a => a.id !== attendeeId);
    }
    saveData(db);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // 9. STANDALONE ADMIN ROUTE: GET /admin/
  if (req.method === 'GET' && (url.pathname === '/admin' || url.pathname === '/admin/')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getAdminHtml());
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

// Self-contained Server Admin Dashboard Template
function getAdminHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Hosted Hangouts Admin Operations</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Fraunces:wght@700;800&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    body { font-family: 'DM Sans', sans-serif; background-color: #fbf9f5; }
    h1, h2, h3 { font-family: 'Fraunces', serif; }
  </style>
</head>
<body class="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">

  <div class="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <span class="px-2.5 py-0.5 rounded-full bg-red-100 text-[#be1e2d] text-xs font-bold">HSH Operations Node</span>
      <h1 class="text-3xl font-extrabold text-zinc-900 mt-1">Hangouts Admin Command Center</h1>
      <p class="text-sm text-zinc-500">Live Server-Backed CRUD for Scheduling, Attendee Manifests, and Payments</p>
    </div>
    <div class="flex items-center gap-3">
      <button onclick="openNewEventModal()" class="px-4 py-2.5 rounded-xl bg-[#be1e2d] hover:bg-[#9e1422] text-white font-bold text-xs shadow flex items-center gap-1.5">
        <i data-lucide="plus" class="w-4 h-4"></i> Add New Hangout
      </button>
      <button onclick="downloadCSV()" class="px-4 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold text-xs border border-zinc-300 flex items-center gap-1.5">
        <i data-lucide="download" class="w-4 h-4"></i> Export CSV
      </button>
    </div>
  </div>

  <!-- Real-time metrics -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
    <div class="bg-white p-5 rounded-xl border border-zinc-200 shadow-xs">
      <div class="text-[11px] font-bold uppercase text-zinc-400">Total Confirmed Raised</div>
      <div class="text-2xl font-bold text-emerald-600 mt-1" id="metric-raised">$0</div>
    </div>
    <div class="bg-white p-5 rounded-xl border border-zinc-200 shadow-xs">
      <div class="text-[11px] font-bold uppercase text-zinc-400">Total Spots Reserved</div>
      <div class="text-2xl font-bold text-zinc-900 mt-1" id="metric-spots">0</div>
    </div>
    <div class="bg-white p-5 rounded-xl border border-zinc-200 shadow-xs">
      <div class="text-[11px] font-bold uppercase text-zinc-400">Active Events</div>
      <div class="text-2xl font-bold text-zinc-900 mt-1" id="metric-events">0</div>
    </div>
    <div class="bg-white p-5 rounded-xl border border-zinc-200 shadow-xs">
      <div class="text-[11px] font-bold uppercase text-zinc-400">Live Status</div>
      <div class="text-sm font-bold text-emerald-600 flex items-center gap-1.5 mt-2">
        <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span> DB Connected
      </div>
    </div>
  </div>

  <!-- Events Schedule & Capacity Management -->
  <div class="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
    <h2 class="text-xl font-bold text-zinc-900">Events, Capacity & Pricing Controls</h2>
    <div class="overflow-x-auto border border-zinc-200 rounded-xl">
      <table class="w-full text-left text-xs">
        <thead class="bg-zinc-100 text-zinc-900 uppercase font-bold text-[10px]">
          <tr>
            <th class="py-3 px-4">Title</th>
            <th class="py-3 px-3">Date</th>
            <th class="py-3 px-3">Price</th>
            <th class="py-3 px-3">Status</th>
            <th class="py-3 px-3">Spots</th>
            <th class="py-3 px-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody id="events-tbody" class="divide-y divide-zinc-200"></tbody>
      </table>
    </div>
  </div>

  <!-- Master Attendee Registration & Payment Roster -->
  <div class="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h2 class="text-xl font-bold text-zinc-900">Master Attendee Registration List</h2>
        <p class="text-xs text-zinc-500">Edit participant names, change ticket quantities, adjust pricing, or remove signups</p>
      </div>
      <input type="text" id="roster-search" oninput="filterRoster()" placeholder="Search guest or event..." class="px-3.5 py-1.5 border border-zinc-300 rounded-lg text-xs bg-white w-64 focus:outline-none focus:ring-2 focus:ring-[#be1e2d]">
    </div>
    <div class="overflow-x-auto border border-zinc-200 rounded-xl">
      <table class="w-full text-left text-xs">
        <thead class="bg-zinc-100 text-zinc-900 uppercase font-bold text-[10px]">
          <tr>
            <th class="py-3 px-4">Participant</th>
            <th class="py-3 px-3">Event</th>
            <th class="py-3 px-3">Spots</th>
            <th class="py-3 px-3">Amount</th>
            <th class="py-3 px-3">Check-In</th>
            <th class="py-3 px-3">Notes</th>
            <th class="py-3 px-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody id="roster-tbody" class="divide-y divide-zinc-200"></tbody>
      </table>
    </div>
  </div>

  <!-- Edit Attendee Modal -->
  <div id="edit-modal" class="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 hidden z-50">
    <div class="bg-white w-full max-w-md rounded-2xl p-6 space-y-4 shadow-2xl">
      <h3 class="text-lg font-bold text-zinc-900" id="edit-modal-title">Edit Signup</h3>
      <form onsubmit="saveAttendeeEdit(event)" class="space-y-3">
        <input type="hidden" id="edit-att-id">
        <div>
          <label class="block text-xs font-bold text-zinc-600 mb-1">Participant Name</label>
          <input type="text" id="edit-att-name" required class="w-full px-3 py-2 border rounded-lg text-sm">
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-zinc-600 mb-1">Grade</label>
            <input type="text" id="edit-att-grade" class="w-full px-3 py-2 border rounded-lg text-sm">
          </div>
          <div>
            <label class="block text-xs font-bold text-zinc-600 mb-1">Spots Quantity</label>
            <input type="number" id="edit-att-quantity" min="1" required class="w-full px-3 py-2 border rounded-lg text-sm">
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-zinc-600 mb-1">Amount Paid ($)</label>
            <input type="number" id="edit-att-paid" min="0" step="any" required class="w-full px-3 py-2 border rounded-lg text-sm">
          </div>
          <div>
            <label class="block text-xs font-bold text-zinc-600 mb-1">Payment Method</label>
            <select id="edit-att-method" class="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="card">Credit Card</option>
              <option value="p2p">Venmo/Zelle</option>
              <option value="student_account">Student Account</option>
              <option value="check_cash">Check/Cash</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-xs font-bold text-zinc-600 mb-1">Notes</label>
          <textarea id="edit-att-notes" rows="2" class="w-full px-3 py-2 border rounded-lg text-sm"></textarea>
        </div>
        <div class="flex items-center gap-2">
          <input type="checkbox" id="edit-att-checkin" class="rounded text-[#be1e2d]">
          <label for="edit-att-checkin" class="text-xs font-bold text-zinc-800">Checked In at Door</label>
        </div>
        <div class="pt-3 flex justify-end gap-2">
          <button type="button" onclick="closeEditModal()" class="px-4 py-2 rounded-lg bg-zinc-100 text-zinc-700 text-xs font-bold">Cancel</button>
          <button type="submit" class="px-4 py-2 rounded-lg bg-[#be1e2d] text-white text-xs font-bold">Save Changes</button>
        </div>
      </form>
    </div>
  </div>

  <script>
    let eventsData = [];

    async function fetchAdminData() {
      try {
        const res = await fetch('/api/admin/events');
        eventsData = await res.json();
        renderAll();
      } catch (e) {
        console.error("Failed to load admin data:", e);
      }
    }

    function renderAll() {
      let totalRaised = 0;
      let totalSpots = 0;
      let allAttendees = [];

      const eventsTbody = document.getElementById('events-tbody');
      eventsTbody.innerHTML = '';

      eventsData.forEach(ev => {
        let spotsCount = 0;
        ev.attendees.forEach(a => {
          const qty = a.quantity || 1;
          spotsCount += qty;
          totalRaised += (a.paid !== undefined ? a.paid : (ev.price * qty));
          allAttendees.push({ ...a, eventTitle: ev.title, eventId: ev.id, quantity: qty });
        });
        totalSpots += spotsCount;

        const tr = document.createElement('tr');
        tr.className = "hover:bg-zinc-50";
        tr.innerHTML = \`
          <td class="py-3 px-4 font-bold text-zinc-900">\${ev.title}</td>
          <td class="py-3 px-3 text-zinc-600">\${ev.displayDate}</td>
          <td class="py-3 px-3 font-semibold text-emerald-700">$\${ev.price}</td>
          <td class="py-3 px-3">
            <button onclick="cycleStatus(\${ev.id})" class="px-2 py-0.5 rounded-full text-[10px] font-bold border \${
              ev.status === 'Open' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
              ev.status === 'Waitlist' ? 'bg-amber-50 text-amber-800 border-amber-200' :
              ev.status === 'Draft' ? 'bg-purple-50 text-purple-800 border-purple-200' :
              'bg-zinc-100 text-zinc-600 border-zinc-200'
            }">\${ev.status || 'Open'}</button>
          </td>
          <td class="py-3 px-3 font-semibold text-zinc-800">\${spotsCount} / \${ev.totalSpots}</td>
          <td class="py-3 px-4 text-right space-x-2">
            <button onclick="editEventSettings(\${ev.id})" class="text-xs text-blue-600 font-bold hover:underline">Settings</button>
            <button onclick="deleteEvent(\${ev.id})" class="text-xs text-red-600 font-bold hover:underline">Delete</button>
          </td>
        \`;
        eventsTbody.appendChild(tr);
      });

      document.getElementById('metric-raised').textContent = '$' + totalRaised.toLocaleString();
      document.getElementById('metric-spots').textContent = totalSpots;
      document.getElementById('metric-events').textContent = eventsData.length;

      renderRoster(allAttendees);
      lucide.createIcons();
    }

    function renderRoster(attendees) {
      const tbody = document.getElementById('roster-tbody');
      tbody.innerHTML = '';

      attendees.forEach(a => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-zinc-50";
        tr.innerHTML = \`
          <td class="py-3 px-4 font-bold text-zinc-900">
            <div>\${a.name}</div>
            <div class="text-[10px] text-zinc-400 font-normal">\${a.grade}</div>
          </td>
          <td class="py-3 px-3 text-zinc-700 max-w-[160px] truncate">\${a.eventTitle}</td>
          <td class="py-3 px-3 font-semibold text-zinc-800">\${a.quantity}</td>
          <td class="py-3 px-3 font-semibold text-emerald-700">$\${a.paid} <span class="text-[9px] text-zinc-400 font-normal">(\${a.method})</span></td>
          <td class="py-3 px-3">
            <button onclick="toggleCheckIn(\${a.id}, \${!a.checkedIn})" class="px-2 py-0.5 rounded text-[10px] font-bold \${a.checkedIn ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-500'}">
              \${a.checkedIn ? '✓ Here' : 'Pending'}
            </button>
          </td>
          <td class="py-3 px-3 text-zinc-500 text-[11px] max-w-[140px] truncate">\${a.notes || '—'}</td>
          <td class="py-3 px-4 text-right space-x-2">
            <button onclick="openEditAttendee(\${a.id})" class="text-xs text-blue-600 font-bold hover:underline">Edit</button>
            <button onclick="deleteAttendee(\${a.id})" class="text-xs text-red-600 font-bold hover:underline">Remove</button>
          </td>
        \`;
        tbody.appendChild(tr);
      });
    }

    async function cycleStatus(eventId) {
      const ev = eventsData.find(e => e.id === eventId);
      if (!ev) return;
      const statuses = ["Open", "Waitlist", "Sold Out", "Draft"];
      const next = statuses[(statuses.indexOf(ev.status || 'Open') + 1) % statuses.length];
      await fetch('/api/admin/events/' + eventId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next })
      });
      fetchAdminData();
    }

    async function editEventSettings(eventId) {
      const ev = eventsData.find(e => e.id === eventId);
      if (!ev) return;
      const newPrice = prompt("Ticket Price ($):", ev.price);
      if (newPrice === null) return;
      const newSpots = prompt("Total Spots Capacity:", ev.totalSpots);
      if (newSpots === null) return;
      await fetch('/api/admin/events/' + eventId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price: Number(newPrice), totalSpots: Number(newSpots) })
      });
      fetchAdminData();
    }

    async function deleteEvent(eventId) {
      if (!confirm("Are you sure you want to permanently delete this event and its registrations?")) return;
      await fetch('/api/admin/events/' + eventId, { method: 'DELETE' });
      fetchAdminData();
    }

    function openEditAttendee(attId) {
      let found = null;
      eventsData.forEach(e => {
        const a = e.attendees.find(x => x.id === attId);
        if (a) found = a;
      });
      if (!found) return;

      document.getElementById('edit-att-id').value = found.id;
      document.getElementById('edit-att-name').value = found.name;
      document.getElementById('edit-att-grade').value = found.grade || 'Parents Only';
      document.getElementById('edit-att-quantity').value = found.quantity || 1;
      document.getElementById('edit-att-paid').value = found.paid || 0;
      document.getElementById('edit-att-method').value = found.method || 'card';
      document.getElementById('edit-att-notes').value = found.notes || '';
      document.getElementById('edit-att-checkin').checked = Boolean(found.checkedIn);
      document.getElementById('edit-modal').classList.remove('hidden');
    }

    function closeEditModal() {
      document.getElementById('edit-modal').classList.add('hidden');
    }

    async function saveAttendeeEdit(e) {
      e.preventDefault();
      const id = document.getElementById('edit-att-id').value;
      const updates = {
        name: document.getElementById('edit-att-name').value,
        grade: document.getElementById('edit-att-grade').value,
        quantity: document.getElementById('edit-att-quantity').value,
        paid: document.getElementById('edit-att-paid').value,
        method: document.getElementById('edit-att-method').value,
        notes: document.getElementById('edit-att-notes').value,
        checkedIn: document.getElementById('edit-att-checkin').checked
      };

      await fetch('/api/admin/signups/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      closeEditModal();
      fetchAdminData();
    }

    async function toggleCheckIn(attId, nextState) {
      await fetch('/api/admin/signups/' + attId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkedIn: nextState })
      });
      fetchAdminData();
    }

    async function deleteAttendee(attId) {
      if (!confirm("Remove this attendee?")) return;
      await fetch('/api/admin/signups/' + attId, { method: 'DELETE' });
      fetchAdminData();
    }

    function downloadCSV() {
      let csv = "Guest Name,Grade,Event,Spots,Amount Paid,Method,Notes,Checked In\\n";
      eventsData.forEach(e => {
        e.attendees.forEach(a => {
          csv += \`"\${a.name}","\${a.grade}","\${e.title}","\${a.quantity || 1}","\${a.paid}","\${a.method}","\${(a.notes||'').replace(/"/g, '""')}","\${a.checkedIn ? 'Yes' : 'No'}"\\n\`;
        });
      });
      const link = document.createElement("a");
      link.href = encodeURI("data:text/csv;charset=utf-8," + csv);
      link.download = "HSH_Hangouts_Manifest.csv";
      link.click();
    }

    fetchAdminData();
  </script>
</body>
</html>`;
}

server.listen(PORT, () => {
  console.log(`HSH Hangouts Server running on port ${PORT}`);
  console.log(`Public Catalog API: http://localhost:${PORT}/api/catalog`);
  console.log(`Admin Dashboard: http://localhost:${PORT}/admin/`);
});
