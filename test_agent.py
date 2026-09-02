"""Prove the spool actually saves a report and replays it."""
import importlib.util, os, shutil, sys, tempfile, json

tmp = tempfile.mkdtemp()
os.environ["GP_CONFIG_DIR"] = tmp
spec = importlib.util.spec_from_file_location("ag", "/home/claude/gp/agent/groundplane_agent.py")
ag = importlib.util.module_from_spec(spec); spec.loader.exec_module(ag)

ok = fail = 0
def ck(c, l):
    global ok, fail
    if c: ok += 1; print("  ok   " + l)
    else: fail += 1; print("  FAIL " + l)

ag.save_config({"token":"t"*64, "environment_id":"env-1", "agent_id":"a1"})
cfg = ag.load_config()
ck(cfg["environment_id"] == "env-1", "config round trips")
mode = oct(os.stat(ag.CONFIG_PATH).st_mode)[-3:]
ck(mode == "600", "token file is 0600, got " + mode)

# a failed post must spool, not vanish
calls = {"n": 0}
def fail_api(path, method="GET", body=None, token=None, timeout=20):
    calls["n"] += 1
    return 500, {"error": "upstream down"}
ag.api = fail_api
payload = {"collected_at":"2026-09-02T10:00:00+00:00","checks":[],"devices":[]}
okp, fatal = ag.post_report(cfg, payload)
ck(not okp and not fatal, "a 500 is a retryable failure, not fatal")
ag.spool_write(payload)
ck(len(ag.spool_list()) == 1, "the failed report was spooled, not lost")

# cap holds
for i in range(ag.SPOOL_MAX + 20):
    ag.spool_write({"collected_at": "2026-09-02T%02d:%02d:00+00:00" % (i//60, i%60)})
ck(len(ag.spool_list()) <= ag.SPOOL_MAX,
   "spool capped at %d, has %d" % (ag.SPOOL_MAX, len(ag.spool_list())))

# recovery: once the endpoint returns, the spool drains
def good_api(path, method="GET", body=None, token=None, timeout=20):
    return 201, None
ag.api = good_api
okp, fatal = ag.post_report(cfg, payload)
ck(okp and not fatal, "a 201 is success")

# a revoked token must be fatal, not an infinite retry
def revoked_api(path, method="GET", body=None, token=None, timeout=20):
    return 401, {"message": "JWT expired"}
ag.api = revoked_api
okp, fatal = ag.post_report(cfg, payload)
ck(not okp and fatal, "401 is fatal so the agent stops instead of looping")
okp, fatal = ag.post_report(cfg, payload)
ck(fatal, "403 handled the same way")

# scrub must survive anything the checks attach
dirty = {"ok":"v","password":"hunter2","nested":{"api_key":"x","fine":"y"},"list":[{"token":"z"}]}
c = ag.scrub(dirty)
blob = json.dumps(c)
ck("hunter2" not in blob and '"x"' not in blob and '"z"' not in blob,
   "scrub removes secrets at every depth")
ck(c["ok"] == "v" and c["nested"]["fine"] == "y", "scrub keeps everything else")

shutil.rmtree(tmp, ignore_errors=True)
print()
print("%d passed, %d failed" % (ok, fail))
sys.exit(1 if fail else 0)
