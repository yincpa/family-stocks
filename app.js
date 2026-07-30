
// ============================================================
// EMBEDDED CONFIG — fill in before uploading to GitHub
// ============================================================
var EMBEDDED = {
  finnhubKey:      'd8hjlm9r01qrn5ecetj0d8hjlm9r01qrn5ecetjg',
  startingBalance: 100000,
  adminPassword:   'seattle123’,
  firebaseConfig: {
    apiKey:            'AIzaSyDCUoZhyBZyi2tVk1Ef_621KcsShjYqa8M',
    authDomain:        'family-stocks-2f1cb.firebaseapp.com',
    databaseURL:       'https://family-stocks-2f1cb-default-rtdb.firebaseio.com',
    projectId:         'family-stocks-2f1cb',
    storageBucket:     '',
    messagingSenderId: '',
    appId:             '',
  }
};


// ============================================================
// CONSTANTS
// ============================================================
var AVATAR_COLORS = [
  {color:'#4f8ef7',bg:'rgba(79,142,247,0.2)'},
  {color:'#a78bfa',bg:'rgba(167,139,250,0.2)'},
  {color:'#6ee7b7',bg:'rgba(110,231,183,0.2)'},
  {color:'#f59e0b',bg:'rgba(245,158,11,0.2)'},
  {color:'#f472b6',bg:'rgba(244,114,182,0.2)'},
  {color:'#34d399',bg:'rgba(52,211,153,0.2)'},
  {color:'#fb923c',bg:'rgba(251,146,60,0.2)'},
  {color:'#e879f9',bg:'rgba(232,121,249,0.2)'},
];
var DEFAULT_MEMBERS = [
  {id:'dad',  name:'Dad',   initials:'D',colorIdx:0,emoji:'D',isCore:true},
  {id:'pam',  name:'Pam',   initials:'P',colorIdx:1,emoji:'P',isCore:true},
  {id:'caden',name:'Caden', initials:'C',colorIdx:2,emoji:'C',isCore:true},
];
var MARKET_SYMBOLS = ['SPY','QQQ','AAPL','MSFT','NVDA','TSLA'];
var TIPS = [
  "<b>Buy low, sell high.</b> Patience is everything.",
  "<b>Diversify.</b> Spread across companies to reduce risk.",
  "<b>Think long-term.</b> Warren Buffett says his favorite holding period is 'forever.'",
  "<b>Volatility is normal.</b> A price drop doesn't mean you've lost — unless you sell.",
  "<b>Research before you buy.</b> Would you use their product?",
  "<b>Emotions are the enemy.</b> Fear and greed cause bad decisions. Stick to a plan.",
  "<b>Cash is a position too.</b> Sometimes waiting for better opportunities is the right move.",
  "<b>P/E Ratio:</b> Price-to-Earnings shows how expensive a stock is. High = pricey, Low = potential deal.",
  "<b>Earnings reports matter.</b> Companies report results every 3 months. Good news can send stocks up.",
  "<b>Start small, learn lots.</b> The best time to make mistakes is with fake money. Like this!",
  "<b>Index funds in real life.</b> Most fund managers can't beat the S&P 500 index over time.",
  "<b>Dividends are a bonus.</b> Some companies pay you cash just for owning their stock.",
];

// ============================================================
// STATE
// ============================================================
var db = null, cfg = null;
var members = [], portfolios = {};
var activePlayer = null, currentQuote = null;
var tipIndex = Math.floor(Math.random() * TIPS.length);
var newMemberColorIdx = 3;
var pinEntry = '', pinCallback = null, pinMode = 'verify';
var pinNewTemp = '', pinTargetMember = null;
var refreshTimer = null, isRefreshing = false;
var chatMessages = [];

// ============================================================
// FIREBASE (using compat SDK - window.firebase)
// ============================================================
function initFirebase(fc) {
  firebase.initializeApp(fc);
  db = firebase.database();
}
function fbRef(path) { return db.ref(path); }
function fbSet(path, val) { return fbRef(path).set(val); }
function fbGet(path) { return fbRef(path).once('value').then(function(s){ return s.exists() ? s.val() : null; }); }
function fbUpdate(path, val) { return fbRef(path).update(val); }
function fbRemove(path) { return fbRef(path).remove(); }
function fbListen(path, cb) { fbRef(path).on('value', function(s){ cb(s.exists() ? s.val() : null); }); }
function blankPortfolio(bal) { return {cash:bal, holdings:{}, history:[]}; }

function saveConfig(c) { try { localStorage.setItem('fsc_cfg', JSON.stringify(c)); } catch(e){} }
function loadConfig() { try { return JSON.parse(localStorage.getItem('fsc_cfg')); } catch(e) { return null; } }
function isEmbeddedConfigured() {
  return !!(EMBEDDED.finnhubKey && EMBEDDED.startingBalance > 0 &&
    EMBEDDED.firebaseConfig.apiKey && EMBEDDED.firebaseConfig.databaseURL);
}

// ============================================================
// HELPERS
// ============================================================
function fmt(n, d) {
  d = d === undefined ? 2 : d;
  return '$' + Number(n).toLocaleString('en-US', {minimumFractionDigits:d, maximumFractionDigits:d});
}
function fmtPct(n) { return (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%'; }
function memberColor(m) { return AVATAR_COLORS[m.colorIdx % AVATAR_COLORS.length]; }
function memberInitials(name) { return name.split(' ').map(function(w){return w[0];}).join('').toUpperCase().slice(0,2); }
function rankEmoji(i) { return ['🥇','🥈','🥉'][i] || (i+1)+''; }
function showToast(msg, type) {
  type = type || 'success';
  var t = document.getElementById('toast');
  t.className = 'show ' + type;
  t.innerHTML = msg;
  setTimeout(function(){ t.className = ''; }, 3200);
}
function setLoading(btn, on, label) {
  if (on) { btn.disabled = true; btn._orig = btn.innerHTML; btn.innerHTML = '<span class="spin">&#8635;</span> ' + (label||'...'); }
  else { btn.disabled = false; btn.innerHTML = btn._orig || label || ''; }
}
function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\n/g,'<br>');
}
function timeAgo(ts) {
  var diff = Math.floor((Date.now() - ts * 1000) / 1000);
  if (diff < 60) return diff + 's ago';
  if (diff < 3600) return Math.floor(diff/60) + 'm ago';
  if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
  return Math.floor(diff/86400) + 'd ago';
}

// ============================================================
// WIZARD
// ============================================================
var wizardStep = 1;
function renderWizard() {
  var el = document.getElementById('wizardContent');
  if (wizardStep === 1) {
    el.innerHTML = '<div class="step-indicator"><div class="step-dot done"></div><div class="step-dot"></div><div class="step-dot"></div></div>' +
      '<div class="modal-title">Admin Setup</div>' +
      '<div class="modal-sub">Fill this in once. After uploading to GitHub, your family opens the URL and goes straight to trading.</div>' +
      '<div class="form-group"><label class="form-label">Starting Balance Per Player</label><input class="form-input" id="w_balance" type="number" value="100000" min="1000"></div>' +
      '<div class="form-group"><label class="form-label">Finnhub API Key</label><input class="form-input" id="w_finnhub" placeholder="d1abc2xyz..."><div class="hint">Free at <a href="https://finnhub.io" target="_blank">finnhub.io</a></div></div>' +
      '<div class="form-group"><label class="form-label">Admin Password</label><input class="form-input" id="w_adminpw" type="password" placeholder="Choose a secret password"></div>' +
      '<button class="btn btn-primary btn-full" id="w1next">Next: Firebase Setup</button>';
    document.getElementById('w1next').onclick = function() {
      var bal = parseInt(document.getElementById('w_balance').value);
      var fk = document.getElementById('w_finnhub').value.trim();
      var ap = document.getElementById('w_adminpw').value.trim();
      if (!fk) { showToast('Enter your Finnhub API key','error'); return; }
      if (!bal || bal < 100) { showToast('Enter a valid starting balance','error'); return; }
      if (!ap) { showToast('Choose an admin password','error'); return; }
      cfg = {finnhubKey:fk, startingBalance:bal, adminPassword:ap};
      wizardStep = 2; renderWizard();
    };
  } else if (wizardStep === 2) {
    el.innerHTML = '<div class="step-indicator"><div class="step-dot done"></div><div class="step-dot done"></div><div class="step-dot"></div></div>' +
      '<div class="modal-title">Firebase Setup</div>' +
      '<div class="modal-sub">Go to Firebase Project Settings, find your app config, and paste each value below.</div>' +
      '<div class="form-group"><label class="form-label">Firebase API Key</label><input class="form-input" id="fb_apiKey" placeholder="AIzaSy..."></div>' +
      '<div class="form-group"><label class="form-label">Auth Domain</label><input class="form-input" id="fb_authDomain" placeholder="family-stocks.firebaseapp.com"></div>' +
      '<div class="form-group"><label class="form-label">Database URL</label><input class="form-input" id="fb_dbUrl" placeholder="https://family-stocks-default-rtdb.firebaseio.com"></div>' +
      '<div class="form-group"><label class="form-label">Project ID</label><input class="form-input" id="fb_projectId" placeholder="family-stocks"></div>' +
      '<div style="display:flex;gap:8px;margin-top:8px;"><button class="btn btn-ghost" id="w2back" style="flex:1;">Back</button><button class="btn btn-primary" id="w2next" style="flex:2;">Next</button></div>';
    document.getElementById('w2back').onclick = function(){ wizardStep=1; renderWizard(); };
    document.getElementById('w2next').onclick = function() {
      var apiKey = document.getElementById('fb_apiKey').value.trim();
      var authDomain = document.getElementById('fb_authDomain').value.trim();
      var databaseURL = document.getElementById('fb_dbUrl').value.trim();
      var projectId = document.getElementById('fb_projectId').value.trim();
      if (!apiKey||!authDomain||!databaseURL||!projectId) { showToast('Fill in all Firebase fields','error'); return; }
      cfg.firebaseConfig = {apiKey:apiKey, authDomain:authDomain, databaseURL:databaseURL, projectId:projectId, storageBucket:'', messagingSenderId:'', appId:''};
      wizardStep = 3; renderWizard();
    };
  } else if (wizardStep === 3) {
    var html = '<div class="step-indicator"><div class="step-dot done"></div><div class="step-dot done"></div><div class="step-dot done"></div></div>' +
      '<div class="modal-title">Starting Members</div>' +
      '<div class="modal-sub">Dad, Pam, and Caden start by default. Each player creates their own PIN on their first trade.</div>';
    DEFAULT_MEMBERS.forEach(function(m) {
      var c = AVATAR_COLORS[m.colorIdx];
      html += '<div class="member-item"><div class="avatar" style="background:' + c.bg + ';color:' + c.color + ';">' + m.initials + '</div><div class="member-info"><div class="member-name">' + m.name + '</div><div class="member-sub">Starting with ' + fmt(cfg.startingBalance) + '</div></div></div>';
    });
    html += '<div style="display:flex;gap:8px;margin-top:20px;"><button class="btn btn-ghost" id="w3back" style="flex:1;">Back</button><button class="btn btn-primary" id="w3launch" style="flex:2;">Launch!</button></div>';
    el.innerHTML = html;
    document.getElementById('w3back').onclick = function(){ wizardStep=2; renderWizard(); };
    document.getElementById('w3launch').onclick = launchApp;
  }
}

function launchApp() {
  var btn = document.getElementById('w3launch');
  setLoading(btn, true, 'Connecting...');
  try {
    initFirebase(cfg.firebaseConfig);
  } catch(e) {
    showToast('Firebase init failed: ' + e.message, 'error');
    setLoading(btn, false, 'Launch!');
    return;
  }
  fbSet('config', {finnhubKey:cfg.finnhubKey, startingBalance:cfg.startingBalance, adminPassword:cfg.adminPassword, firebaseConfig:cfg.firebaseConfig})
  .then(function() {
    var promises = DEFAULT_MEMBERS.map(function(m) {
      return fbGet('members/' + m.id).then(function(ex) {
        if (!ex) {
          return fbSet('members/' + m.id, {id:m.id,name:m.name,initials:m.initials,colorIdx:m.colorIdx,emoji:m.initials,pin:null,isCore:true})
            .then(function(){ return fbSet('portfolios/' + m.id, blankPortfolio(cfg.startingBalance)); });
        }
      });
    });
    return Promise.all(promises);
  })
  .then(function() {
    saveConfig(cfg);
    document.getElementById('setupOverlay').classList.add('hidden');
    startApp();
  })
  .catch(function(e) {
    showToast('Firebase error: ' + e.message, 'error');
    setLoading(btn, false, 'Launch!');
  });
}

// ============================================================
// BOOT
// ============================================================
window.addEventListener('load', function() {
  // ACCESS CODE CHECK — runs before anything else
  checkAccessCode();
});

function checkAccessCode() {
  // First, we need Firebase to verify the code
  // If EMBEDDED config is available, init Firebase and check
  if (isEmbeddedConfigured()) {
    try { initFirebase(EMBEDDED.firebaseConfig); } catch(e) {}
  } else {
    var saved = loadConfig();
    if (saved && saved.firebaseConfig) {
      try { initFirebase(saved.firebaseConfig); } catch(e) {}
    }
  }

  if (!db) {
    // No Firebase — skip access code, proceed to normal boot
    proceedToApp();
    return;
  }

  // Check if access code is set in Firebase
  fbGet('config/accessCode').then(function(code) {
    if (!code) {
      // No access code set — proceed without it
      proceedToApp();
      return;
    }

    // Access code exists — check if user has the right token
    var storedCode = null;
    try { storedCode = localStorage.getItem('fsc_access'); } catch(e) {}

    if (storedCode === code) {
      // Correct token — proceed
      proceedToApp();
    } else {
      // Show access code screen
      document.getElementById('setupOverlay').style.display = 'none';
      document.getElementById('accessOverlay').style.display = 'flex';
    }
  }).catch(function() {
    // Firebase error — proceed without access check
    proceedToApp();
  });
}

// Access code submit handler
document.getElementById('accessSubmitBtn').addEventListener('click', submitAccessCode);
document.getElementById('accessCodeInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') submitAccessCode();
});

function submitAccessCode() {
  var input = document.getElementById('accessCodeInput');
  var code = input.value.trim();
  if (!code) { document.getElementById('accessError').textContent = 'Please enter the access code.'; return; }

  var btn = document.getElementById('accessSubmitBtn');
  setLoading(btn, true, 'Checking...');

  fbGet('config/accessCode').then(function(correctCode) {
    if (code === correctCode) {
      // Correct! Save to localStorage and proceed
      try { localStorage.setItem('fsc_access', code); } catch(e) {}
      document.getElementById('accessOverlay').style.display = 'none';
      // Re-initialize since we may have already init'd Firebase
      db = null;
      proceedToApp();
    } else {
      document.getElementById('accessError').textContent = 'Wrong code. Ask your family admin for the access code.';
      input.value = '';
      input.focus();
    }
  }).catch(function(e) {
    document.getElementById('accessError').textContent = 'Connection error. Try again.';
  }).then(function() {
    setLoading(btn, false, 'Enter');
  });
}

function proceedToApp() {
  // Reset Firebase if needed (checkAccessCode may have initialized it)
  db = null;
  // Run the original boot sequence
  originalBoot();
}

function originalBoot() {
  // PATH 1: Embedded config filled in
  if (isEmbeddedConfigured()) {
    cfg = {finnhubKey:EMBEDDED.finnhubKey, startingBalance:EMBEDDED.startingBalance, adminPassword:EMBEDDED.adminPassword, firebaseConfig:EMBEDDED.firebaseConfig};
    try { initFirebase(cfg.firebaseConfig); } catch(e) { showError('Firebase init failed: ' + e.message); return; }
    fbGet('config').then(function(fbCfg) {
      if (!fbCfg) {
        fbSet('config', {finnhubKey:cfg.finnhubKey, startingBalance:cfg.startingBalance, adminPassword:cfg.adminPassword, firebaseConfig:cfg.firebaseConfig});
        DEFAULT_MEMBERS.forEach(function(m) {
          fbSet('members/' + m.id, {id:m.id,name:m.name,initials:m.initials,colorIdx:m.colorIdx,emoji:m.initials,pin:null,isCore:true});
          fbSet('portfolios/' + m.id, blankPortfolio(cfg.startingBalance));
        });
      } else {
        cfg = Object.assign({}, cfg, fbCfg, {firebaseConfig: cfg.firebaseConfig});
      }
      saveConfig(cfg);
      document.getElementById('setupOverlay').classList.add('hidden');
      startApp();
    }).catch(function(e) { showError('Firebase connection failed: ' + e.message); });
    return;
  }
  // PATH 2: localStorage
  var saved = loadConfig();
  if (saved && saved.firebaseConfig) {
    cfg = saved;
    try { initFirebase(cfg.firebaseConfig); } catch(e) { renderWizard(); return; }
    fbGet('config').then(function(fbCfg) {
      if (fbCfg) {
        cfg = Object.assign({}, saved, fbCfg, {firebaseConfig: saved.firebaseConfig});
        saveConfig(cfg);
        document.getElementById('setupOverlay').classList.add('hidden');
        startApp();
      } else { renderWizard(); }
    }).catch(function(){ renderWizard(); });
    return;
  }
  // PATH 3: Show wizard
  renderWizard();
}

function showError(msg) {
  document.getElementById('wizardContent').innerHTML =
    '<div style="padding:20px;"><div style="font-size:18px;font-weight:700;color:#ef4444;margin-bottom:8px;">Connection Error</div>' +
    '<div style="font-size:13px;color:#7a8299;margin-bottom:12px;">Check that your EMBEDDED values are correct.</div>' +
    '<div style="font-family:monospace;font-size:12px;background:#1d2230;padding:12px;border-radius:8px;color:#e8eaf0;word-break:break-all;">' + msg + '</div>' +
    '<button class="btn btn-primary" style="margin-top:16px;width:100%;" onclick="location.reload()">Try Again</button></div>';
}

// ============================================================
// APP START
// ============================================================
function startApp() {
  fbListen('/', function(data) {
    if (!data) return;
    members = data.members ? Object.values(data.members) : [];
    portfolios = data.portfolios || {};
    if (!activePlayer && members.length > 0) activePlayer = members[0].id;
    renderAll();
    updateChatPlaceholder();
  });
  updateMarketStatus();
  setInterval(updateMarketStatus, 60000);
  renderTip();
  renderMarketSnapshot();
  setInterval(renderMarketSnapshot, 120000);
  setTimeout(function(){ refreshAllPrices(); scheduleRefresh(); }, 1000);
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) refreshAllPrices(); });
  startChat();
  renderMarketNews();
  setInterval(renderMarketNews, 30*60*1000);
  // Check and execute any pending orders from after hours
  setTimeout(checkAndExecutePendingOrders, 3000);
}

// ============================================================
// MARKET STATUS & REFRESH
// ============================================================
function isMarketOpen() {
  var et = new Date(new Date().toLocaleString('en-US', {timeZone:'America/New_York'}));
  var day = et.getDay(), h = et.getHours() + et.getMinutes()/60;
  return day >= 1 && day <= 5 && h >= 9.5 && h < 16;
}
function updateMarketStatus() {
  var open = isMarketOpen();
  document.getElementById('statusText').textContent = open ? 'Market Open' : 'Market Closed';
  document.getElementById('statusDot').className = 'status-dot pulse' + (open ? '' : ' closed');
}
function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  var interval = isMarketOpen() ? 2*60*1000 : 15*60*1000;
  refreshTimer = setTimeout(function(){ refreshAllPrices(); scheduleRefresh(); }, interval);
}
function refreshAllPrices() {
  if (isRefreshing) return;
  isRefreshing = true;
  var symbolSet = {};
  Object.values(portfolios).forEach(function(p) {
    if (!p || !p.holdings) return;
    Object.keys(p.holdings).forEach(function(sym) { if (p.holdings[sym].shares > 0) symbolSet[sym] = true; });
  });
  var symbols = Object.keys(symbolSet);
  if (!symbols.length) { isRefreshing = false; return; }
  var open = isMarketOpen();
  var base = open ? 'Market Open' : 'Market Closed';
  document.getElementById('statusText').textContent = base + ' (updating...)';
  var quotes = {};
  var chain = Promise.resolve();
  symbols.forEach(function(sym) {
    chain = chain.then(function() {
      return fetchQuote(sym).then(function(q){ quotes[sym] = {price:q.price, change:q.change||0}; }).catch(function(){});
    }).then(function(){ return new Promise(function(r){ setTimeout(r, 250); }); });
  });
  chain.then(function() {
    var updates = {};
    Object.keys(portfolios).forEach(function(playerId) {
      var p = portfolios[playerId];
      if (!p || !p.holdings) return;
      Object.keys(p.holdings).forEach(function(sym) {
        if (p.holdings[sym].shares > 0 && quotes[sym]) {
          updates['portfolios/' + playerId + '/holdings/' + sym + '/lastPrice'] = quotes[sym].price; updates['portfolios/' + playerId + '/holdings/' + sym + '/dayChange'] = quotes[sym].change;
        }
      });
    });
    if (Object.keys(updates).length > 0) return db.ref().update(updates);
  }).then(function() {
    var now = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    document.getElementById('statusText').textContent = base + ' (updated ' + now + ')';
  }).catch(function(e){ console.warn('Refresh failed', e); })
  .then(function(){ isRefreshing = false; });
}

// ============================================================
// FINNHUB
// ============================================================
function fetchQuote(symbol) {
  return fetch('https://finnhub.io/api/v1/quote?symbol=' + symbol.toUpperCase() + '&token=' + cfg.finnhubKey)
    .then(function(r){ return r.json(); })
    .then(function(d){ if (!d || !d.c) throw new Error('Not found'); return {symbol:symbol.toUpperCase(), price:d.c, change:d.d, changePct:d.dp}; });
}
function fetchProfile(symbol) {
  return fetch('https://finnhub.io/api/v1/stock/profile2?symbol=' + symbol.toUpperCase() + '&token=' + cfg.finnhubKey)
    .then(function(r){ return r.json(); }).catch(function(){ return {}; });
}
function fetchStockNews(symbol) {
  var to = new Date().toISOString().slice(0,10);
  var from = new Date(Date.now()-7*24*60*60*1000).toISOString().slice(0,10);
  return fetch('https://finnhub.io/api/v1/company-news?symbol=' + symbol.toUpperCase() + '&from=' + from + '&to=' + to + '&token=' + cfg.finnhubKey)
    .then(function(r){ return r.json(); }).then(function(d){ return Array.isArray(d) ? d.slice(0,4) : []; }).catch(function(){ return []; });
}
function fetchMarketNews() {
  return fetch('https://finnhub.io/api/v1/news?category=general&token=' + cfg.finnhubKey)
    .then(function(r){ return r.json(); }).then(function(d){ return Array.isArray(d) ? d.slice(0,6) : []; }).catch(function(){ return []; });
}
function renderNewsItems(items, containerId) {
  var el = document.getElementById(containerId);
  if (!el) return;
  if (!items.length) { el.innerHTML = '<div style="font-size:13px;color:var(--muted);">No recent news found.</div>'; return; }
  el.innerHTML = items.map(function(n) {
    return '<div class="news-item"><a class="news-headline" href="' + n.url + '" target="_blank" rel="noopener">' + escapeHtml(n.headline) + '</a><div class="news-meta"><span class="news-source">' + escapeHtml(n.source||'') + '</span><span>' + timeAgo(n.datetime) + '</span></div></div>';
  }).join('');
}
function renderMarketNews() {
  if (!cfg || !cfg.finnhubKey) return;
  fetchMarketNews().then(function(news){ renderNewsItems(news, 'marketNews'); });
}

// ============================================================
// RENDER
// ============================================================
function renderPlayerTabs() {
  var bar = document.getElementById('playerBar');
  var html = members.map(function(m) {
    var c = memberColor(m);
    var avatarContent = m.avatarImg ? '<img class="avatar-img" src="' + m.avatarImg + '" alt="">' : (m.emoji||memberInitials(m.name));
    return '<div class="player-tab' + (activePlayer===m.id?' active':'') + '" data-pid="' + m.id + '"><div class="avatar avatar-sm" style="background:' + c.bg + ';color:' + c.color + ';">' + avatarContent + '</div>' + m.name + '</div>';
  }).join('') + '<div class="add-member-tab" id="addMemberTabBtn">+ Add Member</div>';
  bar.innerHTML = html;
  bar.querySelectorAll('.player-tab').forEach(function(el) {
    el.addEventListener('click', function() {
      activePlayer = el.dataset.pid; renderAll(); updateChatPlaceholder();
      var box = document.getElementById('chatBox');
      if (box) { box.dataset.lastHash = ''; renderChat(); }
    });
  });
  var addBtn = document.getElementById('addMemberTabBtn');
  if (addBtn) addBtn.addEventListener('click', openAddMember);
}
function calcHoldingsValue(p) {
  if (!p || !p.holdings) return 0;
  return Object.values(p.holdings).reduce(function(s,h){ return s + (h.shares||0)*(h.lastPrice||h.avgCost||0); }, 0);
}
function renderSummary() {
  var m = members.find(function(m){ return m.id===activePlayer; }); if (!m) return;
  var p = portfolios[m.id]; if (!p) return;
  document.getElementById('playerNameLabel').textContent = m.name + "'s Portfolio";
  var hv = calcHoldingsValue(p), nw = p.cash+hv, gain = nw-cfg.startingBalance, gainPct = (gain/cfg.startingBalance)*100;
  document.getElementById('statCash').textContent = fmt(p.cash);
  document.getElementById('statHoldings').textContent = fmt(hv);
  document.getElementById('statNet').textContent = fmt(nw);
  var ge = document.getElementById('statGain');
  ge.textContent = (gain>=0?'+':'') + fmt(gain); ge.className = 'stat-value ' + (gain>=0?'green':'red');
  document.getElementById('statGainPct').textContent = fmtPct(gainPct);
  document.getElementById('holdingsBar').style.width = Math.min(100, nw>0?(hv/nw)*100:0) + '%';
}
function renderHoldings() {
  var p = portfolios[activePlayer];
  var container = document.getElementById('holdingsContainer');
  if (!p||!p.holdings) { container.innerHTML='<div class="empty"><div class="empty-icon">📈</div>No positions yet.</div>'; return; }
  var active = Object.keys(p.holdings).filter(function(sym){ return p.holdings[sym].shares>0; });
  if (!active.length) { container.innerHTML='<div class="empty"><div class="empty-icon">📈</div>No positions yet. Look up a stock above!</div>'; return; }
  var rows = active.map(function(sym) {
    var h = p.holdings[sym];
    var cur = h.lastPrice||h.avgCost;
    var extCost = h.shares*h.avgCost, extTotal = h.shares*cur, pnl = extTotal-extCost, pnlPct = ((cur-h.avgCost)/h.avgCost)*100;
    var note = h.note||'';
    return '<tr><td class="col-stock"><span class="ticker-badge">' + sym + '</span></td>' +
      '<td class="col-shares" style="text-align:right;font-family:ui-monospace,monospace;">' + h.shares + '</td>' +
      '<td class="col-avg" style="text-align:right;font-family:ui-monospace,monospace;color:var(--muted);">' + fmt(h.avgCost) + '</td>' +
      '<td class="col-price" style="text-align:right;font-family:ui-monospace,monospace;">' + fmt(cur) + '</td>' +
      '<td class="col-daychg" style="text-align:right;font-family:ui-monospace,monospace;color:' + (h.dayChange>=0?'var(--green)':'var(--red)') + ';">' + (h.dayChange!=null?(h.dayChange>=0?'+':'')+fmt(h.dayChange):'--') + '</td>' +
      '<td class="col-excost" style="text-align:right;font-family:ui-monospace,monospace;color:var(--muted);">' + fmt(extCost) + '</td>' +
      '<td class="col-extot" style="text-align:right;font-family:ui-monospace,monospace;">' + fmt(extTotal) + '</td>' +
      '<td class="col-pnl" style="text-align:right;font-family:ui-monospace,monospace;color:' + (pnl>=0?'var(--green)':'var(--red)') + ';">' + (pnl>=0?'+':'') + fmt(pnl) + '<br><span style="font-size:10px;">' + fmtPct(pnlPct) + '</span></td>' +
      '<td class="col-sell" style="text-align:right;"><button class="sell-mini" data-sym="' + sym + '">Sell</button></td>' +
      '<td class="col-notes notes-cell" style="padding-left:12px;"><textarea class="note-input" data-sym="' + sym + '" rows="1" placeholder="Add a note...">' + escapeHtml(note) + '</textarea><div class="note-saved" id="note-saved-' + sym + '">saved</div></td></tr>';
  }).join('');
  container.innerHTML = '<table class="holdings-table"><colgroup><col class="col-stock"><col class="col-shares"><col class="col-avg"><col class="col-price"><col class="col-daychg"><col class="col-excost"><col class="col-extot"><col class="col-pnl"><col class="col-sell"><col class="col-notes"></colgroup>' +
    '<thead><tr><th class="col-stock" style="text-align:left;">Stock</th><th class="col-shares">Shares</th><th class="col-avg">Avg Cost</th><th class="col-price">Price</th><th class="col-daychg">Day Chg</th><th class="col-excost">Ext. Cost</th><th class="col-extot">Ext. Total</th><th class="col-pnl">Total Gain/Loss</th><th class="col-sell"></th><th class="col-notes" style="text-align:left;padding-left:12px;">My Notes</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>';
  container.querySelectorAll('.sell-mini').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.getElementById('tickerInput').value = btn.dataset.sym;
      document.getElementById('lookupBtn').click();
      setTimeout(function(){ document.getElementById('qtyInput').value = p.holdings[btn.dataset.sym]&&p.holdings[btn.dataset.sym].shares||1; }, 900);
    });
  });
  container.querySelectorAll('.note-input').forEach(function(ta) {
    var sym = ta.dataset.sym;
    function autoResize(){ ta.style.height='auto'; ta.style.height=ta.scrollHeight+'px'; }
    ta.addEventListener('input', autoResize); autoResize();
    function saveNote() {
      fbUpdate('portfolios/'+activePlayer+'/holdings/'+sym, {note:ta.value}).then(function(){
        var ind = document.getElementById('note-saved-'+sym);
        if (ind) { ind.classList.add('show'); setTimeout(function(){ ind.classList.remove('show'); }, 2000); }
      }).catch(function(e){ console.warn('Note save failed', e); });
    }
    ta.addEventListener('blur', saveNote);
    ta.addEventListener('keydown', function(e){ if ((e.ctrlKey||e.metaKey)&&e.key==='Enter'){ e.preventDefault(); ta.blur(); } if (e.key==='Escape'){ ta.blur(); } });
  });
}
function renderHistory() {
  var p = portfolios[activePlayer];
  var container = document.getElementById('historyContainer');
  if (!p||!p.history||!p.history.length) { container.innerHTML='<div class="empty"><div class="empty-icon">📋</div>No trades yet.</div>'; return; }
  var hist = Array.isArray(p.history) ? p.history : Object.values(p.history);
  var reversed = hist.slice().reverse();
  container.innerHTML = '<div style="font-size:12px;color:var(--muted);margin-bottom:10px;">' + hist.length + ' total trade' + (hist.length!==1?'s':'') + '</div>' +
  '<div style="max-height:500px;overflow-y:auto;">' + reversed.map(function(t) {
    return '<div class="hist-row"><span class="hist-badge ' + t.action + '">' + t.action + '</span><strong>' + t.symbol + '</strong> — ' + t.shares + ' share' + (t.shares!==1?'s':'') + ' @ ' + fmt(t.price) +
      '<span style="float:right;font-family:ui-monospace,monospace;color:' + (t.action==='BUY'?'var(--red)':'var(--green)') + ';">' + (t.action==='BUY'?'-':'+') + fmt(t.total) + '</span>' +
      '<div class="hist-meta">' + new Date(t.ts).toLocaleString() + ' · Balance after: ' + fmt(t.cashAfter) + '</div></div>';
  }).join('') + '</div>';
}
function renderLeaderboard() {
  var entries = members.map(function(m) {
    var p = portfolios[m.id], hv = p?calcHoldingsValue(p):0, nw = p?p.cash+hv:(cfg&&cfg.startingBalance||0);
    var gain = nw - (cfg&&cfg.startingBalance||0);
    var hist = p&&p.history ? (Array.isArray(p.history)?p.history:Object.values(p.history)) : [];
    return {m:m, nw:nw, gain:gain, gainPct:(gain/(cfg&&cfg.startingBalance||1))*100, trades:hist.length};
  }).sort(function(a,b){ return b.nw-a.nw; });
  document.getElementById('leaderboard').innerHTML = entries.map(function(e,i) {
    return '<div class="lb-row"><div class="lb-rank">' + rankEmoji(i) + '</div>' + (function(){ var c=memberColor(e.m); var av=e.m.avatarImg?'<img class="avatar-img" src="'+e.m.avatarImg+'" alt="">':( e.m.emoji||memberInitials(e.m.name)); return '<div class="avatar" style="background:'+c.bg+';color:'+c.color+';font-size:20px;width:44px;height:44px;">'+av+'</div>'; })() + '<div class="lb-info"><div class="lb-name">' + e.m.name + '</div><div class="lb-sub">' + (e.gainPct>=0?'\u25B2':'\u25BC') + ' ' + Math.abs(e.gainPct).toFixed(2) + '% return</div></div><div class="lb-value"><div class="lb-total">' + fmt(e.nw) + '</div><div class="lb-gain" style="color:' + (e.gain>=0?'var(--green)':'var(--red)') + ';">' + (e.gain>=0?'+':'') + fmt(e.gain) + '</div><div style="font-size:10px;color:var(--muted);margin-top:2px;">' + e.trades + ' trade' + (e.trades!==1?'s':'') + '</div></div></div>';
  }).join('');
}
function renderTip() { document.getElementById('tipText').innerHTML = TIPS[tipIndex % TIPS.length]; }
function renderMarketSnapshot() {
  if (!cfg||!cfg.finnhubKey) return;
  var container = document.getElementById('marketSnapshot');
  Promise.all(MARKET_SYMBOLS.map(function(s){ return fetchQuote(s).catch(function(){ return null; }); })).then(function(quotes) {
    container.innerHTML = MARKET_SYMBOLS.map(function(sym,i) {
      var q = quotes[i]; if (!q) return '';
      return '<div class="snap-row"><span style="font-weight:600;font-family:ui-monospace,monospace;color:var(--accent);">' + sym + '</span><span style="font-family:ui-monospace,monospace;">' + fmt(q.price) + '</span><span style="color:' + (q.change>=0?'var(--green)':'var(--red)') + ';">' + (q.change>=0?'▲':'▼') + ' ' + Math.abs(q.changePct||0).toFixed(2) + '%</span></div>';
    }).join('');
  });
}
// ============================================================
// ANNOUNCEMENT
// ============================================================
function renderAnnouncement() {
  var section = document.getElementById('announcementSection');
  if (!section) return;
  fbGet('announcement').then(function(data) {
    if (!data || !data.text) {
      section.style.display = 'none';
      return;
    }
    // Check if user dismissed this announcement
    var dismissedId = null;
    try { dismissedId = localStorage.getItem('fsc_dismissed_announce'); } catch(e) {}
    if (dismissedId === data.id) {
      section.style.display = 'none';
      return;
    }
    section.style.display = 'block';
    var timeStr = data.postedAt ? new Date(data.postedAt).toLocaleDateString([], {weekday:'short', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : '';
    section.innerHTML = '<div class="announce-bar">' +
      '<div class="announce-icon">📢</div>' +
      '<div class="announce-content">' +
        '<div class="announce-text">' + escapeHtml(data.text) + '</div>' +
        '<div class="announce-meta">Posted by Admin' + (timeStr ? ' · ' + timeStr : '') + '</div>' +
      '</div>' +
      '<button class="announce-dismiss" id="announceDismissBtn" title="Dismiss">×</button>' +
    '</div>';
    document.getElementById('announceDismissBtn').addEventListener('click', function() {
      try { localStorage.setItem('fsc_dismissed_announce', data.id); } catch(e) {}
      section.style.display = 'none';
    });
  });
}

function renderAll() { renderPlayerTabs(); renderSummary(); renderHoldings(); renderHistory(); renderLeaderboard(); renderPendingOrders(); renderAnnouncement(); }

// ============================================================
// STOCK LOOKUP
// ============================================================
// ============================================================
// CANDLESTICK CHART
// ============================================================
var chartSymbol = '';
var chartData = null;

function fetchCandles(symbol, days) {
  var now = Math.floor(Date.now() / 1000);
  var from = now - days * 24 * 60 * 60;
  var url = 'https://finnhub.io/api/v1/stock/candle?symbol=' + symbol.toUpperCase() + '&resolution=D&from=' + from + '&to=' + now + '&token=' + cfg.finnhubKey;
  return fetch(url)
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d && d.s === 'ok' && d.c && d.c.length) {
        var candles = [];
        for (var i = 0; i < d.c.length; i++) {
          candles.push({ o: d.o[i], h: d.h[i], l: d.l[i], c: d.c[i], v: d.v[i], t: d.t[i] });
        }
        return {candles:candles, reason:null};
      }
      return {candles:null, reason:'notavail', symbol:symbol};
    }).catch(function(e) {
      return {candles:null, reason:'notavail', symbol:symbol};
    });
}



var tvLoaded = false;
var usingTradingView = false;

function loadChart(symbol, days) {
  chartSymbol = symbol;
  var container = document.getElementById('chartContainer');
  container.style.display = 'block';

  // Update active range button
  document.querySelectorAll('.chart-range-btn').forEach(function(b) {
    b.classList.toggle('active', parseInt(b.dataset.range) === days);
  });

  var titleEl = document.querySelector('.chart-title');
  var tvRange = days <= 7 ? '5D' : days <= 30 ? '1M' : days <= 90 ? '3M' : days <= 180 ? '6M' : '12M';

  // If we already know TradingView is needed, skip Finnhub and go straight to TV
  if (usingTradingView) {
    showTradingView(symbol, tvRange);
    return;
  }

  // Try Finnhub candles first
  var wrap = document.querySelector('.chart-canvas-wrap');
  wrap.innerHTML = '<canvas id="chartCanvas" width="700" height="580" style="width:100%;height:290px;"></canvas>';
  var canvas = document.getElementById('chartCanvas');
  var ctx = canvas.getContext('2d');
  var W = canvas.width = canvas.offsetWidth * 2;
  var H = canvas.height = 580;
  canvas.style.height = '290px';
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#7a8299';
  ctx.font = '24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Loading chart...', W / 2, H / 2);

  fetchCandles(symbol, days).then(function(result) {
    if (!result.candles) {
      usingTradingView = true;
      showTradingView(symbol, tvRange);
      return;
    }
    chartData = result.candles;
    if (titleEl) titleEl.textContent = 'Price Chart';
    drawCandlestickChart(ctx, result.candles, W, H);
  });
}

function showTradingView(symbol, range) {
  var titleEl = document.querySelector('.chart-title');
  if (titleEl) titleEl.textContent = 'Price Chart';
  var wrap = document.querySelector('.chart-canvas-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div id="tv-chart-container" style="height:420px;border-radius:8px;overflow:hidden;"></div>';

  function createWidget() {
    if (typeof TradingView === 'undefined') return;
    new TradingView.widget({
      autosize: true,
      symbol: symbol,
      interval: 'D',
      timezone: 'America/New_York',
      theme: 'dark',
      style: '1',
      locale: 'en',
      toolbar_bg: '#161a23',
      enable_publishing: false,
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      container_id: 'tv-chart-container',
      studies: [
        'MASimple@tv-basicstudies',
        'MAExp@tv-basicstudies'
      ],
      studies_overrides: {
        'moving average.length': 20,
        'moving average.plot.color': '#f59e0b',
        'moving average.plot.linewidth': 2,
        'moving average exponential.length': 50,
        'moving average exponential.plot.color': '#a78bfa',
        'moving average exponential.plot.linewidth': 2,
      },
      range: range,
    });
  }

  if (tvLoaded) {
    createWidget();
  } else {
    var tvScript = document.createElement('script');
    tvScript.src = 'https://s3.tradingview.com/tv.js';
    tvScript.onload = function() {
      tvLoaded = true;
      createWidget();
    };
    document.body.appendChild(tvScript);
  }
}

function drawCandlestickChart(ctx, candles, W, H) {
  ctx.clearRect(0, 0, W, H);

  var pad = { top: 20, bottom: 60, left: 80, right: 20 };
  var chartW = W - pad.left - pad.right;
  var chartH = H - pad.top - pad.bottom;

  // Find price range
  var allHigh = -Infinity, allLow = Infinity;
  candles.forEach(function(c) {
    if (c.h > allHigh) allHigh = c.h;
    if (c.l < allLow) allLow = c.l;
  });
  var priceRange = allHigh - allLow;
  if (priceRange === 0) priceRange = 1;
  // Add 5% padding
  allHigh += priceRange * 0.05;
  allLow -= priceRange * 0.05;
  priceRange = allHigh - allLow;

  var n = candles.length;
  var candleW = Math.max(2, Math.floor(chartW / n) - 2);
  var gap = Math.max(1, Math.floor((chartW - candleW * n) / n));
  var totalCandleW = candleW + gap;

  function priceToY(price) {
    return pad.top + chartH - ((price - allLow) / priceRange) * chartH;
  }

  // Draw grid lines and price labels
  ctx.strokeStyle = 'rgba(42,48,69,0.6)';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#7a8299';
  ctx.font = '20px ui-monospace, monospace';
  ctx.textAlign = 'right';
  var gridLines = 5;
  for (var i = 0; i <= gridLines; i++) {
    var price = allLow + (priceRange * i / gridLines);
    var y = priceToY(price);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(W - pad.right, y);
    ctx.stroke();
    ctx.fillText('$' + price.toFixed(2), pad.left - 8, y + 6);
  }

  // Draw date labels
  ctx.textAlign = 'center';
  ctx.font = '18px sans-serif';
  var labelInterval = Math.max(1, Math.floor(n / 6));
  for (var i = 0; i < n; i += labelInterval) {
    var date = new Date(candles[i].t * 1000);
    var label = (date.getMonth() + 1) + '/' + date.getDate();
    var x = pad.left + i * totalCandleW + candleW / 2;
    ctx.fillText(label, x, H - pad.bottom + 28);
  }

  // Draw candles
  for (var i = 0; i < n; i++) {
    var c = candles[i];
    var x = pad.left + i * totalCandleW;
    var isUp = c.c >= c.o;
    var color = isUp ? '#22c55e' : '#ef4444';

    var bodyTop = priceToY(Math.max(c.o, c.c));
    var bodyBot = priceToY(Math.min(c.o, c.c));
    var bodyH = Math.max(1, bodyBot - bodyTop);

    // Wick (high to low line)
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, candleW > 6 ? 2 : 1);
    ctx.beginPath();
    ctx.moveTo(x + candleW / 2, priceToY(c.h));
    ctx.lineTo(x + candleW / 2, priceToY(c.l));
    ctx.stroke();

    // Body
    ctx.fillStyle = color;
    if (isUp && candleW > 4) {
      // Hollow green candle
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, bodyTop, candleW - 2, bodyH);
    } else {
      ctx.fillRect(x, bodyTop, candleW, bodyH);
    }
  }

  // Draw current price line
  var lastPrice = candles[n - 1].c;
  var lastY = priceToY(lastPrice);
  ctx.strokeStyle = '#4f8ef7';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(pad.left, lastY);
  ctx.lineTo(W - pad.right, lastY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#4f8ef7';
  ctx.font = 'bold 20px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('$' + lastPrice.toFixed(2), W - pad.right + 4, lastY + 6);

  // ── MOVING AVERAGE LINES ──
  function calcMA(period) {
    var ma = [];
    for (var i = 0; i < n; i++) {
      if (i < period - 1) { ma.push(null); continue; }
      var sum = 0;
      for (var j = i - period + 1; j <= i; j++) sum += candles[j].c;
      ma.push(sum / period);
    }
    return ma;
  }

  function drawMALine(maValues, color, label) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    var started = false;
    for (var i = 0; i < n; i++) {
      if (maValues[i] === null) continue;
      var x = pad.left + i * totalCandleW + candleW / 2;
      var y = priceToY(maValues[i]);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Label at the end of the line
    var lastIdx = -1;
    for (var i = n - 1; i >= 0; i--) { if (maValues[i] !== null) { lastIdx = i; break; } }
    if (lastIdx >= 0) {
      var lx = pad.left + lastIdx * totalCandleW + candleW / 2;
      var ly = priceToY(maValues[lastIdx]);
      ctx.fillStyle = color;
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, lx + 8, ly + 5);
    }
  }

  // Only draw MAs if we have enough data points
  if (n >= 20) {
    var ma20 = calcMA(20);
    drawMALine(ma20, '#f59e0b', '20-MA');
  }
  if (n >= 50) {
    var ma50 = calcMA(50);
    drawMALine(ma50, '#a78bfa', '50-MA');
  }

  // ── LEGEND ──
  var legendY = H - 8;
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'left';
  // Green candle
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(pad.left, legendY - 10, 14, 14);
  ctx.fillText('Up day', pad.left + 20, legendY + 2);
  // Red candle
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(pad.left + 90, legendY - 10, 14, 14);
  ctx.fillText('Down day', pad.left + 110, legendY + 2);
  // 20-MA
  if (n >= 20) {
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(pad.left + 210, legendY - 3); ctx.lineTo(pad.left + 234, legendY - 3); ctx.stroke();
    ctx.fillStyle = '#f59e0b';
    ctx.fillText('20-day avg', pad.left + 240, legendY + 2);
  }
  // 50-MA
  if (n >= 50) {
    ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 2; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(pad.left + 348, legendY - 3); ctx.lineTo(pad.left + 372, legendY - 3); ctx.stroke();
    ctx.fillStyle = '#a78bfa';
    ctx.fillText('50-day avg', pad.left + 378, legendY + 2);
  }
  // Current price
  ctx.strokeStyle = '#4f8ef7'; ctx.lineWidth = 1.5; ctx.setLineDash([6,4]);
  ctx.beginPath(); ctx.moveTo(pad.left + 490, legendY - 3); ctx.lineTo(pad.left + 514, legendY - 3); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#4f8ef7';
  ctx.fillText('Current', pad.left + 520, legendY + 2);
}

// Chart range button clicks
document.querySelectorAll('.chart-range-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    if (chartSymbol) loadChart(chartSymbol, parseInt(btn.dataset.range));
  });
});

// Symbol search - type a name, get matching tickers
var searchTimeout = null;
document.getElementById('tickerInput').addEventListener('input', function() {
  var query = this.value.trim();
  if (searchTimeout) clearTimeout(searchTimeout);
  if (query.length < 2) { document.getElementById('searchDropdown').classList.remove('visible'); return; }
  // If it looks like a pure ticker symbol (all caps, short), don't search
  if (/^[A-Z]{1,5}$/.test(query)) { document.getElementById('searchDropdown').classList.remove('visible'); return; }
  searchTimeout = setTimeout(function() {
    fetch('https://finnhub.io/api/v1/search?q=' + encodeURIComponent(query) + '&token=' + cfg.finnhubKey)
      .then(function(r){ return r.json(); })
      .then(function(data) {
        var results = (data.result || []).filter(function(r) {
          return r.type === 'Common Stock' && !r.symbol.includes('.');
        }).slice(0, 6);
        var dropdown = document.getElementById('searchDropdown');
        if (!results.length) { dropdown.classList.remove('visible'); return; }
        dropdown.innerHTML = results.map(function(r) {
          return '<div class="search-result-item" data-sym="' + r.symbol + '">' +
            '<span class="search-result-sym">' + r.symbol + '</span>' +
            '<span class="search-result-name">' + escapeHtml(r.description) + '</span></div>';
        }).join('');
        dropdown.classList.add('visible');
        dropdown.querySelectorAll('.search-result-item').forEach(function(item) {
          item.addEventListener('click', function() {
            document.getElementById('tickerInput').value = item.dataset.sym;
            dropdown.classList.remove('visible');
            lookupStock();
          });
        });
      }).catch(function(){});
  }, 300);
});
// Hide dropdown when clicking outside
document.addEventListener('click', function(e) {
  if (!e.target.closest('.search-results')) {
    document.getElementById('searchDropdown').classList.remove('visible');
  }
});

function lookupStock() {
  var input = document.getElementById('tickerInput');
  var symbol = input.value.toUpperCase().trim();
  if (!symbol) { showToast('Enter a stock symbol','error'); return; }
  var btn = document.getElementById('lookupBtn');
  setLoading(btn, true, 'Fetching');
  Promise.all([fetchQuote(symbol), fetchProfile(symbol)]).then(function(results) {
    var quote = results[0], profile = results[1];
    currentQuote = quote;
    var holding = portfolios[activePlayer]&&portfolios[activePlayer].holdings&&portfolios[activePlayer].holdings[symbol];
    document.getElementById('qTicker').textContent = symbol;
    document.getElementById('qName').textContent = profile.name||symbol;
    document.getElementById('qExchange').textContent = profile.exchange||'';
    document.getElementById('qPrice').textContent = fmt(quote.price);
    var ce = document.getElementById('qChange');
    ce.className = 'quote-change ' + (quote.change>=0?'up':'down');
    ce.textContent = (quote.change>=0?'▲':'▼') + ' ' + fmt(Math.abs(quote.change)) + ' (' + fmtPct(quote.changePct||0) + ') today  ·  You own: ' + (holding&&holding.shares||0) + ' shares';
    document.getElementById('quoteResult').classList.add('visible');
    if (holding) fbUpdate('portfolios/'+activePlayer+'/holdings/'+symbol, {lastPrice:quote.price, dayChange:quote.change||0});
    updateTradeCost();
    var stockNews = document.getElementById('stockNews'), stockNewsList = document.getElementById('stockNewsList');
    if (stockNews&&stockNewsList) {
      stockNews.style.display='block';
      stockNewsList.innerHTML='<div style="color:var(--muted);font-size:13px;">Loading news...</div>';
      fetchStockNews(symbol).then(function(news){ renderNewsItems(news,'stockNewsList'); });
    // Load candlestick chart (delay to avoid rate limit)
    setTimeout(function(){ loadChart(symbol, 30); }, 1500);
    }
  }).catch(function(){ showToast('Could not find "' + symbol + '". Check the symbol.','error'); })
  .then(function(){ setLoading(btn, false, 'Look Up'); });
}
function updateTradeCost() {
  if (!currentQuote) return;
  var qty = parseInt(document.getElementById('qtyInput').value)||0;
  var p = portfolios[activePlayer];
  document.getElementById('tradeCost').innerHTML = qty + ' × ' + fmt(currentQuote.price) + ' = <span>' + fmt(qty*currentQuote.price) + '</span> &nbsp;|&nbsp; Cash: ' + fmt(p&&p.cash||0);
}

// ============================================================
// PIN SYSTEM
// ============================================================
function openPinModal(memberId, onSuccess) {
  var m = members.find(function(m){ return m.id===memberId; }); if (!m) return;
  pinTargetMember = memberId; pinCallback = onSuccess; pinEntry = ''; pinNewTemp = '';
  if (!m.pin) { pinMode='create'; setPinUI(m,'Create Your Trading PIN','First trade! Choose a secret 4-digit PIN. Only you will know it.'); }
  else { pinMode='verify'; setPinUI(m,'Enter PIN to Trade','Enter ' + m.name + "'s PIN to confirm."); }
  updatePinDots();
  document.getElementById('pinOverlay').classList.remove('hidden');
}
function openChangePinModal(memberId) {
  var m = members.find(function(m){ return m.id===memberId; }); if (!m) return;
  pinTargetMember = memberId; pinCallback = null; pinEntry = ''; pinNewTemp = '';
  if (!m.pin) { pinMode='change_new'; setPinUI(m,'Set Your PIN','Choose your secret 4-digit PIN.'); }
  else { pinMode='change_verify'; setPinUI(m,'Change PIN','Enter ' + m.name + "'s current PIN."); }
  updatePinDots();
  document.getElementById('pinOverlay').classList.remove('hidden');
}
function setPinUI(m, title, sub) {
  var c = memberColor(m);
  var pinAvatarEl = document.getElementById('pinAvatar');
  if (m.avatarImg) {
    pinAvatarEl.innerHTML = '<img src="' + m.avatarImg + '" style="width:48px;height:48px;border-radius:50%;object-fit:cover;">';
  } else {
    pinAvatarEl.textContent = m.emoji||memberInitials(m.name);
    pinAvatarEl.style.color = c.color;
  }
  document.getElementById('pinTitle').textContent = title;
  document.getElementById('pinSub').textContent = sub;
  document.getElementById('pinError').textContent = '';
}
function updatePinDots() {
  document.querySelectorAll('.pin-dot').forEach(function(dot,i){
    dot.style.background = i < pinEntry.length ? 'var(--accent)' : 'transparent';
    dot.style.borderColor = i < pinEntry.length ? 'var(--accent)' : 'var(--border2)';
  });
}
function pinFail(msg) {
  document.getElementById('pinError').textContent = msg;
  setTimeout(function(){ pinEntry=''; updatePinDots(); document.getElementById('pinError').textContent=''; }, 1000);
}
function handlePinKey(key) {
  if (key==='back') { pinEntry=pinEntry.slice(0,-1); updatePinDots(); return; }
  if (pinEntry.length >= 4) return;
  pinEntry += key; updatePinDots();
  if (pinEntry.length < 4) return;
  var m = members.find(function(m){ return m.id===pinTargetMember; });
  if (pinMode==='verify') {
    if (pinEntry===String(m&&m.pin)) {
      document.getElementById('pinOverlay').classList.add('hidden');
      var cb=pinCallback; pinCallback=null; pinEntry=''; if(cb) cb();
    } else pinFail('Wrong PIN. Try again.');
  } else if (pinMode==='create') {
    pinNewTemp=pinEntry; pinEntry=''; pinMode='confirm';
    setPinUI(m,'Confirm Your PIN','Enter the same PIN again to confirm.'); updatePinDots();
  } else if (pinMode==='confirm') {
    if (pinEntry===pinNewTemp) {
      fbUpdate('members/'+pinTargetMember, {pin:pinEntry}).then(function(){
        showToast('PIN set! Remember it.');
        document.getElementById('pinOverlay').classList.add('hidden');
        var cb=pinCallback; pinCallback=null; pinEntry=''; pinNewTemp=''; if(cb) cb();
      });
    } else { pinNewTemp=''; pinMode='create'; setPinUI(m,'Create Your PIN','PINs did not match. Try again.'); pinFail('PINs did not match.'); }
  } else if (pinMode==='change_verify') {
    if (pinEntry===String(m&&m.pin)) { pinEntry=''; pinNewTemp=''; pinMode='change_new'; setPinUI(m,'Enter New PIN','Choose your new 4-digit PIN.'); updatePinDots(); }
    else pinFail('Wrong current PIN.');
  } else if (pinMode==='change_new') {
    pinNewTemp=pinEntry; pinEntry=''; pinMode='change_confirm'; setPinUI(m,'Confirm New PIN','Enter your new PIN again.'); updatePinDots();
  } else if (pinMode==='change_confirm') {
    if (pinEntry===pinNewTemp) {
      fbUpdate('members/'+pinTargetMember, {pin:pinEntry}).then(function(){
        showToast('PIN updated!'); document.getElementById('pinOverlay').classList.add('hidden'); pinEntry=''; pinNewTemp='';
      });
    } else { pinNewTemp=''; pinMode='change_new'; setPinUI(m,'Enter New PIN','PINs did not match. Try again.'); pinFail('PINs did not match.'); }
  }
}
document.querySelectorAll('.pin-key').forEach(function(btn){
  btn.addEventListener('click', function(){ handlePinKey(btn.dataset.key); });
});
document.getElementById('pinCancelBtn').addEventListener('click', function(){
  document.getElementById('pinOverlay').classList.add('hidden'); pinEntry=''; pinNewTemp=''; pinCallback=null;
});

// ============================================================
// BUY / SELL
// ============================================================
var pendingTradeAction = null;
var pendingTradeDetails = null;

function executeBuy() {
  if (!currentQuote) { showToast('Look up a stock first','error'); return; }
  var qty = parseInt(document.getElementById('qtyInput').value);
  if (!qty||qty<1) { showToast('Enter a valid quantity','error'); return; }
  var p = portfolios[activePlayer];
  var estTotal = qty * currentQuote.price;
  if (estTotal > p.cash) { showToast('Not enough cash! Need ' + fmt(estTotal) + ', have ' + fmt(p.cash),'error'); return; }
  if (!isMarketOpen()) {
    pendingTradeDetails = {action:'BUY', symbol:currentQuote.symbol, shares:qty, lastClosePrice:currentQuote.price, playerId:activePlayer};
    var playerName = (members.find(function(m){return m.id===activePlayer;})||{}).name||'';
    document.getElementById('ahOrderSummary').innerHTML =
      '<b>' + playerName + '</b> wants to <span style="color:var(--green);font-weight:700;">BUY ' + qty + ' share' + (qty!==1?'s':'') + ' of ' + currentQuote.symbol + '</span><br>' +
      'Last close price: ' + fmt(currentQuote.price) + '<br>' +
      'Estimated cost: <b>' + fmt(estTotal) + '</b> (actual price will be determined at market open)';
    document.getElementById('afterHoursOverlay').classList.remove('hidden');
    return;
  }
  doBuy(qty);
}

function doBuy(qty) {
  openPinModal(activePlayer, function() {
    var p = portfolios[activePlayer], total = qty*currentQuote.price;
    if (total > p.cash) { showToast('Not enough cash! Need ' + fmt(total) + ', have ' + fmt(p.cash),'error'); return; }
    var sym = currentQuote.symbol, newCash = p.cash-total;
    var h = (p.holdings&&p.holdings[sym]) || {shares:0,avgCost:0,lastPrice:currentQuote.price};
    var newShares = h.shares+qty, newAvg = (h.shares*h.avgCost+total)/newShares;
    var hist = p.history ? (Array.isArray(p.history)?p.history:Object.values(p.history)) : [];
    hist.push({action:'BUY',symbol:sym,shares:qty,price:currentQuote.price,total:total,cashAfter:newCash,ts:Date.now()});
    var updates = {};
    updates['portfolios/'+activePlayer+'/cash'] = newCash;
    updates['portfolios/'+activePlayer+'/holdings/'+sym+'/shares'] = newShares;
    updates['portfolios/'+activePlayer+'/holdings/'+sym+'/avgCost'] = newAvg;
    updates['portfolios/'+activePlayer+'/holdings/'+sym+'/lastPrice'] = currentQuote.price;
    db.ref().update(updates).then(function(){ return fbSet('portfolios/'+activePlayer+'/history', hist); })
    .then(function(){ showToast('Bought ' + qty + ' share' + (qty!==1?'s':'') + ' of ' + sym + ' for ' + fmt(total) + '!'); })
    .catch(function(e){ showToast('Trade failed: ' + e.message,'error'); });
  });
}
function executeSell() {
  if (!currentQuote) { showToast('Look up a stock first','error'); return; }
  var qty = parseInt(document.getElementById('qtyInput').value);
  if (!qty||qty<1) { showToast('Enter a valid quantity','error'); return; }
  var sym = currentQuote.symbol, p = portfolios[activePlayer], h = p&&p.holdings&&p.holdings[sym];
  if (!h||h.shares<qty) { showToast('You only own ' + (h&&h.shares||0) + ' shares of ' + sym,'error'); return; }
  if (!isMarketOpen()) {
    pendingTradeDetails = {action:'SELL', symbol:sym, shares:qty, lastClosePrice:currentQuote.price, playerId:activePlayer};
    var playerName = (members.find(function(m){return m.id===activePlayer;})||{}).name||'';
    document.getElementById('ahOrderSummary').innerHTML =
      '<b>' + playerName + '</b> wants to <span style="color:var(--red);font-weight:700;">SELL ' + qty + ' share' + (qty!==1?'s':'') + ' of ' + sym + '</span><br>' +
      'Last close price: ' + fmt(currentQuote.price) + '<br>' +
      'Estimated proceeds: <b>' + fmt(qty * currentQuote.price) + '</b> (actual price will be determined at market open)';
    document.getElementById('afterHoursOverlay').classList.remove('hidden');
    return;
  }
  doSell(qty, sym, p, h);
}

function doSell(qty, sym, p, h) {
  openPinModal(activePlayer, function() {
    var total = qty*currentQuote.price, pnl = total-(qty*h.avgCost), newCash = p.cash+total;
    var hist = p.history ? (Array.isArray(p.history)?p.history:Object.values(p.history)) : [];
    hist.push({action:'SELL',symbol:sym,shares:qty,price:currentQuote.price,total:total,pnl:pnl,cashAfter:newCash,ts:Date.now()});
    var updates = {};
    updates['portfolios/'+activePlayer+'/cash'] = newCash;
    updates['portfolios/'+activePlayer+'/holdings/'+sym+'/shares'] = h.shares-qty;
    updates['portfolios/'+activePlayer+'/holdings/'+sym+'/lastPrice'] = currentQuote.price;
    db.ref().update(updates).then(function(){ return fbSet('portfolios/'+activePlayer+'/history', hist); })
    .then(function(){
      showToast(pnl>=0 ? 'Sold ' + qty + ' share' + (qty!==1?'s':'') + ' of ' + sym + '. Profit: +' + fmt(pnl) : 'Sold ' + qty + ' share' + (qty!==1?'s':'') + ' of ' + sym + '. Loss: ' + fmt(pnl));
    }).catch(function(e){ showToast('Trade failed: ' + e.message,'error'); });
  });
}

// ============================================================
// ADD MEMBER
// ============================================================
function openAddMember() {
  newMemberColorIdx = 3;
  document.getElementById('newMemberName').value = '';
  document.getElementById('newMemberEmoji').value = '';
  renderSwatches();
  document.getElementById('addMemberOverlay').classList.remove('hidden');
}
function renderSwatches() {
  var container = document.getElementById('newMemberSwatches');
  container.innerHTML = AVATAR_COLORS.map(function(col,i){
    return '<div class="swatch' + (newMemberColorIdx===i?' selected':'') + '" data-i="' + i + '" style="background:' + col.color + ';"></div>';
  }).join('');
  container.querySelectorAll('.swatch').forEach(function(s){
    s.addEventListener('click', function(){ newMemberColorIdx=parseInt(s.dataset.i); renderSwatches(); });
  });
}
document.getElementById('addMemberCancelBtn').addEventListener('click', function(){ document.getElementById('addMemberOverlay').classList.add('hidden'); });
document.getElementById('addMemberSaveBtn').addEventListener('click', function() {
  var name = document.getElementById('newMemberName').value.trim();
  var emoji = document.getElementById('newMemberEmoji').value.trim() || memberInitials(name||'?');
  if (!name) { showToast('Enter a name','error'); return; }
  var btn = document.getElementById('addMemberSaveBtn');
  setLoading(btn, true, 'Adding...');
  var id = 'member_' + Date.now();
  fbSet('members/'+id, {id:id,name:name,initials:memberInitials(name),colorIdx:newMemberColorIdx,emoji:emoji,pin:null,isCore:false})
  .then(function(){ return fbSet('portfolios/'+id, blankPortfolio(cfg.startingBalance)); })
  .then(function(){
    activePlayer = id;
    document.getElementById('addMemberOverlay').classList.add('hidden');
    showToast(name + ' joined! They will set their PIN on first trade.');
  }).catch(function(e){ showToast('Error: '+e.message,'error'); })
  .then(function(){ setLoading(btn, false, 'Add Player'); });
});

// ============================================================
// MANAGE MEMBERS
// ============================================================
function renderManageList() {
  var container = document.getElementById('manageMembersList');
  container.innerHTML = members.map(function(m) {
    var c = memberColor(m), p = portfolios[m.id], nw = p?p.cash+calcHoldingsValue(p):cfg.startingBalance;
    var pinStatus = m.pin ? 'PIN set' : 'No PIN yet';
    return '<div class="member-item" style="flex-wrap:wrap;gap:8px;"><div class="avatar" style="background:' + c.bg + ';color:' + c.color + ';font-size:15px;">' + (m.emoji||memberInitials(m.name)) + '</div>' +
      '<div class="member-info"><div class="member-name">' + m.name + (m.isCore?' (core)':'') + '</div><div class="member-sub">' + fmt(nw) + ' · ' + pinStatus + '</div></div>' +
      '<div style="display:flex;gap:6px;flex-shrink:0;"><button class="manage-btn edit-avatar-btn" data-mid="' + m.id + '" style="border-color:var(--green);color:var(--green);">Avatar</button><button class="manage-btn change-pin-btn" data-mid="' + m.id + '" style="border-color:var(--accent);color:var(--accent);">' + (m.pin?'Change PIN':'Set PIN') + '</button>' +
      (!m.isCore?'<button class="manage-btn remove-btn" data-mid="' + m.id + '">Remove</button>':'') + '</div></div>';
  }).join('');
  container.querySelectorAll('.edit-avatar-btn').forEach(function(btn){
    btn.addEventListener('click', function(){ document.getElementById('manageMembersOverlay').classList.add('hidden'); openAvatarEditor(btn.dataset.mid); });
  });
  container.querySelectorAll('.change-pin-btn').forEach(function(btn){
    btn.addEventListener('click', function(){ document.getElementById('manageMembersOverlay').classList.add('hidden'); openChangePinModal(btn.dataset.mid); });
  });
  container.querySelectorAll('.remove-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      var mid=btn.dataset.mid, mem=members.find(function(m){return m.id===mid;});
      if (!confirm('Remove ' + (mem&&mem.name) + ' and all their data?')) return;
      Promise.all([fbRemove('members/'+mid), fbRemove('portfolios/'+mid)]).then(function(){
        if (activePlayer===mid) activePlayer=members.find(function(m){return m.id!==mid;})&&members.find(function(m){return m.id!==mid;}).id||null;
        renderManageList(); showToast((mem&&mem.name||'Member') + ' removed.','info');
      });
    });
  });
}
document.getElementById('manageMembersCloseBtn').addEventListener('click', function(){ document.getElementById('manageMembersOverlay').classList.add('hidden'); });
document.getElementById('manageBtn').addEventListener('click', function(){ renderManageList(); document.getElementById('manageMembersOverlay').classList.remove('hidden'); });

// ============================================================
// ADMIN PANEL
// ============================================================
document.getElementById('adminBtn').addEventListener('click', function(){ document.getElementById('adminPwInput').value=''; document.getElementById('adminLoginOverlay').classList.remove('hidden'); });
document.getElementById('adminLoginCancelBtn').addEventListener('click', function(){ document.getElementById('adminLoginOverlay').classList.add('hidden'); });
document.getElementById('adminPwInput').addEventListener('keydown', function(e){ if(e.key==='Enter') document.getElementById('adminLoginSubmitBtn').click(); });
document.getElementById('adminLoginSubmitBtn').addEventListener('click', function(){
  var entered = document.getElementById('adminPwInput').value;
  if (!cfg||!cfg.adminPassword) { showToast('No admin password set','error'); return; }
  if (entered !== cfg.adminPassword) { showToast('Wrong admin password','error'); return; }
  document.getElementById('adminLoginOverlay').classList.add('hidden');
  renderAdminPinList();
  // Show current announcement
  fbGet('announcement').then(function(data) {
    if (data && data.text) {
      document.getElementById('adminAnnouncementText').value = data.text;
      document.getElementById('adminAnnouncementStatus').textContent = 'Current announcement is live (posted ' + new Date(data.postedAt).toLocaleDateString() + ')';
    } else {
      document.getElementById('adminAnnouncementStatus').textContent = 'No active announcement.';
    }
  });
  // Show access code status
  fbGet('config/accessCode').then(function(code) {
    if (code) {
      document.getElementById('adminAccessCodeStatus').textContent = 'Active code: ' + code;
      document.getElementById('adminAccessCode').placeholder = 'Enter new code to change';
    } else {
      document.getElementById('adminAccessCodeStatus').textContent = 'No code set. Anyone with the URL can access the app.';
    }
  });
  // Show anthropic key status
  if (cfg.anthropicKey) {
    document.getElementById('adminAnthropicStatus').textContent = 'AI key is active. Recaps will use Claude.';
    document.getElementById('adminAnthropicKey').placeholder = 'Key saved. Enter new key to replace.';
  } else {
    document.getElementById('adminAnthropicStatus').textContent = 'No key set. Recaps use basic templates.';
  }
  document.getElementById('adminPanelOverlay').classList.remove('hidden');
});
function renderAdminPinList() {
  var container = document.getElementById('adminPinList');
  container.innerHTML = members.map(function(m) {
    var c = memberColor(m);
    var pinDisplay = m.pin ? '<span style="font-family:ui-monospace,monospace;font-size:16px;letter-spacing:.2em;color:var(--accent);background:var(--surface2);padding:3px 10px;border-radius:6px;">' + m.pin + '</span>' : '<span style="color:var(--muted);font-size:13px;">Not set yet</span>';
    return '<div class="member-item" style="flex-wrap:wrap;gap:8px;"><div class="avatar" style="background:' + c.bg + ';color:' + c.color + ';font-size:15px;">' + (m.emoji||memberInitials(m.name)) + '</div>' +
      '<div class="member-info"><div class="member-name">' + m.name + '</div><div class="member-sub" style="margin-top:6px;">PIN: ' + pinDisplay + '</div></div>' +
      '<div style="display:flex;gap:6px;flex-shrink:0;"><button class="manage-btn admin-clear-pin" data-mid="' + m.id + '" style="border-color:var(--amber);color:var(--amber);">Clear PIN</button><button class="manage-btn admin-set-pin" data-mid="' + m.id + '" style="border-color:var(--accent);color:var(--accent);">Set PIN</button></div></div>';
  }).join('');
  container.querySelectorAll('.admin-clear-pin').forEach(function(btn){
    btn.addEventListener('click', function(){
      var mem=members.find(function(m){return m.id===btn.dataset.mid;});
      if (!confirm('Clear ' + (mem&&mem.name) + "'s PIN?")) return;
      fbUpdate('members/'+btn.dataset.mid, {pin:null}).then(function(){ showToast((mem&&mem.name||'Member') + "'s PIN cleared.",'info'); renderAdminPinList(); });
    });
  });
  container.querySelectorAll('.admin-set-pin').forEach(function(btn){
    btn.addEventListener('click', function(){
      var mem=members.find(function(m){return m.id===btn.dataset.mid;});
      var newPin=prompt('Set a new 4-digit PIN for ' + (mem&&mem.name) + ':');
      if (!newPin) return;
      if (!/^\d{4}$/.test(newPin)) { showToast('Must be exactly 4 digits','error'); return; }
      fbUpdate('members/'+btn.dataset.mid, {pin:newPin}).then(function(){ showToast((mem&&mem.name||'Member') + "'s PIN set."); renderAdminPinList(); });
    });
  });
}
document.getElementById('adminPanelCloseBtn').addEventListener('click', function(){ document.getElementById('adminPanelOverlay').classList.add('hidden'); });

// Access code management
document.getElementById('adminSaveAccessCodeBtn').addEventListener('click', function() {
  var code = document.getElementById('adminAccessCode').value.trim();
  if (!code) { showToast('Enter an access code', 'error'); return; }
  if (code.length < 4) { showToast('Code should be at least 4 characters', 'error'); return; }
  fbSet('config/accessCode', code).then(function() {
    try { localStorage.setItem('fsc_access', code); } catch(e) {}
    showToast('Access code set! Share it with your family.');
    document.getElementById('adminAccessCodeStatus').textContent = 'Code is active. New visitors will need to enter it.';
    document.getElementById('adminAccessCode').value = '';
  }).catch(function(e) { showToast('Failed to save: ' + e.message, 'error'); });
});

// Announcement management
document.getElementById('adminPostAnnouncementBtn').addEventListener('click', function() {
  var text = document.getElementById('adminAnnouncementText').value.trim();
  if (!text) { showToast('Write a message first', 'error'); return; }
  var announcement = {
    id: 'announce_' + Date.now(),
    text: text,
    postedAt: Date.now()
  };
  fbSet('announcement', announcement).then(function() {
    showToast('Announcement posted!');
    document.getElementById('adminAnnouncementText').value = '';
    document.getElementById('adminAnnouncementStatus').textContent = 'Announcement is live.';
  }).catch(function(e) { showToast('Failed to post: ' + e.message, 'error'); });
});

document.getElementById('adminClearAnnouncementBtn').addEventListener('click', function() {
  if (!confirm('Remove the current announcement?')) return;
  fbRemove('announcement').then(function() {
    showToast('Announcement cleared.', 'info');
    document.getElementById('adminAnnouncementStatus').textContent = 'No active announcement.';
    var section = document.getElementById('announcementSection');
    if (section) section.style.display = 'none';
  }).catch(function(e) { showToast('Failed to clear: ' + e.message, 'error'); });
});

// Anthropic key management - stored in Firebase, never in source code
document.getElementById('adminSaveAnthropicBtn').addEventListener('click', function() {
  var key = document.getElementById('adminAnthropicKey').value.trim();
  if (!key) { showToast('Enter an API key', 'error'); return; }
  fbSet('config/anthropicKey', key).then(function() {
    cfg.anthropicKey = key;
    showToast('Anthropic API key saved securely in Firebase!');
    document.getElementById('adminAnthropicStatus').textContent = 'Key saved and active.';
    document.getElementById('adminAnthropicKey').value = '';
  }).catch(function(e) { showToast('Failed to save: ' + e.message, 'error'); });
});

// Load anthropic key status when admin panel opens
var origAdminOpen = document.getElementById('adminLoginSubmitBtn').onclick;
document.getElementById('adminClearChatBtn').addEventListener('click', function(){
  if (!confirm('Clear ALL chat messages? Cannot be undone.')) return;
  fbRemove('chat').then(function(){ showToast('Chat cleared.','info'); document.getElementById('adminPanelOverlay').classList.add('hidden'); })
  .catch(function(){ showToast('Failed to clear chat','error'); });
});
document.getElementById('adminResetTriggerBtn').addEventListener('click', function(){ document.getElementById('adminPanelOverlay').classList.add('hidden'); document.getElementById('resetOverlay').classList.remove('hidden'); });

// ============================================================
// RESET
// ============================================================
document.getElementById('resetCancelBtn').addEventListener('click', function(){ document.getElementById('resetOverlay').classList.add('hidden'); });
document.getElementById('resetConfirmBtn').addEventListener('click', function(){
  fbRemove('/').then(function(){ localStorage.removeItem('fsc_cfg'); location.reload(); })
  .catch(function(){ showToast('Reset failed','error'); });
});

// ============================================================
// CHAT
// ============================================================
function startChat() {
  fbListen('chat', function(data) {
    chatMessages = data ? Object.values(data).sort(function(a,b){return a.ts-b.ts;}) : [];
    renderChat();
  });
  updateChatPlaceholder();
}
function updateChatPlaceholder() {
  var m = members.find(function(m){return m.id===activePlayer;});
  var input = document.getElementById('chatInput');
  if (input&&m) input.placeholder = 'Message as ' + m.name + '...';
}
function renderChat() {
  var box = document.getElementById('chatBox'); if (!box) return;
  if (!chatMessages.length) { box.innerHTML='<div class="chat-empty">No messages yet. Say something!</div>'; return; }
  var html = '', lastDay = '';
  chatMessages.forEach(function(msg) {
    var isMe = msg.memberId===activePlayer;
    var member = members.find(function(m){return m.id===msg.memberId;});
    var c = member ? memberColor(member) : AVATAR_COLORS[0];
    var name = member&&member.name || msg.memberName || 'Unknown';
    var emoji = member&&member.emoji || '?';
    var msgDate = new Date(msg.ts);
    var dayStr = msgDate.toLocaleDateString([],{weekday:'long',month:'short',day:'numeric'});
    if (dayStr !== lastDay) { html += '<div class="chat-day-divider">' + dayStr + '</div>'; lastDay=dayStr; }
    var timeStr = msgDate.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    if (isMe) {
      html += '<div class="chat-msg me"><div class="chat-bubble">' + escapeHtml(msg.text) + '</div><div class="chat-meta"><span>' + timeStr + '</span></div></div>';
    } else {
      html += '<div class="chat-msg other"><div class="chat-meta" style="margin-bottom:3px;">' + (member && member.avatarImg ? '<img src="' + member.avatarImg + '" style="width:20px;height:20px;border-radius:50%;object-fit:cover;">' : '<span style="font-size:14px;">' + emoji + '</span>') + '<span class="chat-name" style="color:' + c.color + ';">' + name + '</span></div><div class="chat-bubble">' + escapeHtml(msg.text) + '</div><div class="chat-meta"><span>' + timeStr + '</span></div></div>';
    }
  });
  if (box.dataset.lastHash !== String(html.length)) {
    var wasAtBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    box.innerHTML = html; box.dataset.lastHash = String(html.length);
    if (wasAtBottom||chatMessages.length<=1) box.scrollTop = box.scrollHeight;
  }
}
function sendChatMessage() {
  var input = document.getElementById('chatInput'), text = input.value.trim();
  if (!text) return;
  var m = members.find(function(m){return m.id===activePlayer;});
  if (!m) { showToast('Select a player tab first','error'); return; }
  var btn = document.getElementById('chatSendBtn'); btn.disabled=true;
  var msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
  fbSet('chat/'+msgId, {id:msgId, memberId:m.id, memberName:m.name, text:text, ts:Date.now()})
  .then(function(){ input.value=''; input.focus(); })
  .catch(function(){ showToast('Could not send message','error'); })
  .then(function(){ btn.disabled=false; });
}
document.getElementById('chatSendBtn').addEventListener('click', sendChatMessage);
document.getElementById('chatInput').addEventListener('keydown', function(e){ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChatMessage();} });

// ============================================================
// WEEKLY RECAP
// ============================================================
function getWeekRange() {
  var now = new Date();
  var et = new Date(now.toLocaleString('en-US', {timeZone:'America/New_York'}));
  var day = et.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  var hour = et.getHours() + et.getMinutes() / 60;

  // Determine if the current week is complete (after Friday 4 PM ET)
  var isFriAfterClose = (day === 5 && hour >= 16);
  var isWeekend = (day === 6 || day === 0);
  var currentWeekComplete = isFriAfterClose || isWeekend;

  // Find the target week's Monday
  var monday = new Date(et);
  if (currentWeekComplete) {
    // Show THIS week's recap (Mon-Fri that just ended)
    if (day === 5) { // Friday after close
      var diff = 4; // go back to Monday
      monday.setDate(monday.getDate() - diff);
    } else if (day === 6) { // Saturday
      monday.setDate(monday.getDate() - 5);
    } else { // Sunday
      monday.setDate(monday.getDate() - 6);
    }
  } else {
    // Week still in progress — show LAST week's recap
    var diff = day === 0 ? 6 : day - 1; // days since last Monday
    monday.setDate(monday.getDate() - diff - 7); // go back to PREVIOUS Monday
  }
  monday.setHours(0,0,0,0);

  // Friday end of that week
  var friday = new Date(monday);
  friday.setDate(friday.getDate() + 4);
  friday.setHours(23,59,59,999);

  return {
    monday: monday,
    friday: friday,
    monTs: monday.getTime(),
    friTs: friday.getTime(),
    currentWeekComplete: currentWeekComplete,
    label: formatRecapDate(monday) + ' — ' + formatRecapDate(friday)
  };
}

function formatRecapDate(d) {
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate();
}

function generateWeeklyRecap() {
  var week = getWeekRange();
  document.getElementById('recapDates').textContent = week.label;
  if (!week.currentWeekComplete) {
    document.getElementById('recapDates').textContent += '  (last completed week)';
    document.getElementById('recapCacheInfo').textContent = 'This week\'s recap will be available after market close on Friday (4:00 PM ET).';
  }

  var recapData = members.map(function(m) {
    var p = portfolios[m.id];
    if (!p) return {member:m, trades:[], weeklyGain:0, weeklyPct:0, topMover:null, bottomMover:null, netWorth:cfg.startingBalance};

    // Get trades this week
    var hist = p.history ? (Array.isArray(p.history) ? p.history : Object.values(p.history)) : [];
    var weekTrades = hist.filter(function(t) { return t.ts >= week.monTs && t.ts <= week.friTs; });

    // Calculate current net worth
    var holdingsValue = 0;
    var holdingPerformance = [];
    if (p.holdings) {
      Object.keys(p.holdings).forEach(function(sym) {
        var h = p.holdings[sym];
        if (h.shares > 0) {
          var curPrice = h.lastPrice || h.avgCost;
          var value = h.shares * curPrice;
          var cost = h.shares * h.avgCost;
          var pnl = value - cost;
          var pnlPct = ((curPrice - h.avgCost) / h.avgCost) * 100;
          holdingsValue += value;
          holdingPerformance.push({symbol:sym, shares:h.shares, value:value, pnl:pnl, pnlPct:pnlPct, price:curPrice, dayChange:h.dayChange||0});
        }
      });
    }
    var netWorth = p.cash + holdingsValue;

    // Estimate weekly gain from trades
    var weekBuyCost = 0, weekSellProceeds = 0, weekRealizedPnl = 0;
    weekTrades.forEach(function(t) {
      if (t.action === 'BUY') weekBuyCost += t.total;
      if (t.action === 'SELL') { weekSellProceeds += t.total; weekRealizedPnl += (t.pnl || 0); }
    });

    // Sort holdings by performance
    holdingPerformance.sort(function(a,b) { return b.pnlPct - a.pnlPct; });
    var topMover = holdingPerformance.length > 0 ? holdingPerformance[0] : null;
    var bottomMover = holdingPerformance.length > 1 ? holdingPerformance[holdingPerformance.length-1] : null;

    // Weekly gain estimate (net worth change from starting balance adjusted for trades)
    var weeklyGain = netWorth - cfg.startingBalance;
    var weeklyPct = (weeklyGain / cfg.startingBalance) * 100;

    return {
      member: m,
      trades: weekTrades,
      weeklyGain: weeklyGain,
      weeklyPct: weeklyPct,
      netWorth: netWorth,
      cash: p.cash,
      holdingsValue: holdingsValue,
      topMover: topMover,
      bottomMover: bottomMover,
      holdings: holdingPerformance,
      weekBuys: weekTrades.filter(function(t){return t.action==='BUY';}),
      weekSells: weekTrades.filter(function(t){return t.action==='SELL';}),
      weekRealizedPnl: weekRealizedPnl
    };
  });

  // Sort by weekly gain for ranking
  recapData.sort(function(a,b) { return b.weeklyGain - a.weeklyGain; });

  // Try AI-powered recap first, fall back to template
  if (cfg && cfg.anthropicKey) {
    generateAIRecap(recapData, week);
  } else {
    renderRecap(recapData, week);
  }
}

function renderRecap(recapData, week) {
  var html = '';

  // Weekly Ranking
  html += '<div class="recap-ranking"><div class="recap-section-title">Weekly Performance Ranking</div>';
  recapData.forEach(function(rd, i) {
    var m = rd.member;
    var c = memberColor(m);
    var isPositive = rd.weeklyGain >= 0;
    var avatarContent = m.avatarImg ? '<img class="avatar-img" src="' + m.avatarImg + '" alt="">' : (m.emoji||memberInitials(m.name));
    html += '<div class="recap-rank-row">' +
      '<div class="recap-rank-num" style="color:' + (i===0?'var(--gold)':i===1?'#9ca3af':'#b45309') + ';">' + rankEmoji(i) + '</div>' +
      '<div class="avatar" style="background:' + c.bg + ';color:' + c.color + ';">' + avatarContent + '</div>' +
      '<div class="recap-rank-info"><div class="recap-rank-name">' + m.name + '</div>' +
      '<div class="recap-rank-detail">Net Worth: ' + fmt(rd.netWorth) + ' · ' + rd.trades.length + ' trade' + (rd.trades.length!==1?'s':'') + ' this week</div></div>' +
      '<div class="recap-rank-change"><div class="recap-rank-amount" style="color:' + (isPositive?'var(--green)':'var(--red)') + ';">' + (isPositive?'+':'') + fmt(rd.weeklyGain) + '</div>' +
      '<div class="recap-rank-pct" style="color:' + (isPositive?'var(--green)':'var(--red)') + ';">' + (isPositive?'+':'') + rd.weeklyPct.toFixed(2) + '% overall</div></div></div>';
  });
  html += '</div>';

  // Player Blogs
  html += '<div class="recap-blog"><div class="recap-section-title">Player Highlights</div>';
  recapData.forEach(function(rd) {
    var m = rd.member;
    var c = memberColor(m);
    var avatarContent = m.avatarImg ? '<img class="avatar-img" src="' + m.avatarImg + '" alt="">' : (m.emoji||memberInitials(m.name));
    var isPositive = rd.weeklyGain >= 0;

    html += '<div class="recap-player-card">' +
      '<div class="recap-player-header">' +
      '<div class="avatar" style="background:' + c.bg + ';color:' + c.color + ';width:48px;height:48px;font-size:20px;">' + avatarContent + '</div>' +
      '<div><div class="recap-player-name">' + m.name + '</div>' +
      '<div class="recap-player-subtitle">' + (isPositive?'Up':'Down') + ' ' + Math.abs(rd.weeklyPct).toFixed(2) + '% · ' + fmt(rd.netWorth) + ' net worth</div></div></div>' +
      '<div class="recap-text">' + generateCommentary(rd) + '</div></div>';
  });
  html += '</div>';

  document.getElementById('recapContent').innerHTML = html;
}

function generateCommentary(rd) {
  var lines = [];
  var name = rd.member.name;

  if (rd.trades.length === 0 && rd.holdings.length === 0) {
    return name + ' sat on the sidelines this week with ' + fmt(rd.cash) + ' in cash. Sometimes the best move is no move, but the competition is heating up!';
  }

  if (rd.trades.length === 0) {
    lines.push(name + ' played the hold game this week with no new trades. ');
  } else {
    lines.push(name + ' made <span class="recap-highlight neutral">' + rd.trades.length + ' trade' + (rd.trades.length!==1?'s':'') + '</span> this week. ');
  }

  if (rd.weekBuys.length > 0) {
    var buySymbols = [];
    rd.weekBuys.forEach(function(t) { if (buySymbols.indexOf(t.symbol) < 0) buySymbols.push(t.symbol); });
    var totalBuySpend = rd.weekBuys.reduce(function(s,t){return s+t.total;}, 0);
    lines.push('Bought into <b>' + buySymbols.join(', ') + '</b>, investing ' + fmt(totalBuySpend) + '. ');
  }

  if (rd.weekSells.length > 0) {
    var profitSells = rd.weekSells.filter(function(t){return t.pnl && t.pnl > 0;});
    var lossSells = rd.weekSells.filter(function(t){return t.pnl && t.pnl < 0;});
    if (profitSells.length > 0) {
      var totalProfit = profitSells.reduce(function(s,t){return s+(t.pnl||0);},0);
      lines.push('Locked in <span class="recap-highlight gain">+' + fmt(totalProfit) + ' in profits</span>. ');
    }
    if (lossSells.length > 0) {
      var totalLoss = lossSells.reduce(function(s,t){return s+(t.pnl||0);},0);
      lines.push('Took <span class="recap-highlight loss">' + fmt(totalLoss) + ' in losses</span>. ');
    }
  }

  if (rd.topMover && rd.holdings.length > 1) {
    if (rd.topMover.pnlPct > 0) lines.push('Top performer: <b>' + rd.topMover.symbol + '</b> at <span class="recap-highlight gain">+' + rd.topMover.pnlPct.toFixed(1) + '%</span>. ');
    if (rd.bottomMover && rd.bottomMover.pnlPct < 0) lines.push('Weakest: <b>' + rd.bottomMover.symbol + '</b> at <span class="recap-highlight loss">' + rd.bottomMover.pnlPct.toFixed(1) + '%</span>. ');
  }

  if (rd.weeklyGain > 0) lines.push('<span class="recap-highlight gain">Green week!</span>');
  else if (rd.weeklyGain < 0) lines.push('<span class="recap-highlight loss">Red week.</span>');

  return lines.join('');
}

// ============================================================
// AI-POWERED COMMENTARY (via Anthropic API)
// ============================================================
function getRecapCacheKey(week) {
  return 'recap_' + week.monday.toISOString().slice(0,10);
}

function generateAIRecap(recapData, week) {
  var cacheKey = getRecapCacheKey(week);

  // Check Firebase cache first
  fbGet('recapCache/' + cacheKey).then(function(cached) {
    if (cached && cached.html) {
      document.getElementById('recapContent').innerHTML = cached.html;
      document.getElementById('recapCacheInfo').textContent = 'AI recap generated ' + new Date(cached.generatedAt).toLocaleString() + ' (cached)';
      document.getElementById('recapRegenBtn').style.display = 'inline-flex';
      return;
    }
    // No cache — generate fresh
    callAnthropicForRecap(recapData, week, cacheKey);
  }).catch(function() {
    callAnthropicForRecap(recapData, week, cacheKey);
  });
}

function callAnthropicForRecap(recapData, week, cacheKey) {
  if (!cfg.anthropicKey) {
    // No API key — fall back to rule-based
    renderRecap(recapData, week);
    document.getElementById('recapCacheInfo').textContent = 'Using template commentary. Add your Anthropic API key to EMBEDDED for AI-generated recaps.';
    return;
  }

  document.getElementById('recapContent').innerHTML =
    '<div class="recap-empty"><div style="font-size:32px;margin-bottom:12px;">\u270D\uFE0F</div>' +
    '<div style="font-size:16px;font-weight:600;margin-bottom:8px;">Claude is writing your recap...</div>' +
    '<div>Analyzing trades and crafting personalized commentary.</div></div>';

  // Build the prompt with all player data
  var prompt = 'You are writing a fun, engaging weekly investment recap newsletter for a family stock trading competition. ';
  prompt += 'This is an educational simulator where family members compete with fake money. ';
  prompt += 'Week: ' + week.label + '. Starting balance: ' + fmt(cfg.startingBalance) + ' each.\n\n';

  recapData.forEach(function(rd) {
    prompt += '--- PLAYER: ' + rd.member.name + ' ---\n';
    prompt += 'Net worth: ' + fmt(rd.netWorth) + ' (cash: ' + fmt(rd.cash) + ', holdings: ' + fmt(rd.holdingsValue) + ')\n';
    prompt += 'Overall gain/loss: ' + (rd.weeklyGain>=0?'+':'') + fmt(rd.weeklyGain) + ' (' + rd.weeklyPct.toFixed(2) + '%)\n';
    prompt += 'Trades this week: ' + rd.trades.length + '\n';
    if (rd.weekBuys.length > 0) {
      prompt += 'Buys: ';
      rd.weekBuys.forEach(function(t) { prompt += t.shares + 'x ' + t.symbol + ' @ ' + fmt(t.price) + ', '; });
      prompt += '\n';
    }
    if (rd.weekSells.length > 0) {
      prompt += 'Sells: ';
      rd.weekSells.forEach(function(t) { prompt += t.shares + 'x ' + t.symbol + ' @ ' + fmt(t.price) + ' (P&L: ' + fmt(t.pnl||0) + '), '; });
      prompt += '\n';
    }
    if (rd.holdings.length > 0) {
      prompt += 'Current holdings: ';
      rd.holdings.forEach(function(h) { prompt += h.symbol + ' (' + h.shares + ' shares, ' + (h.pnlPct>=0?'+':'') + h.pnlPct.toFixed(1) + '%), '; });
      prompt += '\n';
    }
    prompt += '\n';
  });

  prompt += 'Write the recap in two sections:\n';
  prompt += '1. RANKING: A brief paragraph ranking all players for the week with their gains/losses. Make it fun and competitive.\n';
  prompt += '2. PLAYER HIGHLIGHTS: A separate paragraph for EACH player (use their name as a header). For each player, highlight:\n';
  prompt += '   - Their best and worst trades or decisions this week\n';
  prompt += '   - Their top and bottom performing holdings\n';
  prompt += '   - Whether they are being too aggressive, too conservative, or well-balanced\n';
  prompt += '   - A specific actionable suggestion for next week\n';
  prompt += '   - Reference the family competition and other players when relevant\n\n';
  prompt += 'Keep the tone friendly, encouraging but honest. Use specific numbers. Make it feel like a real investment newsletter that a family would enjoy reading together. Keep each player section to about 3-5 sentences. Do NOT use markdown formatting — use plain HTML with <b> for bold and <br> for line breaks.';

  fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{role: 'user', content: prompt}]
    })
  })
  .then(function(r) {
    if (!r.ok) {
      return r.json().then(function(err) {
        var msg = (err.error && err.error.message) || JSON.stringify(err);
        throw new Error('API ' + r.status + ': ' + msg);
      }).catch(function(e) {
        if (e.message.indexOf('API') === 0) throw e;
        throw new Error('API returned ' + r.status);
      });
    }
    return r.json();
  })
  .then(function(data) {
    var text = data.content.map(function(c){return c.text||'';}).join('');

    // Build the final HTML with ranking section + AI commentary
    var html = '';

    // Keep the data-driven ranking at the top
    html += '<div class="recap-ranking"><div class="recap-section-title">Weekly Performance Ranking</div>';
    recapData.forEach(function(rd, i) {
      var m = rd.member;
      var c = memberColor(m);
      var isPositive = rd.weeklyGain >= 0;
      var avatarContent = m.avatarImg ? '<img class="avatar-img" src="' + m.avatarImg + '" alt="">' : (m.emoji||memberInitials(m.name));
      html += '<div class="recap-rank-row">' +
        '<div class="recap-rank-num" style="color:' + (i===0?'var(--gold)':i===1?'#9ca3af':'#b45309') + ';">' + rankEmoji(i) + '</div>' +
        '<div class="avatar" style="background:' + c.bg + ';color:' + c.color + ';">' + avatarContent + '</div>' +
        '<div class="recap-rank-info"><div class="recap-rank-name">' + m.name + '</div>' +
        '<div class="recap-rank-detail">Net Worth: ' + fmt(rd.netWorth) + ' \u00B7 ' + rd.trades.length + ' trade' + (rd.trades.length!==1?'s':'') + '</div></div>' +
        '<div class="recap-rank-change"><div class="recap-rank-amount" style="color:' + (isPositive?'var(--green)':'var(--red)') + ';">' + (isPositive?'+':'') + fmt(rd.weeklyGain) + '</div>' +
        '<div class="recap-rank-pct" style="color:' + (isPositive?'var(--green)':'var(--red)') + ';">' + (isPositive?'+':'') + rd.weeklyPct.toFixed(2) + '% overall</div></div></div>';
    });
    html += '</div>';

    // AI-generated commentary
    html += '<div class="recap-blog"><div class="recap-section-title">AI Commentary by Claude</div>';
    html += '<div class="recap-player-card"><div class="recap-text">' + text + '</div></div>';
    html += '</div>';

    document.getElementById('recapContent').innerHTML = html;
    document.getElementById('recapCacheInfo').textContent = 'AI recap generated just now';
    document.getElementById('recapRegenBtn').style.display = 'inline-flex';

    // Cache in Firebase
    fbSet('recapCache/' + cacheKey, {
      html: html,
      generatedAt: Date.now(),
      week: week.label
    });
  })
  .catch(function(e) {
    console.error('AI recap failed:', e);
    // Fall back to rule-based
    renderRecap(recapData, week);
    document.getElementById('recapCacheInfo').textContent = 'AI generation failed (' + e.message + '). Showing template recap.';
  });
}

// Generate recap when the tab is clicked
document.querySelector('[data-page="recap"]').addEventListener('click', function() {
  setTimeout(generateWeeklyRecap, 100);
});

// Regenerate button
document.getElementById('recapRegenBtn').addEventListener('click', function() {
  var week = getWeekRange();
  var cacheKey = getRecapCacheKey(week);
  // Clear cache and regenerate
  fbRemove('recapCache/' + cacheKey).then(function() {
    generateWeeklyRecap();
  });
});

// ============================================================
// AFTER HOURS HANDLERS
// ============================================================
document.getElementById('ahCancelBtn').addEventListener('click', function() {
  document.getElementById('afterHoursOverlay').classList.add('hidden');
  pendingTradeDetails = null;
});

document.getElementById('ahQueueBtn').addEventListener('click', function() {
  if (!pendingTradeDetails) return;
  var btn = document.getElementById('ahQueueBtn');
  // Require PIN before queuing
  openPinModal(pendingTradeDetails.playerId, function() {
    var orderId = 'order_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    var order = {
      id: orderId,
      action: pendingTradeDetails.action,
      symbol: pendingTradeDetails.symbol,
      shares: pendingTradeDetails.shares,
      lastClosePrice: pendingTradeDetails.lastClosePrice,
      playerId: pendingTradeDetails.playerId,
      playerName: (members.find(function(m){return m.id===pendingTradeDetails.playerId;})||{}).name||'',
      queuedAt: Date.now(),
      status: 'pending'
    };
    fbSet('pendingOrders/' + orderId, order).then(function() {
      document.getElementById('afterHoursOverlay').classList.add('hidden');
      pendingTradeDetails = null;
      showToast('Order queued! Will execute at market open tomorrow.');
    }).catch(function(e) {
      showToast('Failed to queue order: ' + e.message, 'error');
    });
  });
});

// ============================================================
// PENDING ORDER PROCESSING
// ============================================================
function checkAndExecutePendingOrders() {
  if (!isMarketOpen()) return;
  // Only execute after 9:45 AM ET (15 min buffer for quote delay)
  var et = new Date(new Date().toLocaleString('en-US',{timeZone:'America/New_York'}));
  var h = et.getHours() + et.getMinutes()/60;
  if (h < 9.75) return; // Before 9:45 AM ET

  fbGet('pendingOrders').then(function(orders) {
    if (!orders) return;
    var orderList = Object.values(orders).filter(function(o){ return o.status === 'pending'; });
    if (!orderList.length) return;

    var chain = Promise.resolve();
    orderList.forEach(function(order) {
      chain = chain.then(function() {
        return fetchQuote(order.symbol).then(function(quote) {
          return executePendingOrder(order, quote.price);
        }).catch(function(e) {
          console.warn('Failed to execute pending order', order.id, e);
        });
      }).then(function() {
        return new Promise(function(r){ setTimeout(r, 500); });
      });
    });
  });
}

function executePendingOrder(order, currentPrice) {
  var p = portfolios[order.playerId];
  if (!p) return fbRemove('pendingOrders/' + order.id);

  if (order.action === 'BUY') {
    var total = order.shares * currentPrice;
    if (total > p.cash) {
      // Not enough cash at new price - cancel order
      fbRemove('pendingOrders/' + order.id);
      showToast(order.playerName + "'s queued BUY of " + order.symbol + " cancelled — not enough cash at " + fmt(currentPrice), 'error');
      return Promise.resolve();
    }
    var newCash = p.cash - total;
    var h = (p.holdings && p.holdings[order.symbol]) || {shares:0, avgCost:0};
    var newShares = h.shares + order.shares;
    var newAvg = (h.shares * h.avgCost + total) / newShares;
    var hist = p.history ? (Array.isArray(p.history) ? p.history : Object.values(p.history)) : [];
    hist.push({action:'BUY', symbol:order.symbol, shares:order.shares, price:currentPrice, total:total, cashAfter:newCash, ts:Date.now(), queued:true, queuedAt:order.queuedAt, lastClosePrice:order.lastClosePrice});
    var updates = {};
    updates['portfolios/' + order.playerId + '/cash'] = newCash;
    updates['portfolios/' + order.playerId + '/holdings/' + order.symbol + '/shares'] = newShares;
    updates['portfolios/' + order.playerId + '/holdings/' + order.symbol + '/avgCost'] = newAvg;
    updates['portfolios/' + order.playerId + '/holdings/' + order.symbol + '/lastPrice'] = currentPrice;
    return db.ref().update(updates).then(function() {
      return fbSet('portfolios/' + order.playerId + '/history', hist);
    }).then(function() {
      return fbRemove('pendingOrders/' + order.id);
    }).then(function() {
      var diff = currentPrice - order.lastClosePrice;
      var diffStr = diff >= 0 ? '+' + fmt(diff) : fmt(diff);
      showToast(order.playerName + ' queued BUY of ' + order.shares + ' ' + order.symbol + ' filled at ' + fmt(currentPrice) + ' (' + diffStr + ' vs close)');
    });

  } else if (order.action === 'SELL') {
    var h = p.holdings && p.holdings[order.symbol];
    if (!h || h.shares < order.shares) {
      fbRemove('pendingOrders/' + order.id);
      showToast(order.playerName + "'s queued SELL of " + order.symbol + " cancelled — not enough shares", 'error');
      return Promise.resolve();
    }
    var total = order.shares * currentPrice;
    var pnl = total - (order.shares * h.avgCost);
    var newCash = p.cash + total;
    var hist = p.history ? (Array.isArray(p.history) ? p.history : Object.values(p.history)) : [];
    hist.push({action:'SELL', symbol:order.symbol, shares:order.shares, price:currentPrice, total:total, pnl:pnl, cashAfter:newCash, ts:Date.now(), queued:true, queuedAt:order.queuedAt, lastClosePrice:order.lastClosePrice});
    var updates = {};
    updates['portfolios/' + order.playerId + '/cash'] = newCash;
    updates['portfolios/' + order.playerId + '/holdings/' + order.symbol + '/shares'] = h.shares - order.shares;
    updates['portfolios/' + order.playerId + '/holdings/' + order.symbol + '/lastPrice'] = currentPrice;
    return db.ref().update(updates).then(function() {
      return fbSet('portfolios/' + order.playerId + '/history', hist);
    }).then(function() {
      return fbRemove('pendingOrders/' + order.id);
    }).then(function() {
      var diff = currentPrice - order.lastClosePrice;
      var diffStr = diff >= 0 ? '+' + fmt(diff) : fmt(diff);
      showToast(order.playerName + ' queued SELL of ' + order.shares + ' ' + order.symbol + ' filled at ' + fmt(currentPrice) + ' (' + diffStr + ' vs close)');
    });
  }
}

function renderPendingOrders() {
  var section = document.getElementById('pendingOrdersSection');
  if (!section) return;
  fbGet('pendingOrders').then(function(orders) {
    if (!orders) { section.style.display = 'none'; return; }
    var orderList = Object.values(orders).filter(function(o){ return o.status === 'pending'; });
    // Filter to current player's orders for display, but show count for all
    var myOrders = orderList.filter(function(o){ return o.playerId === activePlayer; });
    var othersCount = orderList.length - myOrders.length;

    if (!orderList.length) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    var html = '<div class="pending-section"><div class="pending-title">&#9201; Pending Orders (queued after hours)</div>';
    myOrders.forEach(function(o) {
      var timeStr = new Date(o.queuedAt).toLocaleString();
      html += '<div class="pending-item">' +
        '<div><span style="color:' + (o.action==='BUY'?'var(--green)':'var(--red)') + ';font-weight:700;">' + o.action + '</span> ' +
        '<span class="ticker-badge">' + o.symbol + '</span> x' + o.shares +
        '<span style="color:var(--muted);font-size:11px;margin-left:8px;">queued ' + timeStr + '</span></div>' +
        '<button class="pending-cancel" data-oid="' + o.id + '">Cancel</button></div>';
    });
    if (othersCount > 0) {
      html += '<div style="font-size:12px;color:var(--muted);margin-top:8px;">' + othersCount + ' other pending order' + (othersCount!==1?'s':'') + ' from other players</div>';
    }
    html += '</div>';
    section.innerHTML = html;

    section.querySelectorAll('.pending-cancel').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (!confirm('Cancel this pending order?')) return;
        fbRemove('pendingOrders/' + btn.dataset.oid).then(function() {
          showToast('Pending order cancelled.', 'info');
          renderPendingOrders();
        });
      });
    });
  });
}

// ============================================================
// EVENT WIRING
// ============================================================
document.getElementById('lookupBtn').addEventListener('click', lookupStock);
document.getElementById('tickerInput').addEventListener('keydown', function(e){ if(e.key==='Enter') lookupStock(); });
document.getElementById('qtyInput').addEventListener('input', updateTradeCost);
document.getElementById('buyBtn').addEventListener('click', executeBuy);
document.getElementById('sellBtn').addEventListener('click', executeSell);
document.getElementById('nextTipBtn').addEventListener('click', function(){ tipIndex++; renderTip(); });
document.querySelectorAll('.tab-btn').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('.tab-btn').forEach(function(b){b.classList.remove('active');});
    document.querySelectorAll('.tab-pane').forEach(function(p){p.classList.remove('active');});
    btn.classList.add('active');
    document.getElementById('tab-'+btn.dataset.tab).classList.add('active');
  });
});


// ============================================================
// AVATAR EDITOR
// ============================================================
var EMOJI_LIST = [
  '😀','😎','🤓','😊','🥳','😂','🤩','😇','🤗','🫡','🧐','🤔',
  '👨','👩','👦','👧','👴','👵','🧑','👶','🤴','👸','🦸','🧙',
  '🐶','🐱','🐻','🦊','🐼','🐨','🦁','🐯','🐸','🐵','🦄','🐲',
  '⚽','🏀','🏈','⚾','🎾','🏐','🎮','🕹️','🏆','🎯','🎲','♟️',
  '🚀','✈️','🏎️','⛵','🛸','🌟','💎','🔥','⚡','🌈','🎸','🎭',
  '📈','💰','💵','🏦','💳','📊','🧮','💡','🎓','📚','🔬','🖥️',
  '🍕','🍔','🌮','🍣','🍩','☕','🧁','🍿','🎂','🍦','🥑','🍜',
  '❤️','💜','💙','💚','🧡','💛','🖤','🤍','💗','🩵','🩷','🫶'
];

var avatarEditMemberId = null;
var avatarEditValue = {type:'emoji', emoji:'', img:''};

function openAvatarEditor(memberId) {
  var m = members.find(function(m){ return m.id === memberId; });
  if (!m) return;
  avatarEditMemberId = memberId;
  document.getElementById('avatarEditorSub').textContent = 'Change ' + m.name + "'s avatar.";

  // Set initial value
  if (m.avatarImg) {
    avatarEditValue = {type:'upload', emoji:m.emoji||'', img:m.avatarImg};
    setAvatarMode('upload');
  } else {
    avatarEditValue = {type:'emoji', emoji:m.emoji||memberInitials(m.name), img:''};
    setAvatarMode('emoji');
  }
  updateAvatarPreview();
  renderEmojiGrid();
  document.getElementById('avatarEditorOverlay').classList.remove('hidden');
}

function setAvatarMode(mode) {
  document.getElementById('avatarModeEmoji').classList.toggle('active', mode==='emoji');
  document.getElementById('avatarModeUpload').classList.toggle('active', mode==='upload');
  document.getElementById('avatarEmojiPanel').style.display = mode==='emoji' ? 'block' : 'none';
  document.getElementById('avatarUploadPanel').style.display = mode==='upload' ? 'block' : 'none';
}

document.getElementById('avatarModeEmoji').addEventListener('click', function(){ setAvatarMode('emoji'); avatarEditValue.type='emoji'; });
document.getElementById('avatarModeUpload').addEventListener('click', function(){ setAvatarMode('upload'); avatarEditValue.type='upload'; });

function updateAvatarPreview() {
  var preview = document.getElementById('avatarPreview');
  var m = members.find(function(m){ return m.id === avatarEditMemberId; });
  var c = m ? memberColor(m) : AVATAR_COLORS[0];
  if (avatarEditValue.type === 'upload' && avatarEditValue.img) {
    preview.innerHTML = '<img src="' + avatarEditValue.img + '" alt="" style="width:100%;height:100%;object-fit:cover;">';
    preview.style.background = 'var(--surface2)';
  } else {
    preview.textContent = avatarEditValue.emoji || '?';
    preview.style.background = c.bg;
    preview.style.color = c.color;
  }
}

function renderEmojiGrid() {
  var grid = document.getElementById('emojiGrid');
  grid.innerHTML = EMOJI_LIST.map(function(e) {
    var sel = avatarEditValue.emoji === e && avatarEditValue.type === 'emoji' ? ' selected' : '';
    return '<button class="emoji-pick' + sel + '" data-emoji="' + e + '">' + e + '</button>';
  }).join('');
  grid.querySelectorAll('.emoji-pick').forEach(function(btn) {
    btn.addEventListener('click', function() {
      avatarEditValue.type = 'emoji';
      avatarEditValue.emoji = btn.dataset.emoji;
      avatarEditValue.img = '';
      setAvatarMode('emoji');
      updateAvatarPreview();
      renderEmojiGrid();
    });
  });
}

// File upload handling
document.getElementById('uploadZone').addEventListener('click', function() {
  document.getElementById('avatarFileInput').click();
});

document.getElementById('avatarFileInput').addEventListener('change', function(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    var img = new Image();
    img.onload = function() {
      // Resize to 100x100 thumbnail
      var canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      var ctx = canvas.getContext('2d');
      // Center crop
      var size = Math.min(img.width, img.height);
      var sx = (img.width - size) / 2;
      var sy = (img.height - size) / 2;
      ctx.drawImage(img, sx, sy, size, size, 0, 0, 100, 100);
      var dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      avatarEditValue.type = 'upload';
      avatarEditValue.img = dataUrl;
      updateAvatarPreview();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
  // Reset input so same file can be re-selected
  e.target.value = '';
});

// Also support drag-and-drop on upload zone
var uploadZone = document.getElementById('uploadZone');
uploadZone.addEventListener('dragover', function(e){ e.preventDefault(); uploadZone.style.borderColor='var(--accent)'; });
uploadZone.addEventListener('dragleave', function(){ uploadZone.style.borderColor=''; });
uploadZone.addEventListener('drop', function(e) {
  e.preventDefault();
  uploadZone.style.borderColor = '';
  var file = e.dataTransfer.files[0];
  if (!file || !file.type.startsWith('image/')) return;
  // Trigger the same processing as file input
  var input = document.getElementById('avatarFileInput');
  var dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));
});

// Cancel
document.getElementById('avatarCancelBtn').addEventListener('click', function() {
  document.getElementById('avatarEditorOverlay').classList.add('hidden');
});

// Save
document.getElementById('avatarSaveBtn').addEventListener('click', function() {
  var btn = document.getElementById('avatarSaveBtn');
  setLoading(btn, true, 'Saving...');
  var updates = {};
  if (avatarEditValue.type === 'upload' && avatarEditValue.img) {
    updates.avatarImg = avatarEditValue.img;
    updates.emoji = avatarEditValue.emoji || memberInitials(members.find(function(m){return m.id===avatarEditMemberId;}).name);
  } else {
    updates.avatarImg = null;
    updates.emoji = avatarEditValue.emoji || '?';
  }
  fbUpdate('members/' + avatarEditMemberId, updates).then(function() {
    showToast('Avatar updated!');
    document.getElementById('avatarEditorOverlay').classList.add('hidden');
    // Re-render manage list if open
    if (!document.getElementById('manageMembersOverlay').classList.contains('hidden')) renderManageList();
  }).catch(function(e) {
    showToast('Failed to save: ' + e.message, 'error');
  }).then(function() {
    setLoading(btn, false, 'Save Avatar');
  });
});

// ============================================================
// TOP NAVIGATION — page switching
// ============================================================
document.querySelectorAll('.top-nav-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.top-nav-btn').forEach(function(b){ b.classList.remove('active'); });
    document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
    btn.classList.add('active');
    document.getElementById('page-' + btn.dataset.page).classList.add('active');
  });
});

// ============================================================
// STOCK SCREENER
// ============================================================
var WATCHLISTS = {
  sp500: ['AAPL','MSFT','NVDA','GOOG','AMZN','META','BRK.B','LLY','AVGO','JPM','TSLA','UNH','V','XOM','MA','JNJ','PG','COST','HD','ABBV','WMT','NFLX','CRM','BAC','ORCL'],
  tech: ['PLTR','CRWD','NET','SNOW','DDOG','MDB','ZS','PANW','SHOP','SQ','COIN','RBLX','U','HOOD','AFRM','PATH','BILL','MNDY','GTLB','DOCN','APP','IONQ','SMCI','ARM','RDDT'],
  dividend: ['JNJ','KO','PG','PEP','MCD','IBM','CVX','XOM','ABBV','MO','T','VZ','PM','MMM','CAT','GIS','HRL','SWK','CL','EMR','SYY','WBA','TROW','BEN','FRT'],
  smallcap: ['HIMS','DUOL','CELH','TOST','BROS','DRS','AEHR','SOUN','IONQ','RKLB','DNA','ASTS','MNTS','ARQQ','VERI','ACHR','JOBY','LILM','BBAI','OUST','INDI','ME','GENI','CLOV','SOFI'],
  healthcare: ['UNH','LLY','ABBV','TMO','ISRG','ABT','DHR','PFE','MRK','AMGN','MDT','BMY','GILD','REGN','VRTX','ZTS','CI','HCA','ELV','DXCM','BSX','SYK','IDXX','EW','A'],
  energy: ['XOM','CVX','OXY','SLB','EOG','COP','MPC','VLO','PSX','WMB','KMI','HAL','DVN','FANG','HES','BKR','CTRA','MRO','APA','OVV','EQT','AR','TRGP','LNG','DINO'],
  retail: ['COST','TJX','LULU','DPZ','CMG','NKE','SBUX','TGT','ROST','DG','DLTR','BURL','FIVE','DECK','ULTA','EL','CPNG','MNST','KDP','STZ','KHC','HSY','GIS','K','SJM']
};

var screenerData = [];
var screenerSort = {col:'compositeScore', dir:'desc'};
var customWatchlist = [];

// Show/hide the add ticker row when My Watchlist is selected
document.getElementById('screenerListSelect').addEventListener('change', function() {
  var isWatchlist = this.value === 'watchlist';
  document.getElementById('watchlistAddRow').style.display = isWatchlist ? 'flex' : 'none';
  // Load saved watchlist from Firebase
  if (isWatchlist && db) {
    fbGet('watchlist').then(function(data) {
      customWatchlist = data ? Object.values(data) : [];
      if (!customWatchlist.length) {
        document.getElementById('screenerBody').innerHTML = '<tr><td colspan="23" style="text-align:center;padding:40px;color:var(--muted);font-family:inherit;">Your watchlist is empty. Add ticker symbols above to get started.</td></tr>';
      }
    });
  }
});

// Add ticker to watchlist
document.getElementById('watchlistAddBtn').addEventListener('click', function() {
  var input = document.getElementById('watchlistAddInput');
  var sym = input.value.toUpperCase().trim();
  if (!sym) return;
  if (customWatchlist.indexOf(sym) >= 0) { showToast(sym + ' is already in your watchlist','info'); return; }
  customWatchlist.push(sym);
  fbSet('watchlist', customWatchlist).then(function() {
    input.value = '';
    showToast(sym + ' added to watchlist');
  });
});

// Refresh screener data
document.getElementById('screenerRefreshBtn').addEventListener('click', function() {
  var listKey = document.getElementById('screenerListSelect').value;
  var symbols = listKey === 'watchlist' ? customWatchlist.slice() : (WATCHLISTS[listKey] || []);
  if (!symbols.length) {
    showToast('No stocks in this list','error');
    return;
  }
  loadScreenerData(symbols);
});

function loadScreenerData(symbols) {
  screenerData = [];
  var statusEl = document.getElementById('screenerStatus');
  var statusText = document.getElementById('screenerStatusText');
  var progressFill = document.getElementById('screenerProgressFill');
  var btn = document.getElementById('screenerRefreshBtn');

  statusEl.style.display = 'flex';
  btn.disabled = true;
  btn.textContent = 'Loading...';
  progressFill.style.width = '0%';

  var total = symbols.length;
  var loaded = 0;
  var chain = Promise.resolve();

  symbols.forEach(function(sym) {
    chain = chain.then(function() {
      statusText.textContent = 'Fetching ' + sym + ' (' + (loaded+1) + '/' + total + ')...';
      return Promise.all([
        fetchQuote(sym).catch(function(){ return null; }),
        fetchMetrics(sym).catch(function(){ return null; }),
        fetchProfile(sym).catch(function(){ return null; })
      ]).then(function(results) {
        var quote = results[0], metrics = results[1], profile = results[2];
        if (quote) {
          var row = buildScreenerRow(sym, quote, metrics, profile);
          screenerData.push(row);
        }
        loaded++;
        progressFill.style.width = Math.round((loaded/total)*100) + '%';
      });
    }).then(function() {
      return new Promise(function(r){ setTimeout(r, 350); });
    });
  });

  chain.then(function() {
    sortScreenerData();
    renderScreenerTable();
    statusEl.style.display = 'none';
    btn.disabled = false;
    btn.textContent = 'Refresh Data';
    showToast('Screener loaded: ' + screenerData.length + ' stocks analyzed');
  }).catch(function(e) {
    statusEl.style.display = 'none';
    btn.disabled = false;
    btn.textContent = 'Refresh Data';
    showToast('Error loading data: ' + e.message, 'error');
  });
}

function fetchMetrics(symbol) {
  return fetch('https://finnhub.io/api/v1/stock/metric?symbol=' + symbol.toUpperCase() + '&metric=all&token=' + cfg.finnhubKey)
    .then(function(r){ return r.json(); })
    .then(function(d){ return d.metric || {}; });
}

function buildScreenerRow(sym, quote, metrics, profile) {
  var m = metrics || {};
  var pe = m.peNormalizedAnnual || m.peTTM || null;
  var fwdPe = m.forwardPE || m.peExclExtraAnnual || null;
  var eps = m.epsNormalizedAnnual || m.epsTTM || null;
  var fwdEps = m.epsEstimateNextQuarter || null;
  var divYield = m.dividendYieldIndicatedAnnual || m.currentDividendYieldTTM || 0;
  var wk52hi = m['52WeekHigh'] || quote.price;
  var wk52lo = m['52WeekLow'] || quote.price;
  var ma50 = m['50DayMovingAverage'] || null;
  var ma200 = m['200DayMovingAverage'] || null;
  var mktCap = m.marketCapitalization || 0;
  var beta = m.beta || null;

  var pctFrom52hi = wk52hi > 0 ? ((quote.price - wk52hi) / wk52hi) * 100 : 0;
  var pctVsMa50 = ma50 ? ((quote.price - ma50) / ma50) * 100 : null;
  var pctVsMa200 = ma200 ? ((quote.price - ma200) / ma200) * 100 : null;

  // ── SCORING ──
  var valueScore = calcValueScore(pe, fwdPe, eps, fwdEps);
  var momentumScore = calcMomentumScore(pctFrom52hi, pctVsMa50, pctVsMa200);
  var yieldScore = calcYieldScore(divYield);
  var compositeScore = Math.round(valueScore * 0.35 + momentumScore * 0.45 + yieldScore * 0.20);

  return {
    symbol: sym,
    name: (profile && profile.name) || sym,
    price: quote.price,
    change: quote.changePct || 0,
    pe: pe, fwdPe: fwdPe, eps: eps, fwdEps: fwdEps,
    divYield: divYield, wk52hi: wk52hi, wk52lo: wk52lo,
    pctFrom52hi: pctFrom52hi, ma50: pctVsMa50, ma200: pctVsMa200,
    mktCap: mktCap, beta: beta,
    valueScore: valueScore, momentumScore: momentumScore,
    yieldScore: yieldScore, compositeScore: compositeScore
  };
}

function calcValueScore(pe, fwdPe, eps, fwdEps) {
  var score = 50; // baseline
  // Lower P/E is better (score higher)
  if (pe !== null) {
    if (pe < 0) score -= 15;
    else if (pe < 10) score += 30;
    else if (pe < 15) score += 25;
    else if (pe < 20) score += 15;
    else if (pe < 30) score += 5;
    else if (pe < 50) score -= 5;
    else score -= 15;
  }
  // Forward P/E lower than current P/E = improving
  if (fwdPe !== null && pe !== null && pe > 0 && fwdPe > 0) {
    if (fwdPe < pe) score += 10;
    else score -= 5;
  }
  // Positive & growing EPS
  if (eps !== null && eps > 0) score += 5;
  if (fwdEps !== null && eps !== null && fwdEps > eps) score += 5;
  return Math.max(0, Math.min(100, score));
}

function calcMomentumScore(pctFrom52hi, pctVsMa50, pctVsMa200) {
  var score = 50;
  // Closer to 52-week high = stronger momentum
  if (pctFrom52hi !== null) {
    if (pctFrom52hi > -5) score += 25;
    else if (pctFrom52hi > -10) score += 15;
    else if (pctFrom52hi > -20) score += 5;
    else if (pctFrom52hi > -30) score -= 10;
    else score -= 20;
  }
  // Above 50-day MA = bullish
  if (pctVsMa50 !== null) {
    if (pctVsMa50 > 5) score += 10;
    else if (pctVsMa50 > 0) score += 5;
    else if (pctVsMa50 > -5) score -= 5;
    else score -= 10;
  }
  // Above 200-day MA = long-term bullish
  if (pctVsMa200 !== null) {
    if (pctVsMa200 > 10) score += 10;
    else if (pctVsMa200 > 0) score += 5;
    else if (pctVsMa200 > -10) score -= 5;
    else score -= 10;
  }
  return Math.max(0, Math.min(100, score));
}

function calcYieldScore(divYield) {
  if (!divYield || divYield <= 0) return 20;
  if (divYield >= 5) return 95;
  if (divYield >= 4) return 85;
  if (divYield >= 3) return 75;
  if (divYield >= 2) return 60;
  if (divYield >= 1) return 45;
  return 30;
}

function sortScreenerData() {
  var col = screenerSort.col;
  var dir = screenerSort.dir === 'asc' ? 1 : -1;
  screenerData.sort(function(a, b) {
    var va = a[col], vb = b[col];
    if (va === null || va === undefined) va = -9999999;
    if (vb === null || vb === undefined) vb = -9999999;
    if (typeof va === 'string') return dir * va.localeCompare(vb);
    return dir * (va - vb);
  });
}

function renderScreenerTable() {
  var tbody = document.getElementById('screenerBody');
  var isWatchlist = document.getElementById('screenerListSelect').value === 'watchlist';
  if (!screenerData.length) {
    tbody.innerHTML = '<tr><td colspan="23" style="text-align:center;padding:40px;color:var(--muted);font-family:inherit;">No data. Click Refresh Data to load.</td></tr>';
    return;
  }
  tbody.innerHTML = screenerData.map(function(r, i) {
    return '<tr>' +
      '<td style="text-align:center;color:var(--muted);font-family:inherit;">' + (i+1) + '</td>' +
      '<td style="text-align:left;"><span class="ticker-badge">' + r.symbol + '</span></td>' +
      '<td style="text-align:left;font-family:inherit;max-width:140px;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(r.name) + '</td>' +
      '<td style="text-align:right;">' + fmt(r.price) + '</td>' +
      '<td style="text-align:right;color:' + (r.change>=0?'var(--green)':'var(--red)') + ';">' + (r.change>=0?'+':'') + (r.change||0).toFixed(2) + '%</td>' +
      '<td style="text-align:right;">' + fmtNum(r.pe) + '</td>' +
      '<td style="text-align:right;">' + fmtNum(r.fwdPe) + '</td>' +
      '<td style="text-align:right;">' + fmtNum(r.eps) + '</td>' +
      '<td style="text-align:right;">' + fmtNum(r.fwdEps) + '</td>' +
      '<td style="text-align:right;">' + (r.divYield ? r.divYield.toFixed(2)+'%' : '—') + '</td>' +
      '<td style="text-align:right;">' + fmt(r.wk52hi) + '</td>' +
      '<td style="text-align:right;">' + fmt(r.wk52lo) + '</td>' +
      '<td style="text-align:right;color:' + (r.pctFrom52hi>=-5?'var(--green)':'var(--red)') + ';">' + (r.pctFrom52hi||0).toFixed(1) + '%</td>' +
      '<td style="text-align:right;color:' + colorForPct(r.ma50) + ';">' + fmtPctOrDash(r.ma50) + '</td>' +
      '<td style="text-align:right;color:' + colorForPct(r.ma200) + ';">' + fmtPctOrDash(r.ma200) + '</td>' +
      '<td style="text-align:right;">' + fmtMktCap(r.mktCap) + '</td>' +
      '<td style="text-align:right;">' + fmtNum(r.beta) + '</td>' +
      '<td style="text-align:right;">' + renderMiniScore(r.valueScore) + '</td>' +
      '<td style="text-align:right;">' + renderMiniScore(r.momentumScore) + '</td>' +
      '<td style="text-align:right;">' + renderMiniScore(r.yieldScore) + '</td>' +
      '<td>' + renderScoreBar(r.compositeScore) + '</td>' +
      '<td style="text-align:center;">' +
        '<button class="trade-link" data-sym="' + r.symbol + '">Trade</button>' +
        (isWatchlist ? ' <button class="remove-wl-btn" data-sym="' + r.symbol + '" title="Remove">✕</button>' : '') +
      '</td>' +
    '</tr>';
  }).join('');

  // Wire trade buttons
  tbody.querySelectorAll('.trade-link').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.getElementById('tickerInput').value = btn.dataset.sym;
      // Switch to trading page
      document.querySelectorAll('.top-nav-btn').forEach(function(b){ b.classList.remove('active'); });
      document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
      document.querySelector('[data-page="trading"]').classList.add('active');
      document.getElementById('page-trading').classList.add('active');
      // Auto-lookup
      setTimeout(function(){ document.getElementById('lookupBtn').click(); }, 200);
    });
  });

  // Wire remove from watchlist buttons
  tbody.querySelectorAll('.remove-wl-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var sym = btn.dataset.sym;
      customWatchlist = customWatchlist.filter(function(s){ return s !== sym; });
      screenerData = screenerData.filter(function(r){ return r.symbol !== sym; });
      fbSet('watchlist', customWatchlist.length ? customWatchlist : null);
      renderScreenerTable();
      showToast(sym + ' removed from watchlist','info');
    });
  });

  // Wire sort headers
  document.querySelectorAll('.screener-table th[data-col]').forEach(function(th) {
    th.onclick = function() {
      var col = th.dataset.col;
      if (col === 'trade') return;
      if (screenerSort.col === col) {
        screenerSort.dir = screenerSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        screenerSort.col = col;
        screenerSort.dir = 'desc';
      }
      // Update header classes
      document.querySelectorAll('.screener-table th').forEach(function(h){ h.classList.remove('sorted-asc','sorted-desc'); });
      th.classList.add('sorted-' + screenerSort.dir);
      sortScreenerData();
      renderScreenerTable();
    };
  });
}

function fmtNum(v) {
  if (v === null || v === undefined) return '<span style="color:var(--muted);">—</span>';
  return Number(v).toFixed(2);
}
function fmtPctOrDash(v) {
  if (v === null || v === undefined) return '<span style="color:var(--muted);">—</span>';
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
}
function colorForPct(v) {
  if (v === null || v === undefined) return 'var(--muted)';
  return v >= 0 ? 'var(--green)' : 'var(--red)';
}
function fmtMktCap(v) {
  if (!v) return '<span style="color:var(--muted);">—</span>';
  if (v >= 1000) return (v/1000).toFixed(1) + 'T';
  if (v >= 1) return v.toFixed(1) + 'B';
  return (v*1000).toFixed(0) + 'M';
}
function renderMiniScore(score) {
  var cls = score >= 65 ? 'score-high' : score >= 40 ? 'score-mid' : 'score-low';
  return '<span class="' + cls + '" style="font-weight:600;">' + score + '</span>';
}
function renderScoreBar(score) {
  var cls = score >= 65 ? 'score-high' : score >= 40 ? 'score-mid' : 'score-low';
  var color = score >= 65 ? 'var(--green)' : score >= 40 ? 'var(--amber)' : 'var(--red)';
  return '<div class="score-bar"><span class="score-num ' + cls + '">' + score + '</span><div style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden;"><div class="score-fill" style="width:' + score + '%;background:' + color + ';"></div></div></div>';
}

