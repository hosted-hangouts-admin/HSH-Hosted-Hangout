import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, 'data.json');
const PORT = process.env.PORT || 3000;

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
        { id: 1, name: "Alma Kawczynski", email: "alma@example.com", grade: "Parents Only", quantity: 1, paid: 150, method: "card", status: "Verified", notes: "Table preference with Claire", checkedIn: true },
        { id: 2, name: "Claire Foster", email: "claire@example.com", grade: "Parents Only", quantity: 1, paid: 150, method: "card", status: "Verified", notes: "", checkedIn: true },
        { id: 3, name: "Sarah B.", email: "sarah@example.com", grade: "Parents Only", quantity: 1, paid: 150, method: "p2p", status: "Pending", notes: "Venmo payment sent 10/24", checkedIn: false },
        { id: 4, name: "Elena Ross", email: "elena@example.com", grade: "Parents Only", quantity: 1, paid: 150, method: "card", status: "Verified", notes: "", checkedIn: true }
      ]
    }
  ],
  pastShowcase: [
    { id: "shelby", title: "Feel Good Jazz Class", host: "Hosted by Shelby Rabara Shum", price: "$50 / person", category: "Dance & Fitness", cover: "HOSTED_HANGOUT_SHELBY.jpeg", count: "2 Photos" },
    { id: "karaoke", title: "Presidents' Karaoke Night", host: "Hosted by Christy, Michelle, Daisy, Alicia & Brianne", price: "$100 / person", category: "Parent Social", cover: "karoke%20HH.jpg", count: "Flyer" },
    { id: "soundbath", title: "Sunset Sound Bath", host: "Hosted by Elizabeth Sbardellati", price: "$75 / person", category: "Wellness & Sound", cover: "HOSTED_HANGOUT_SOUND_BATH.jpg", count: "Flyer" },
    { id: "iceskating", title: "Community Ice Skating", host: "Hosted by Jean, Brandee, Janet, Dawn & Julie", price: "$40 / person", category: "All-School Family", cover: "HOSTED_HANGOUT_ICE_SKATING.jpg", count: "4 Photos" },
    { id: "ecedance", title: "Grown-Ups & Kiddos Dance Class", host: "Hosted by Caroline Keichian • Led by Savanna Stone", price: "$35 / family", category: "Early Childhood", cover: "HOSTED_HANGOUT_ECE_DANCE.jpg", count: "2 Photos" },
    { id: "distillery", title: "Hollywood Distillery Tasting & Tour", host: "Hosted by Carrie Clifford, Kay Lee & Lauren Delp", price: "$65 / person", category: "Parent Social", cover: "HOSTED_HANGOUT_DISTLLERY.jpg", count: "2 Photos" }
  ]
};

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (!data.pastShowcase) data.pastShowcase = defaultDatabase.pastShowcase;
      return data;
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

const server = http.createServer(async (req, res) => {
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

  // GET /api/catalog
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
          attendees: e.attendees.map(a => ({ name: a.name, grade: a.grade }))
        };
      });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ events: publicEvents, pastShowcase: db.pastShowcase }));
    return;
  }

  // POST /api/signup
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
      const isWaitlist = event.status === 'Waitlist' || (spotsTaken + quantity > event.totalSpots);

      const newAttendee = {
        id: Date.now(),
        name: payload.name.trim(),
        email: payload.email ? payload.email.trim() : "",
        grade: payload.grade || "Parents Only",
        quantity: quantity,
        paid: Number(payload.paid) || (event.price * quantity),
        method: payload.method || "card",
        status: payload.method === 'card' ? "Verified" : "Pending",
        notes: payload.notes || "",
        isWaitlist: isWaitlist,
        checkedIn: false
      };

      event.attendees.push(newAttendee);
      saveData(db);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, attendee: newAttendee, isWaitlist }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: "Invalid signup payload" }));
    }
    return;
  }

  // GET /api/admin/events
  if (req.method === 'GET' && url.pathname === '/api/admin/events') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ events: db.events, pastShowcase: db.pastShowcase }));
    return;
  }

  // POST /api/admin/events
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

  // PUT /api/admin/events/:id
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

  // DELETE /api/admin/events/:id
  if (req.method === 'DELETE' && url.pathname.startsWith('/api/admin/events/')) {
    const eventId = Number(url.pathname.split('/').pop());
    db.events = db.events.filter(e => e.id !== eventId);
    saveData(db);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // PUT /api/admin/signups/:id
  if (req.method === 'PUT' && url.pathname.startsWith('/api/admin/signups/')) {
    const attendeeId = Number(url.pathname.split('/').pop());
    const updates = await parseBody(req);
    let found = false;

    for (const ev of db.events) {
      const att = ev.attendees.find(a => a.id === attendeeId);
      if (att) {
        if (updates.name !== undefined) att.name = updates.name.trim();
        if (updates.email !== undefined) att.email = updates.email.trim();
        if (updates.grade !== undefined) att.grade = updates.grade;
        if (updates.quantity !== undefined) att.quantity = Number(updates.quantity);
        if (updates.paid !== undefined) att.paid = Number(updates.paid);
        if (updates.method !== undefined) att.method = updates.method;
        if (updates.status !== undefined) att.status = updates.status;
        if (updates.notes !== undefined) att.notes = updates.notes;
        if (updates.checkedIn !== undefined) att.checkedIn = Boolean(updates.checkedIn);
        if (updates.isWaitlist !== undefined) att.isWaitlist = Boolean(updates.isWaitlist);
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

  // DELETE /api/admin/signups/:id
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

  // DELETE /api/admin/past/:id
  if (req.method === 'DELETE' && url.pathname.startsWith('/api/admin/past/')) {
    const pastId = url.pathname.split('/').pop();
    db.pastShowcase = db.pastShowcase.filter(p => p.id !== pastId);
    saveData(db);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // Standalone Admin Route: GET /admin/
  if (req.method === 'GET' && (url.pathname === '/admin' || url.pathname === '/admin/')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getAdminHtml());
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

function getAdminHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Hosted Hangouts Operations Hub</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Fraunces:wght@700;800&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    body { font-family: 'DM Sans', sans-serif; background-color: #fbf9f5; }
    h1, h2, h3, h4 { font-family: 'Fraunces', serif; }
  </style>
</head>
<body class="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">

  <div class="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <span class="px-2.5 py-0.5 rounded-full bg-red-100 text-[#be1e2d] text-xs font-bold">HSH Event Operations</span>
      <h1 class="text-3xl font-extrabold text-zinc-900 mt-1">Hangout Management Command</h1>
      <p class="text-sm text-zinc-500">Live database-backed management for sign-ups, attendee rosters, payments, and event settings</p>
    </div>
    <div class="flex items-center gap-3">
      <button onclick="openNewEventModal()" class="px-4 py-2.5 rounded-xl bg-[#be1e2d] hover:bg-[#9e1422] text-white font-bold text-xs shadow flex items-center gap-1.5 transition">
        <i data-lucide="plus" class="w-4 h-4"></i> Add New Hangout
      </button>
      <button onclick="downloadCSV()" class="px-4 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold text-xs border border-zinc-300 flex items-center gap-1.5 transition">
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
      <div class="text-[11px] font-bold uppercase text-zinc-400">Active Live Events</div>
      <div class="text-2xl font-bold text-zinc-900 mt-1" id="metric-events">0</div>
    </div>
    <div class="bg-white p-5 rounded-xl border border-zinc-200 shadow-xs">
      <div class="text-[11px] font-bold uppercase text-zinc-400">Database Sync</div>
      <div class="text-sm font-bold text-emerald-600 flex items-center gap-1.5 mt-2">
        <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span> Connected & Active
      </div>
    </div>
  </div>

  <!-- Event-Grouped Roster & Action Command Center -->
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-bold text-zinc-900">Event-Grouped Rosters & Check-In</h2>
      <span class="text-xs text-zinc-500">Click any event to view attendees, toggle payments, and verify check-ins</span>
    </div>
    <div id="event-roster-accordions" class="space-y-4"></div>
  </div>

  <!-- Past Showcase Controls -->
  <div class="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-bold text-zinc-900">Past Hangouts Showcase Management</h2>
        <p class="text-xs text-zinc-500">Remove or manage community inspiration memories from the public page</p>
      </div>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5" id="admin-past-grid"></div>
  </div>

  <!-- Edit Attendee Modal -->
  <div id="edit-modal" class="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 hidden z-50">
    <div class="bg-white w-full max-w-md rounded-2xl p-6 space-y-4 shadow-2xl">
      <h3 class="text-lg font-bold text-zinc-900">Edit Signup Details</h3>
      <form onsubmit="saveAttendeeEdit(event)" class="space-y-3">
        <input type="hidden" id="edit-att-id">
        <div>
          <label class="block text-xs font-bold text-zinc-600 mb-1">Participant Name</label>
          <input type="text" id="edit-att-name" required class="w-full px-3 py-2 border rounded-lg text-sm">
        </div>
        <div>
          <label class="block text-xs font-bold text-zinc-600 mb-1">Email Address</label>
          <input type="email" id="edit-att-email" class="w-full px-3 py-2 border rounded-lg text-sm">
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
        <div class="flex items-center gap-4">
          <label class="flex items-center gap-1.5 text-xs font-bold text-zinc-800">
            <input type="checkbox" id="edit-att-checkin" class="rounded text-[#be1e2d]">
            <span>Checked In at Door</span>
          </label>
          <label class="flex items-center gap-1.5 text-xs font-bold text-amber-800">
            <input type="checkbox" id="edit-att-waitlist" class="rounded text-amber-600">
            <span>On Waitlist</span>
          </label>
        </div>
        <div class="pt-3 flex justify-end gap-2">
          <button type="button" onclick="closeEditModal()" class="px-4 py-2 rounded-lg bg-zinc-100 text-zinc-700 text-xs font-bold">Cancel</button>
          <button type="submit" class="px-4 py-2 rounded-lg bg-[#be1e2d] text-white text-xs font-bold">Save Changes</button>
        </div>
      </form>
    </div>
  </div>

  <script>
    let rawData = { events: [], pastShowcase: [] };

    async function fetchAdminData() {
      try {
        const res = await fetch('/api/admin/events');
        rawData = await res.json();
        renderAll();
      } catch (e) {
        console.error("Failed to load admin data:", e);
      }
    }

    function renderAll() {
      let totalRaised = 0;
      let totalSpots = 0;

      const container = document.getElementById('event-roster-accordions');
      container.innerHTML = '';

      rawData.events.forEach(ev => {
        let confirmedQty = 0;
        let emailsList = [];

        ev.attendees.forEach(a => {
          const qty = a.quantity || 1;
          if (!a.isWaitlist) {
            confirmedQty += qty;
            totalRaised += (a.paid !== undefined ? a.paid : (ev.price * qty));
          }
          if (a.email && a.email.includes('@')) emailsList.push(a.email);
        });
        totalSpots += confirmedQty;

        const accordion = document.createElement('div');
        accordion.className = "bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden";
        accordion.innerHTML = \`
          <div class="p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-zinc-100">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold px-2 py-0.5 rounded-full \${ev.status === 'Open' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">\${ev.status}</span>
                <span class="text-xs text-zinc-500">\${ev.displayDate} • \${ev.location}</span>
              </div>
              <h3 class="text-lg font-bold text-zinc-900 mt-0.5 font-heading">\${ev.title}</h3>
              <p class="text-xs text-zinc-500">Host: <strong class="text-zinc-700">\${ev.host}</strong> | Cost: <strong class="text-emerald-700">$\${ev.price}</strong> | Spots: <strong class="text-zinc-800">\${confirmedQty} / \${ev.totalSpots}</strong></p>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <button onclick="copyGroupEmails('\${emailsList.join(';')}')" class="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold flex items-center gap-1">
                <i data-lucide="mail" class="w-3.5 h-3.5"></i> Copy \${emailsList.length} Emails
              </button>
              <button onclick="editEventSettings(\${ev.id})" class="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold">
                Settings
              </button>
              <button onclick="deleteEvent(\${ev.id})" class="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 text-xs font-bold">
                Delete
              </button>
            </div>
          </div>
          <div class="p-4 overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-zinc-50 text-zinc-700 uppercase font-bold text-[10px]">
                <tr>
                  <th class="py-2.5 px-3">Participant</th>
                  <th class="py-2.5 px-3">Spots</th>
                  <th class="py-2.5 px-3">Amount & Method</th>
                  <th class="py-2.5 px-3">Payment Status</th>
                  <th class="py-2.5 px-3">Check-In</th>
                  <th class="py-2.5 px-3">Notes</th>
                  <th class="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-100">
                \${ev.attendees.map(a => \`
                  <tr class="hover:bg-zinc-50">
                    <td class="py-2.5 px-3 font-bold text-zinc-900">
                      <div>\${a.name} \${a.isWaitlist ? '<span class=\"text-[9px] bg-amber-100 text-amber-800 px-1 py-0.5 rounded font-bold ml-1\">WAITLIST</span>' : ''}</div>
                      <div class="text-[10px] text-zinc-400 font-normal">\${a.email || a.grade}</div>
                    </td>
                    <td class="py-2.5 px-3 font-semibold text-zinc-800">\${a.quantity || 1}</td>
                    <td class="py-2.5 px-3 font-semibold text-emerald-700">$\${a.paid} <span class="text-[9px] text-zinc-400 font-normal">(\${a.method})</span></td>
                    <td class="py-2.5 px-3">
                      <button onclick="togglePaymentStatus(\${a.id}, '\${a.status === 'Verified' ? 'Pending' : 'Verified'}')" class="px-2 py-0.5 rounded text-[10px] font-bold \${a.status === 'Verified' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                        \${a.status || 'Pending'}
                      </button>
                    </td>
                    <td class="py-2.5 px-3">
                      <button onclick="toggleCheckIn(\${a.id}, \${!a.checkedIn})" class="px-2 py-0.5 rounded text-[10px] font-bold \${a.checkedIn ? 'bg-blue-100 text-blue-800' : 'bg-zinc-100 text-zinc-500'}">
                        \${a.checkedIn ? '✓ Here' : 'Not Here'}
                      </button>
                    </td>
                    <td class="py-2.5 px-3 text-zinc-500 text-[11px] max-w-[140px] truncate">\${a.notes || '—'}</td>
                    <td class="py-2.5 px-3 text-right space-x-2">
                      \${a.isWaitlist ? \`<button onclick="promoteWaitlist(\${a.id})" class="text-xs text-amber-700 font-bold hover:underline">Promote</button>\` : ''}
                      <button onclick="openEditAttendee(\${a.id})" class="text-xs text-blue-600 font-bold hover:underline">Edit</button>
                      <button onclick="deleteAttendee(\${a.id})" class="text-xs text-red-600 font-bold hover:underline">Remove</button>
                    </td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        \`;
        container.appendChild(accordion);
      });

      document.getElementById('metric-raised').textContent = '$' + totalRaised.toLocaleString();
      document.getElementById('metric-spots').textContent = totalSpots;
      document.getElementById('metric-events').textContent = rawData.events.length;

      // Render Past Showcase Table
      const pastGrid = document.getElementById('admin-past-grid');
      pastGrid.innerHTML = '';
      rawData.pastShowcase.forEach(p => {
        const div = document.createElement('div');
        div.className = "p-3 rounded-xl border border-zinc-200 bg-zinc-50 flex items-center justify-between gap-2";
        div.innerHTML = \`
          <div class="truncate">
            <h4 class="font-bold text-xs text-zinc-900 truncate">\${p.title}</h4>
            <span class="text-[10px] text-zinc-500">\${p.price} • \${p.category}</span>
          </div>
          <button onclick="deletePastEvent('\${p.id}')" class="text-xs text-red-600 font-bold hover:underline shrink-0">Remove</button>
        \`;
        pastGrid.appendChild(div);
      });

      lucide.createIcons();
    }

    function copyGroupEmails(emails) {
      if (!emails) { alert("No emails registered for this event."); return; }
      navigator.clipboard.writeText(emails);
      alert("Copied " + emails.split(';').length + " emails to clipboard!");
    }

    async function togglePaymentStatus(attId, nextStatus) {
      await fetch('/api/admin/signups/' + attId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
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

    async function promoteWaitlist(attId) {
      await fetch('/api/admin/signups/' + attId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isWaitlist: false, status: 'Verified' })
      });
      fetchAdminData();
    }

    async function deletePastEvent(pastId) {
      if (!confirm("Remove this event from the past showcase?")) return;
      await fetch('/api/admin/past/' + pastId, { method: 'DELETE' });
      fetchAdminData();
    }

    function openEditAttendee(attId) {
      let found = null;
      rawData.events.forEach(e => {
        const a = e.attendees.find(x => x.id === attId);
        if (a) found = a;
      });
      if (!found) return;

      document.getElementById('edit-att-id').value = found.id;
      document.getElementById('edit-att-name').value = found.name;
      document.getElementById('edit-att-email').value = found.email || '';
      document.getElementById('edit-att-grade').value = found.grade || 'Parents Only';
      document.getElementById('edit-att-quantity').value = found.quantity || 1;
      document.getElementById('edit-att-paid').value = found.paid || 0;
      document.getElementById('edit-att-method').value = found.method || 'card';
      document.getElementById('edit-att-notes').value = found.notes || '';
      document.getElementById('edit-att-checkin').checked = Boolean(found.checkedIn);
      document.getElementById('edit-att-waitlist').checked = Boolean(found.isWaitlist);
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
        email: document.getElementById('edit-att-email').value,
        grade: document.getElementById('edit-att-grade').value,
        quantity: document.getElementById('edit-att-quantity').value,
        paid: document.getElementById('edit-att-paid').value,
        method: document.getElementById('edit-att-method').value,
        notes: document.getElementById('edit-att-notes').value,
        checkedIn: document.getElementById('edit-att-checkin').checked,
        isWaitlist: document.getElementById('edit-att-waitlist').checked
      };

      await fetch('/api/admin/signups/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      closeEditModal();
      fetchAdminData();
    }

    async function deleteAttendee(attId) {
      if (!confirm("Remove this attendee?")) return;
      await fetch('/api/admin/signups/' + attId, { method: 'DELETE' });
      fetchAdminData();
    }

    async function deleteEvent(eventId) {
      if (!confirm("Permanently delete this event and its registrations?")) return;
      await fetch('/api/admin/events/' + eventId, { method: 'DELETE' });
      fetchAdminData();
    }

    function downloadCSV() {
      let csv = "Guest Name,Email,Grade,Event,Spots,Amount Paid,Method,Status,Notes,Checked In\\n";
      rawData.events.forEach(e => {
        e.attendees.forEach(a => {
          csv += \`"\${a.name}","\${a.email || ''}","\${a.grade}","\${e.title}","\${a.quantity || 1}","\${a.paid}","\${a.method}","\${a.status}","\${(a.notes||'').replace(/"/g, '""')}","\${a.checkedIn ? 'Yes' : 'No'}"\\n\`;
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
});
