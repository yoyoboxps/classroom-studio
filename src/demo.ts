import type { Dashboard } from './types';
export const demoData: Dashboard = {
 role: 'student', name: '林同學',
 classes: [{ id: 'design-101', name: 'AI 視覺創作入門', description: '從想像開始，練習用 AI 說故事。', total: 3000, default_quota: 90, image_cost: 5, video_cost: 20, expires_at: '2026-12-31', used: 685, reserved: 0, allocated: 2700, students: 30, active: true }],
 members: [{ id:'member-1',class_id:'design-101',email:'student@example.edu',name:'林同學',quota:100,used:35,reserved:0 }, { id:'member-2',class_id:'design-101',email:'chen@example.edu',name:'陳同學',quota:90,used:40,reserved:0 }, { id:'member-3',class_id:'design-101',email:'wang@example.edu',name:'王同學',quota:90,used:10,reserved:0 }],
 jobs: [{ id:'demo-job-1',class_id:'design-101',kind:'image',cost:5,status:'succeeded',created_at:'2026-10-02T08:30:00Z' },{ id:'demo-job-2',class_id:'design-101',kind:'video',cost:20,status:'succeeded',created_at:'2026-10-02T08:10:00Z' }]
};
export function loadDemo(): Dashboard { try { const d = JSON.parse(localStorage.getItem('classroom-studio-v2-demo') || 'null'); if(d?.classes?.length) return {...d,role:'student'}; } catch {} return structuredClone(demoData); }
