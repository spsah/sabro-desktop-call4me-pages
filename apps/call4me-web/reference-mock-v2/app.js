(function () {
  var keys = [
    ["1", ""], ["2", "ABC"], ["3", "DEF"],
    ["4", "GHI"], ["5", "JKL"], ["6", "MNO"],
    ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"],
    ["*", ""], ["0", "+"], ["#", ""]
  ];

  var seed = [
    { name: "Rahul Kumar", last4: "4821", when: "Today", today: true },
    { name: "Priya Shah", last4: "1904", when: "Today", today: true },
    { name: "Mohit", last4: "0274", when: "Yesterday", today: false },
    { name: "Office reception", last4: "6102", when: "Mon", today: false }
  ];

  var state = {
    page: "calls",
    mode: "web",
    contacts: seed.slice(),
    digits: "",
    inCall: false,
    muted: false,
    party: null,
    timer: 0,
    tick: null
  };

  var pad = document.getElementById("pad");
  keys.forEach(function (k) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "key";
    b.innerHTML = '<span class="d">' + k[0] + "</span>" +
      (k[1] ? '<span class="s">' + k[1] + "</span>" : "");
    b.addEventListener("click", function () { press(k[0]); });
    pad.appendChild(b);
  });

  function press(ch) {
    if (state.inCall) {
      toast("Tone " + ch + ". Not hang-up.");
      return;
    }
    if (state.digits.length >= 18) return;
    state.digits += ch;
    drawDigits();
  }

  document.getElementById("bksp").addEventListener("click", function () {
    if (state.inCall) return;
    state.digits = state.digits.slice(0, -1);
    drawDigits();
  });

  document.getElementById("openPad").addEventListener("click", function () {
    document.getElementById("padSheet").hidden = false;
  });
  document.getElementById("closePad").addEventListener("click", function () {
    document.getElementById("padSheet").hidden = true;
  });

  document.getElementById("callUnknown").addEventListener("click", function () {
    var last4 = (state.digits.replace(/\D/g, "").slice(-4) || "0000");
    startCall({ name: "Unknown", last4: last4 });
    document.getElementById("padSheet").hidden = true;
  });

  document.getElementById("end").addEventListener("click", hangup);
  document.getElementById("mute").addEventListener("click", function () {
    state.muted = !state.muted;
    this.classList.toggle("on", state.muted);
    this.textContent = state.muted ? "Muted" : "Mute";
  });

  document.querySelectorAll("[data-mode]").forEach(function (btn) {
    btn.addEventListener("click", function () { setMode(btn.getAttribute("data-mode")); });
  });

  document.querySelectorAll("[data-go]").forEach(function (el) {
    el.addEventListener("click", function () { go(el.getAttribute("data-go")); });
  });

  document.getElementById("importFile").addEventListener("change", function () {
    var file = this.files && this.files[0];
    if (!file) return;
    var extra = [
      { name: "Imported A", last4: "3310", when: "Today", today: true },
      { name: "Imported B", last4: "7742", when: "Today", today: true }
    ];
    state.contacts = extra.concat(state.contacts);
    paintLists();
    document.getElementById("importHint").textContent =
      "Added two names from “" + file.name + "”. Numbers stay masked. Not uploaded anywhere.";
    this.value = "";
    toast("Contacts in. Tap a name to call.");
    go("calls");
  });

  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll("[data-mode]").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-mode") === mode);
    });
    document.getElementById("lede").textContent = mode === "phone"
      ? "Phone rings first (your mobile, desk, landline or SIP). Then we connect them on the cloud number."
      : "Calls for you from the list you uploaded. Tap a name — we present your cloud number, not your SIM.";
    if (state.inCall && state.party) tickMeta();
  }

  function startCall(party) {
    if (state.inCall) hangup();
    state.party = party;
    state.inCall = true;
    state.muted = false;
    state.timer = 0;
    state.digits = "";
    drawDigits();
    document.getElementById("inCall").hidden = false;
    document.getElementById("avatar").textContent = initials(party.name);
    document.getElementById("partyName").textContent = party.name;
    document.getElementById("phoneSteps").hidden = state.mode !== "phone";
    document.getElementById("mute").classList.remove("on");
    document.getElementById("mute").textContent = "Mute";
    go("calls");
    tickMeta();
    clearInterval(state.tick);
    state.tick = setInterval(function () {
      state.timer += 1;
      tickMeta();
    }, 1000);
  }

  function tickMeta() {
    var mm = String(Math.floor(state.timer / 60)).padStart(2, "0");
    var ss = String(state.timer % 60).padStart(2, "0");
    var via = state.mode === "phone" ? "Phone · DISA" : "Web · DISA";
    document.getElementById("partyMeta").textContent =
      "•••• " + state.party.last4 + " · " + via + " · " + mm + ":" + ss;
  }

  function hangup() {
    state.inCall = false;
    state.party = null;
    clearInterval(state.tick);
    document.getElementById("inCall").hidden = true;
    toast("Ended. End is hang-up (DISA *). Pad * is only a digit.");
  }

  function initials(name) {
    return name.split(/\s+/).map(function (p) { return p[0]; }).join("").slice(0, 2).toUpperCase();
  }

  function drawDigits() {
    var el = document.getElementById("digits");
    el.textContent = state.digits || " ";
  }

  function row(c) {
    var li = document.createElement("li");
    li.innerHTML = "<div><b></b><span></span></div><button type=\"button\">Call</button>";
    li.querySelector("b").textContent = c.name;
    li.querySelector("span").textContent = "•••• " + c.last4 + (c.when ? " · " + c.when : "");
    li.querySelector("button").addEventListener("click", function () { startCall(c); });
    return li;
  }

  function paintLists() {
    var today = document.getElementById("todayList");
    var all = document.getElementById("allList");
    today.innerHTML = "";
    all.innerHTML = "";
    state.contacts.filter(function (c) { return c.today; }).forEach(function (c) { today.appendChild(row(c)); });
    state.contacts.forEach(function (c) { all.appendChild(row(c)); });
  }

  function go(page) {
    state.page = page;
    if (location.hash !== "#" + page) location.hash = page;
    document.querySelectorAll(".page").forEach(function (p) {
      p.classList.toggle("on", p.id === "page-" + page);
    });
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("on", t.getAttribute("data-go") === page);
    });
    document.querySelector("h1").textContent = page === "contacts" ? "Contacts" : "Today";
  }

  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._h);
    toast._h = setTimeout(function () { t.hidden = true; }, 2400);
  }

  window.addEventListener("hashchange", function () {
    var pg = (location.hash || "#calls").slice(1);
    if (document.getElementById("page-" + pg)) go(pg);
  });

  var first = (location.hash || "#calls").slice(1);
  if (document.getElementById("page-" + first)) go(first);
  paintLists();
  drawDigits();
})();
