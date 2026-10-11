export type CreditBatch = {id:string;member_id:string;class_id:string;purchased_points:number;bonus_points:number;remaining:number;reserved:number;created_at:string;expires_at:string;voided_at?:string|null};
export type Classroom = { id: string; name: string; description: string; total: number; default_quota: number; image_cost: number; video_cost: number; expires_at: string; used: number; reserved: number; allocated: number; students: number; active: boolean; deleted_at?: string|null; course_code?: string; self_enrollment?: boolean; max_students?: number };
export type Member = { removed_at?: string|null; id: string; class_id: string; user_id?: string; email: string; name: string; quota: number; used: number; reserved: number };
export type Job = { id: string; class_id: string|null; user_id?: string; kind: 'image' | 'video'; cost: number; status: 'processing' | 'succeeded' | 'failed' | 'review'; created_at: string; };
export type Dashboard = { wallet_accounts?:WalletAccount[];wallet_lots?:WalletLot[]; credit_batches?: CreditBatch[]; archived_classes?: Classroom[]; viewer_id?: string; role: 'student' | 'admin'; classes: Classroom[]; members: Member[]; jobs: Job[]; name: string };

export type WalletAccount={id:string;email:string;name:string;used:number;available:number;reserved:number;created_at:string};
export type WalletLot={id:string;user_id:string;source:'class_gift'|'topup';class_id?:string|null;member_id?:string|null;purchased_points:number;bonus_points:number;total:number;remaining:number;reserved:number;created_at:string;expires_at:string;voided_at?:string|null};
