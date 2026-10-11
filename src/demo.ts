import type { Dashboard } from './types';
export const demoData: Dashboard = {
 role: 'student', name: '林同學',
 classes: [{ id: 'design-101', name: 'AI 視覺創作入門', description: '從想像開始，練習用 AI 說故事。', total: 3000, default_quota: 90, image_cost: 5, video_cost: 20, expires_at: '2026-12-31', used: 685, reserved: 0, allocated: 2700, students: 30, active: true }],
 members: [{ id:'member-1',class_id:'design-101',email:'student@example.edu',name:'林同學',quota:100,used:35,reserved:0 }, { id:'member-2',class_id:'design-101',email:'chen@example.edu',name:'陳同學',quota:90,used:40,reserved:0 }, { id:'member-3',class_id:'design-101',email:'wang@example.edu',name:'王同學',quota:90,used:10,reserved:0 }],
 jobs: [{ id:'demo-job-1',class_id:'design-101',kind:'image',cost:5,status:'succeeded',created_at:'2026-10-02T08:30:00Z' },{ id:'demo-job-2',class_id:'design-101',kind:'video',cost:20,status:'succeeded',created_at:'2026-10-02T08:10:00Z' }]
};
function withWallets(d:Dashboard):Dashboard {
 if(d.wallet_accounts&&d.wallet_lots)return d;
 const now=new Date().toISOString(),expires=new Date(Date.now()+180*86400000).toISOString();
 const members=d.members.map((m,i)=>({...m,user_id:`demo-user-${i+1}`}));
 return {...d,members,wallet_accounts:[...members.map(m=>({id:m.user_id,email:m.email,name:m.name,used:m.used,available:m.quota-m.used-m.reserved,reserved:m.reserved,created_at:now})),{id:'demo-independent',email:'solo@example.edu',name:'個人學生',used:0,available:0,reserved:0,created_at:now}],wallet_lots:members.filter(m=>!m.removed_at&&m.quota>m.used).map(m=>({id:`gift-${m.id}`,user_id:m.user_id,source:'class_gift' as const,class_id:m.class_id,member_id:m.id,purchased_points:0,bonus_points:0,total:m.quota-m.used,remaining:m.quota-m.used,reserved:m.reserved,created_at:now,expires_at:expires}))};
}
export function freshDemo(){return withWallets(structuredClone(demoData));}
export function loadDemo(): Dashboard { try { const d = JSON.parse(localStorage.getItem('classroom-studio-v2-demo') || 'null'); if(d?.classes?.length) return withWallets({...d,role:'student'}); } catch {} return freshDemo(); }

export function reconcileDemo(d:Dashboard):Dashboard {
 const lots=structuredClone(d.wallet_lots||[]),now=new Date().toISOString(),expires=new Date(Date.now()+180*86400000).toISOString();
 for(const m of d.members){
  if(!m.user_id)continue;
  const own=lots.filter(l=>l.member_id===m.id&&l.source==='class_gift'&&!l.voided_at);
  if(m.removed_at){for(const l of own){l.remaining=0;l.voided_at=now;}continue;}
  let delta=m.quota-m.used-m.reserved-own.reduce((n,l)=>n+l.remaining-l.reserved,0);
  if(delta>0)lots.push({id:crypto.randomUUID(),user_id:m.user_id,source:'class_gift',class_id:m.class_id,member_id:m.id,purchased_points:0,bonus_points:0,total:delta,remaining:delta,reserved:0,created_at:now,expires_at:expires});
  else for(const l of own.sort((a,b)=>b.expires_at.localeCompare(a.expires_at))){const take=Math.min(-delta,l.remaining-l.reserved);l.remaining-=take;delta+=take;if(delta===0)break;}
 }
 return {...d,wallet_lots:lots,wallet_accounts:d.wallet_accounts?.map(a=>({...a,available:lots.filter(l=>l.user_id===a.id&&!l.voided_at&&new Date(l.expires_at).getTime()>Date.now()).reduce((n,l)=>n+l.remaining-l.reserved,0),reserved:lots.filter(l=>l.user_id===a.id).reduce((n,l)=>n+l.reserved,0)}))};
}
