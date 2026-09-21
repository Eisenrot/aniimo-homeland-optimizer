from pathlib import Path

p=Path("src/app.js")
s=p.read_text()

def rep(old,new):
    global s
    if s.count(old)!=1:
        raise SystemExit(f"expected one match, got {s.count(old)}: {old[:60]}")
    s=s.replace(old,new,1)

rep(
    "const STORE='aniimoHomelandOptimizerStateV1',HIDEOUT='https://www.hideoutgacha.com';",
    "const STORE='aniimoHomelandOptimizerStateV1',HIDEOUT='https://www.hideoutgacha.com';\nconst MAX_ANIIMO_BY_HOMELAND=[0,5,8,11,14,17,20,22,24,26,28,30,32,34,36,38,40,42,43,44,45];\nconst maxAniimoForLevel=level=>MAX_ANIIMO_BY_HOMELAND[Math.min(20,Math.max(1,Number(level)||1))]||5;"
)

rep(
    "let state=loadState(),currentPlan=null,currentModel=null,recomputeTimer=null;",
    """let state=loadState(),currentPlan=null,currentModel=null,recomputeTimer=null,undoSnapshot=null,undoTimer=null;
function diffCount(a,b){if(a===b)return 0;if(a==null||b==null||typeof a!=='object'||typeof b!=='object')return 1;const keys=new Set([...Object.keys(a),...Object.keys(b)]);let n=0;for(const k of keys){n+=diffCount(a[k],b[k]);if(n>=2)return n;}return n;}
function ensureUndoBar(){if($('#change-undo'))return;document.body.insertAdjacentHTML('beforeend',`<div id="change-undo" class="change-undo"><span><b>Detected a change.</b> Revert?</span><div><button id="undo-change" class="undo-action">REVERT</button><button id="close-undo" class="undo-action muted">CLOSE</button></div></div>`);$('#undo-change').onclick=()=>{if(!undoSnapshot)return;state=normalizeState(undoSnapshot);undoSnapshot=null;saveState();hideUndo();renderAll();history.replaceState(null,'',shareUrl());};$('#close-undo').onclick=hideUndo;}
function hideUndo(){clearTimeout(undoTimer);$('#change-undo')?.classList.remove('show');}
function offerUndo(before){if(diffCount(before,state)<2)return;ensureUndoBar();undoSnapshot=clone(before);$('#change-undo').classList.add('show');clearTimeout(undoTimer);undoTimer=setTimeout(hideUndo,12000);}
function applyAtomicState(next,before=clone(state)){state=normalizeState(next);saveState();renderAll();offerUndo(before);history.replaceState(null,'',shareUrl());}"""
)

rep(
    "  x.teamSlots=Math.max(1,Number(s?.teamSlots??s?.workerSlots??x.teamSlots)||1);x.collectHours=Math.max(0,Number(x.collectHours||0));",
    "  x.homelandLevel=Math.min(20,Math.max(1,Number(x.homelandLevel)||1));const maxSlots=maxAniimoForLevel(x.homelandLevel);x.workerSlots=Math.min(maxSlots,Math.max(1,Number(x.workerSlots)||1));x.teamSlots=Math.min(maxSlots,Math.max(1,Number(s?.teamSlots??s?.workerSlots??x.teamSlots)||1));x.collectHours=Math.max(0,Number(x.collectHours||0));"
)

rep("function applyUrl(input){\n  let u;","function applyUrl(input){\n  const before=clone(state);let u;")
rep("  saveState();renderAll();\n}","  state=normalizeState(state);saveState();renderAll();offerUndo(before);\n}")

rep(
    "function renderGeneral(){\n  $('#general-panel').innerHTML=title('Plan settings')+`",
    "function renderGeneral(){\n  const cap=maxAniimoForLevel(state.homelandLevel);$('#general-panel').innerHTML=title('Plan settings')+`"
)
rep(
    '<div class="field"><label>Homeland level</label><input id="homeland-level" type="number" min="1" max="20" value="${state.homelandLevel}"></div>',
    '<div class="field"><label>Homeland level</label><div class="number-with-max"><input id="homeland-level" type="number" min="1" max="20" value="${state.homelandLevel}"><span>/ 20</span></div></div>'
)
rep(
    '<div class="field"><label>Theoretical plan Aniimo</label><input id="worker-slots" type="number" min="1" max="45" value="${state.workerSlots}"></div>',
    '<div class="field"><label>Theoretical plan Aniimo</label><div class="number-with-max"><input id="worker-slots" type="number" min="1" max="${cap}" value="${state.workerSlots}"><span>/ ${cap}</span></div></div>'
)
rep(
    '<div class="field"><label>Real team Aniimo</label><input id="team-slots" type="number" min="1" max="45" value="${state.teamSlots}"></div>',
    '<div class="field"><label>Real team Aniimo</label><div class="number-with-max"><input id="team-slots" type="number" min="1" max="${cap}" value="${state.teamSlots}"><span>/ ${cap}</span></div></div>'
)
rep(
    "  $('#homeland-level').oninput=e=>update(x=>x.homelandLevel=Math.max(1,Number(e.target.value)||1));$('#worker-slots').oninput=e=>update(x=>x.workerSlots=Math.max(1,Number(e.target.value)||1));$('#team-slots').oninput=e=>update(x=>x.teamSlots=Math.max(1,Number(e.target.value)||1));",
    "  $('#homeland-level').onchange=e=>{state.homelandLevel=Math.min(20,Math.max(1,Number(e.target.value)||1));const m=maxAniimoForLevel(state.homelandLevel);state.workerSlots=Math.min(m,state.workerSlots);state.teamSlots=Math.min(m,state.teamSlots);saveState();renderGeneral();scheduleCompute();};$('#worker-slots').oninput=e=>update(x=>x.workerSlots=Math.min(maxAniimoForLevel(x.homelandLevel),Math.max(1,Number(e.target.value)||1)));$('#team-slots').oninput=e=>update(x=>x.teamSlots=Math.min(maxAniimoForLevel(x.homelandLevel),Math.max(1,Number(e.target.value)||1)));"
)
rep(
    "function renderAll(){renderObjectives();renderGeneral();renderFacilities();renderModules();renderNotes();renderLiving();renderOwnership();computePlan();}",
    "function renderAll(){renderObjectives();renderGeneral();renderFacilities();renderModules();renderNotes();renderLiving();renderOwnership();computePlan();}\nwindow.__aniimoOptimizerBridge={getState:()=>clone(state),normalizeState,applyAtomicState,maxAniimoForLevel,shareUrl,analyzeTeam:()=>analyzeTeam()};"
)
p.write_text(s)

p=Path("styles.css")
s=p.read_text()
if "/* --- capacity + atomic undo --- */" not in s:
    s += """

/* --- capacity + atomic undo --- */
.number-with-max{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;border:1px solid #303741;background:#090b0e}
.number-with-max:focus-within{border-color:#a62a3f}
.number-with-max input{border:0!important;background:transparent!important;min-width:0}
.number-with-max span{padding:0 9px;color:#68727d;font-size:9px;white-space:nowrap}
.change-undo{position:fixed;left:50%;bottom:18px;z-index:95;transform:translate(-50%,18px);opacity:0;pointer-events:none;display:flex;align-items:center;gap:14px;border:1px solid #414a54;background:rgba(13,16,20,.97);box-shadow:0 16px 50px rgba(0,0,0,.5);padding:8px 9px 8px 11px;color:#b9c1c9;font-size:9px;transition:.16s}
.change-undo.show{transform:translate(-50%,0);opacity:1;pointer-events:auto}
.change-undo>div{display:flex;gap:4px}
.undo-action{height:26px;border:1px solid #5a6570;background:#171c22;color:#fff;font-size:8px;font-weight:800;letter-spacing:.08em;padding:0 9px;cursor:pointer}
.undo-action.muted{color:#7d8791;border-color:#303741;background:#101419}
@media(max-width:680px){.change-undo{bottom:10px;width:calc(100% - 20px);justify-content:space-between}}
"""
p.write_text(s)

Path(".github/workflows/capacity-bridge.yml").unlink(missing_ok=True)
Path(".github/scripts/capacity_patch.py").unlink(missing_ok=True)
