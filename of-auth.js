/* Pancha Maha Seva — shared Sevak account client. One identity (email) across every
   gate; this copy is the "onefast" gate. Email one-time-code login + per-gate cloud
   sync of notes & questions. Local-first; logs in/saves to the shared accounts store.
   Each site may set window.OF_SITE before loading this file (default 'onefast'). */
(function(){
  var SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwou749sCStHL5ASKbdY2w_8iFVqLMlwnRzbETVEN_BQJ8OosAA6sUBy0-la73bCyCU4w/exec";
  var SITE = (typeof window!=='undefined' && window.OF_SITE) ? window.OF_SITE : 'onefast';
  var LS = window.localStorage;
  function g(k){ try { return LS.getItem(k); } catch(_) { return null; } }
  function s(k,v){ try { LS.setItem(k,v); } catch(_) { } }
  function post(payload){
    payload.site = SITE;
    return fetch(SCRIPT_URL, {
      method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify(payload)
    }).then(function(r){ return r.json(); });
  }

  var OF = {
    site: function(){ return SITE; },
    isLoggedIn: function(){ return !!g('ofr_sevak'); },
    hasAccount: function(){ return !!g('ofr_token'); },
    email: function(){ return g('ofr_sevak_email') || ''; },
    token: function(){ return g('ofr_token') || ''; },
    name:  function(){ return g('ofr_sevak_name') || ''; },

    /* Step 1 — ask the server to email a code. Resolves with { ok, registered }. */
    requestCode: function(email, name, mobile, source){
      return post({ action:'requestCode', email:String(email||'').trim(),
                    name:name||'', mobile:mobile||'', source:source||SITE });
    },

    /* Step 2 — verify; on success store the session + pull this gate's cloud data. */
    verifyCode: function(email, code){
      email = String(email||'').trim();
      return post({ action:'verifyCode', email:email, code:String(code||'').trim() }).then(function(res){
        if (res && res.ok) {
          s('ofr_sevak','1'); s('ofr_sevak_email', email); s('ofr_token', res.token||'');
          if (res.name) s('ofr_sevak_name', res.name);
          OF._mergeCloud(res.notes, res.questions);
        }
        return res;
      });
    },

    /* offline / "continue anyway" safety net (no cloud account) */
    unlockLocal: function(email, name){
      s('ofr_sevak','1'); if (email) s('ofr_sevak_email', String(email).trim()); if (name) s('ofr_sevak_name', name);
    },

    _mergeCloud: function(notesJSON, questionsJSON){
      try {
        var notes = notesJSON ? JSON.parse(notesJSON) : {};
        Object.keys(notes).forEach(function(chId){ if (notes[chId]) s('ofr_note_'+chId, notes[chId]); });
      } catch(_) { }
      try {
        var cloudQ = questionsJSON ? JSON.parse(questionsJSON) : [];
        var localQ = []; try { localQ = JSON.parse(g('ofr_q')||'[]'); } catch(e) { }
        var seen = {}, merged = [];
        (cloudQ.concat(localQ)).forEach(function(q){ if (q && !seen[q]) { seen[q]=1; merged.push(q); } });
        s('ofr_q', JSON.stringify(merged));
      } catch(_) { }
      if (typeof window.OF_onSync === 'function') { try { window.OF_onSync(); } catch(_) { } }
    },

    collectNotes: function(){
      var notes = {};
      for (var i=0;i<LS.length;i++){ var k=LS.key(i); if (k && k.indexOf('ofr_note_')===0) notes[k.slice(9)] = LS.getItem(k); }
      return notes;
    },

    _syncT: null,
    sync: function(){
      if (!OF.hasAccount()) return;
      clearTimeout(OF._syncT);
      OF._syncT = setTimeout(function(){
        post({ action:'save', email:OF.email(), token:OF.token(),
               notes: JSON.stringify(OF.collectNotes()), questions: g('ofr_q')||'[]' }).catch(function(){});
      }, 900);
    },
    syncNow: function(){
      if (!OF.hasAccount()) return Promise.resolve({ok:false});
      return post({ action:'save', email:OF.email(), token:OF.token(),
                    notes: JSON.stringify(OF.collectNotes()), questions: g('ofr_q')||'[]' }).catch(function(){ return {ok:false}; });
    },

    logout: function(){ ['ofr_sevak','ofr_token'].forEach(function(k){ try { LS.removeItem(k); } catch(_) { } }); },

    /* Top-right "🙏 Welcome, <name> ▾" menu. opts.into = selector to append into (e.g. '.topbar');
       opts.items = [{act,label}] extra rows (Log out is always added); opts.onItem(act) handles them.
       NOTE: on individual gate sites keep this SIMPLE — do NOT list the other gates here. */
    mountUserMenu: function(opts){
      opts = opts || {};
      if (!OF.isLoggedIn()) return null;
      if (document.getElementById('ofUserMenu')) return document.getElementById('ofUserMenu');
      if (!document.getElementById('ofUMstyle')) {
        var st=document.createElement('style'); st.id='ofUMstyle';
        st.textContent='#ofUserMenu{position:relative;margin-left:auto;font-family:inherit;flex:0 0 auto}'
          +'#ofUMbtn{background:rgba(255,255,255,.18);color:#fff;border:none;font-family:inherit;font-size:13.5px;font-weight:700;padding:6px 12px;border-radius:20px;cursor:pointer;display:flex;align-items:center;gap:6px;max-width:190px}'
          +'#ofUMbtn .nm{max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
          +'#ofUMpop{position:absolute;right:0;top:calc(100% + 7px);background:#fff;border-radius:11px;box-shadow:0 12px 32px rgba(0,0,0,.24);min-width:150px;padding:6px;display:none;z-index:300}'
          +'#ofUserMenu.open #ofUMpop{display:block}'
          +'#ofUMpop a{display:block;padding:10px 13px;font-size:14px;color:#222;text-decoration:none;border-radius:8px;cursor:pointer}'
          +'#ofUMpop a:hover{background:#f1efe7}'
          +'#ofUMpop .hd{padding:8px 13px 4px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.06em}';
        document.head.appendChild(st);
      }
      var name=(OF.name()||'Sevak').replace(/[<>]/g,'');
      var rows=''; (opts.items||[]).forEach(function(it){ rows+='<a data-act="'+it.act+'">'+it.label+'</a>'; });
      var wrap=document.createElement('div'); wrap.id='ofUserMenu';
      wrap.innerHTML='<button id="ofUMbtn" aria-label="Account menu">🙏 <span class="nm">'+name+'</span> ▾</button>'
        +'<div id="ofUMpop"><div class="hd">Welcome, Sevak</div>'+rows+'<a data-act="logout">Log out</a></div>';
      if (opts.into) { var host=document.querySelector(opts.into); (host||document.body).appendChild(wrap); }
      else { wrap.style.cssText='position:fixed;top:10px;right:14px;z-index:300'; document.body.appendChild(wrap); }
      var btn=document.getElementById('ofUMbtn');
      btn.onclick=function(e){ e.stopPropagation(); wrap.classList.toggle('open'); };
      document.addEventListener('click', function(ev){ if(!wrap.contains(ev.target)) wrap.classList.remove('open'); });
      document.getElementById('ofUMpop').addEventListener('click', function(ev){
        var a=ev.target.closest && ev.target.closest('a'); if(!a) return;
        var act=a.getAttribute('data-act'); wrap.classList.remove('open');
        if(act==='logout'){ OF.logout(); location.reload(); return; }
        if(typeof opts.onItem==='function') opts.onItem(act);
      });
      return wrap;
    }
  };

  window.OF = OF;
})();
