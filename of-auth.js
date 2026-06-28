/* One Fast — Sevak account client. Shared by the home page and the reader.
   Email one-time-code login + cloud sync of notes & questions.
   Local-first: notes/questions always live in localStorage; when logged in they
   also sync to the volunteer's account, and are pulled back on login. */
(function(){
  var SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwou749sCStHL5ASKbdY2w_8iFVqLMlwnRzbETVEN_BQJ8OosAA6sUBy0-la73bCyCU4w/exec";
  var LS = window.localStorage;
  function g(k){ try { return LS.getItem(k); } catch(_) { return null; } }
  function s(k,v){ try { LS.setItem(k,v); } catch(_) { } }
  function post(payload){
    return fetch(SCRIPT_URL, {
      method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify(payload)
    }).then(function(r){ return r.json(); });
  }

  var OF = {
    isLoggedIn: function(){ return !!g('ofr_sevak'); },
    hasAccount: function(){ return !!g('ofr_token'); },           // truly logged into a cloud account
    email: function(){ return g('ofr_sevak_email') || ''; },
    token: function(){ return g('ofr_token') || ''; },
    name:  function(){ return g('ofr_sevak_name') || ''; },

    /* Step 1 — ask the server to email a code. name/mobile optional (registration). */
    requestCode: function(email, name, mobile, source){
      return post({ action:'requestCode', email:String(email||'').trim(),
                    name:name||'', mobile:mobile||'', source:source||'onefast' });
    },

    /* Step 2 — verify the code; on success store the session + pull their cloud data. */
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

    /* a plain unlock with no cloud account (offline / "continue anyway" safety net) */
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

    /* push notes+questions to the account (debounced by callers). no-op if not logged into a cloud account */
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

    logout: function(){ ['ofr_sevak','ofr_token'].forEach(function(k){ try { LS.removeItem(k); } catch(_) { } }); }
  };

  window.OF = OF;
})();
