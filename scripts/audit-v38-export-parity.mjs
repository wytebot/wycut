import fs from 'node:fs';
const checks = [
 ['versioned shared EditPlan', 'lib/editor/edit-plan.ts', /EDIT_PLAN_VERSION\s*=\s*1/],
 ['legacy plan migration/normalization', 'lib/editor/edit-plan.ts', /normalizeEditPlan/],
 ['actual FFmpeg export pipeline', 'lib/ffmpeg/edit-export.ts', /ff\.exec\(args\)/],
 ['export filter chain', 'lib/ffmpeg/edit-export.ts', /videoFilterForPlan/],
 ['export overlay composition', 'lib/ffmpeg/edit-export.ts', /overlay=/],
 ['export temp-file cleanup', 'lib/ffmpeg/edit-export.ts', /finally\s*\{/],
 ['editor export wired to renderer', 'components/dashboard-workspace.tsx', /renderEditPlan\(renderSource/],
 ['Drive manifest stores versioned plan', 'components/dashboard-workspace.tsx', /editPlan:\s*normalizeEditPlan/],
 ['pricing declares server-billed premium asset policy', 'config/credit-pricing.json', /"billing": "unlock_on_apply"/],
 ['server-side premium billing policy', 'config/credit-pricing.json', /charged server-side only after render succeeds/],
 ['2K export separately priced', 'config/credit-pricing.json', /"premiumExportCostCredits": 5/],
];
let fail=0; for (const [label,file,pattern] of checks) { const ok=fs.existsSync(file)&&pattern.test(fs.readFileSync(file,'utf8')); console.log(`${ok?'PASS':'FAIL'} ${label}`); if(!ok) fail++; }
process.exitCode=fail?1:0;
