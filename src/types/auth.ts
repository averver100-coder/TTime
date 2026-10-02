export type AdminRole = 'superadmin' | 'admin' | 'teacher';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  roleName: string;
  department?: string;
  loginMethod: 'google' | 'whitelist';
}

export interface WhitelistUser {
  email: string;
  name: string;
  role: AdminRole;
  roleName: string;
  department?: string;
  createdAt: string;
  lastLoginAt?: string;
}

export interface AuditLog {
  id: string;
  operatorId: string;       // 수정한 사람의 고유 ID / 이메일 (예: averver100@gmail.com)
  operatorName?: string;     // 수정한 사람 이름
  timestamp: string;        // 수정일시 (ISO 8601 문자열)
  action: string;           // 수행한 작업 (예: 시간표 수정, 엑셀 업로드, 교원 추가 등)
  target?: string;          // 작업 대상 (예: 김가영 선생님, 1학년 1반)
  summary: string;          // 변경된 내용 요약
  category: 'schedule' | 'teacher' | 'class' | 'duty' | 'whitelist' | 'auth' | 'system';
}
