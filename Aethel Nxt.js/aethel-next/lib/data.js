/* Seeded from the issued Noira report for The Wilbers Law Firm, so the
   shape matches a real engagement rather than invented filler. */
export const CLIENT = {
  name: 'The Wilbers Law Firm', contact: 'ops@wilberslaw.example',
  tier: 'Standard', period: 'Last 30 days',
  from: 'Jul 26, 2026', to: 'Aug 25, 2026',
};

export const METRICS = {
  devices: 8, availability: 100, alerts: 2, traffic: 6.0,
  frames: '7.0K', open: 2, resolved: 0,
};

export const STATES = [
  { key:'environment',    label:'Environment',    word:'Healthy',     value:98.7, suffix:'%',
    sub:'12 of 12 services reachable', tone:'healthy',
    trend:[92,94,93,96,95,97,96,98,97,99,98,98.7],
    chain:{ observation:'All 12 monitored services responded within their expected window over the last 30 days.',
      evidence:'Reachability probes from 3 collectors, 8,640 samples, 112 minutes total unreachable',
      assessment:'Availability is within the agreed service objective of 98 percent.',
      recommendation:'No action required. Continue the current monitoring interval.' } },
  { key:'security',       label:'Security',       word:'Protected',   value:94.2, suffix:'%',
    sub:'Based on CIS Controls and NIST CSF', tone:'healthy',
    trend:[88,89,88,90,91,90,92,93,92,94,94,94.2],
    chain:{ observation:'34 of 36 measured controls are satisfied. Coverage is 92 percent.',
      evidence:'CIS Controls v8 IG1, 3 unmeasured controls excluded from the score',
      assessment:'Posture is strong. Administrative MFA coverage and one endpoint outside the patch policy remain outstanding.',
      recommendation:'Enable MFA on the three remaining administrative identities.' } },
  { key:'infrastructure', label:'Infrastructure', word:'Operational', value:99.9, suffix:'%',
    sub:'4 sites, 8 assets', tone:'healthy',
    trend:[99.5,99.6,99.9,99.8,99.9,99.7,99.9,99.9,99.8,99.9,99.9,99.9],
    chain:{ observation:'No infrastructure component reported degraded state in the period.',
      evidence:'8 assets across 4 sites, last inventory reconciliation 6 hours ago',
      assessment:'Infrastructure condition is nominal.',
      recommendation:'No action required.' } },
  { key:'attention',      label:'Attention',      word:'4 Items',     value:4, suffix:'',
    sub:'Require review', tone:'attention', trend:null,
    chain:{ observation:'Four findings are open and unresolved.',
      evidence:'1 high, 1 medium, 2 low, oldest opened 11 days ago',
      assessment:'None are critical. One is approaching its remediation due date.',
      recommendation:'Review the Microsoft 365 MFA coverage finding first.' } },
];

export const TRAFFIC_30D = Array.from({length:30},(_,i)=>({
  d:`Aug ${i+1}`,
  mb:+(3.2+Math.sin(i/3.1)*1.1+Math.sin(i/1.7)*0.6+(i>22?1.3:0)).toFixed(2),
}));

export const SEVERITY = [
  { name:'Critical', value:0, fill:'#E56A5A' },
  { name:'High',     value:1, fill:'#E56A5A' },
  { name:'Medium',   value:1, fill:'#E0A33E' },
  { name:'Low',      value:2, fill:'#8A8A8F' },
];

export const SITES = [
  { id:'hq',     label:'HQ',          state:'Online', pos:[-2.1, 0.55, 0.4] },
  { id:'branch', label:'Branch',      state:'Online', pos:[-1.5,-1.15,-0.5] },
  { id:'cloud',  label:'Cloud',       state:'Online', pos:[ 2.2, 0.95,-0.3] },
  { id:'dc',     label:'Data Center', state:'Online', pos:[ 2.0,-0.85, 0.5] },
];

export const ASSETS = [
  { id:'a1', name:'Edge firewall',       ident:'FW-HQ-01',   ip:'10.7.20.1',  site:'HQ',          status:'up', eos:'2029-06-30' },
  { id:'a2', name:'Core switch',         ident:'SW-HQ-CORE', ip:'10.7.20.10', site:'HQ',          status:'up', eos:'2028-11-30' },
  { id:'a3', name:'Access switch',       ident:'SW-BR-01',   ip:'10.7.20.11', site:'Branch',      status:'up', eos:'2027-03-31' },
  { id:'a4', name:'Wireless controller', ident:'WLC-HQ',     ip:'10.7.20.12', site:'HQ',          status:'up', eos:'2027-09-30' },
  { id:'a5', name:'Hypervisor',          ident:'ESX-DC-02',  ip:'10.7.20.13', site:'Data Center', status:'up', eos:'2030-01-31' },
  { id:'a6', name:'File server',         ident:'FS-DC-01',   ip:'10.7.20.14', site:'Data Center', status:'up', eos:'2029-02-28' },
  { id:'a7', name:'Workstation',         ident:'WS-REC-01',  ip:'10.7.20.15', site:'HQ',          status:'up', eos:'2028-05-31' },
  { id:'a8', name:'Network printer',     ident:'PR-HQ-01',   ip:'10.7.20.16', site:'HQ',          status:'up', eos:'2027-07-31' },
];

export const FINDINGS = [
  { id:'f1', title:'ARP binding changed for 10.7.20.1',     severity:'High',   domain:'Network',        asset:'FW-HQ-01',  opened:'2026-08-25', status:'Open', seen:2 },
  { id:'f2', title:'New device on the network: 10.7.20.15', severity:'Low',    domain:'Network',        asset:'WS-REC-01', opened:'2026-08-25', status:'Open', seen:1 },
  { id:'f3', title:'Microsoft 365 MFA coverage',            severity:'Medium', domain:'Identity',       asset:'Tenant',    opened:'2026-08-20', status:'Open', seen:1 },
  { id:'f4', title:'Switch firmware behind current',        severity:'Low',    domain:'Infrastructure', asset:'SW-BR-01',  opened:'2026-08-29', status:'Open', seen:1 },
];

export const CHANGES = [
  { id:'c1', what:'Firewall firmware updated',     where:'HQ',          when:'2h ago' },
  { id:'c2', what:'Backup verification completed', where:'Data Center', when:'4h ago' },
  { id:'c3', what:'New endpoint enrolled',         where:'Branch',      when:'6h ago' },
  { id:'c4', what:'DMARC policy strengthened',     where:'Tenant',      when:'4d ago' },
];

export const MONITORS = [
  { id:'m1', name:'wilbers-desk', location:'WILBERS', kind:'Agent', checkins:1, last:'1 min ago' },
];
