import React, { useState, useEffect } from 'react';
import { 
  Shield, UserCheck, Plus, Trash2, Edit3, X, Check, Mail, 
  Crown, Lock, AlertCircle, Building, Clock, RotateCw, Database, Sparkles, CheckCircle2 
} from 'lucide-react';
import { WhitelistUser, AdminRole } from '../types/auth';
import { 
  fetchWhitelist, saveWhitelistUser, deleteWhitelistUser, 
  subscribeWhitelist, migrateLocalWhitelistToFirestore, isSuperAdminUser,
  DEFAULT_SUPERADMIN_EMAIL 
} from '../lib/authWhitelist';

interface AdminWhitelistManagerProps {
  currentOperatorEmail: string;
  onMessage?: (msg: string) => void;
}

export const AdminWhitelistManager: React.FC<AdminWhitelistManagerProps> = ({
  currentOperatorEmail,
  onMessage
}) => {
  const [whitelist, setWhitelist] = useState<WhitelistUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [liveConnected, setLiveConnected] = useState(true);

  // Form states
  const [formEmail, setFormEmail] = useState('');
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState<AdminRole>('admin');
  const [formDept, setFormDept] = useState('');
  const [formError, setFormError] = useState('');

  const isSuperAdmin = isSuperAdminUser(currentOperatorEmail);

  // Real-time two-way sync via Firestore onSnapshot (SuperAdmin only)
  useEffect(() => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    // Initial fetch from Firestore Server (always server data)
    fetchWhitelist(true)
      .then((data) => {
        setWhitelist(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Real-time listener subscription from Firestore
    const unsubscribe = subscribeWhitelist((liveList) => {
      setWhitelist(liveList);
      setLiveConnected(true);
      setLoading(false);
    }, currentOperatorEmail);

    return () => {
      unsubscribe();
    };
  }, [isSuperAdmin, currentOperatorEmail]);

  const handleManualSync = async () => {
    if (!isSuperAdmin) {
      window.alert(`화이트리스트 동기화 권한이 없습니다.\n최고관리자(${DEFAULT_SUPERADMIN_EMAIL}) 계정으로만 실행할 수 있습니다.`);
      return;
    }

    setMigrating(true);
    try {
      const res = await migrateLocalWhitelistToFirestore();
      const updated = await fetchWhitelist(true);
      setWhitelist(updated);
      const msg = res.migratedCount > 0
        ? `PC 로컬의 ${res.migratedCount}개 계정이 Firestore DB로 성공적으로 마이그레이션 및 실시간 양방향 동기화되었습니다!\n(등록 계정: ${res.migratedEmails.join(', ')})`
        : 'Firestore DB 서버와 최신 상태로 실시간 동기화 완료되었습니다.';
      if (onMessage) onMessage(msg);
      else window.alert(msg);
    } catch (err: any) {
      window.alert(`동기화 중 오류 발생: ${err?.message || '네트워크 오류'}`);
    } finally {
      setMigrating(false);
    }
  };

  const handleOpenAdd = () => {
    if (!isSuperAdmin) {
      window.alert(`화이트리스트 계정 추가 권한이 없습니다.\n최고관리자(${DEFAULT_SUPERADMIN_EMAIL}) 계정으로만 등록할 수 있습니다.`);
      return;
    }
    setFormEmail('');
    setFormName('');
    setFormRole('admin');
    setFormDept('교무기획부');
    setFormError('');
    setShowAddModal(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) {
      setFormError(`화이트리스트 수정 권한이 없습니다. 최고관리자(${DEFAULT_SUPERADMIN_EMAIL})만 등록할 수 있습니다.`);
      return;
    }

    const cleanEmail = formEmail.trim().toLowerCase();
    const cleanName = formName.trim();

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setFormError('올바른 Google 이메일 주소를 입력해 주세요.');
      return;
    }

    if (!cleanName) {
      setFormError('사용자(교원) 성명을 입력해 주세요.');
      return;
    }

    setLoading(true);
    try {
      const roleName = formRole === 'superadmin' 
        ? '슈퍼어드민' 
        : formRole === 'admin' 
        ? '일반 관리자' 
        : '교직원';

      const newUser: WhitelistUser = {
        email: cleanEmail,
        name: cleanName,
        role: formRole,
        roleName,
        department: formDept.trim() || '교무부',
        createdAt: new Date().toISOString()
      };

      await saveWhitelistUser(newUser, currentOperatorEmail);
      setShowAddModal(false);
      if (onMessage) onMessage(`Google 계정 [${cleanEmail}]이(가) Firestore DB에 실시간 저장되었습니다.`);
    } catch (err: any) {
      setFormError(err?.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (email: string) => {
    if (!isSuperAdmin) {
      window.alert(`화이트리스트 삭제 권한이 없습니다.\n최고관리자(${DEFAULT_SUPERADMIN_EMAIL}) 계정으로만 삭제할 수 있습니다.`);
      return;
    }

    if (email.toLowerCase() === DEFAULT_SUPERADMIN_EMAIL.toLowerCase()) {
      window.alert('최고관리자(averver100@gmail.com) 계정은 보안상 삭제할 수 없습니다.');
      return;
    }

    if (!window.confirm(`정말 [${email}] 계정의 관리자 접근 권한을 삭제하시겠습니까?\nFirestore DB에서 즉시 영구 삭제되며 모든 기기에서 접근이 차단됩니다.`)) {
      return;
    }

    setLoading(true);
    try {
      await deleteWhitelistUser(email, currentOperatorEmail);
      if (onMessage) onMessage(`[${email}] 계정이 Firestore DB에서 영구 삭제되었습니다.`);
    } catch (err: any) {
      window.alert(err?.message || '삭제에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center space-y-4 max-w-lg mx-auto my-8">
        <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto border border-red-100 shadow-2xs">
          <Lock className="w-7 h-7" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-base font-bold text-gray-900">화이트리스트 접근 권한 제한</h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            화이트리스트(Google 승인 계정 목록)의 실시간 조회 및 수정은 보안 정책상 최고관리자(<strong>{DEFAULT_SUPERADMIN_EMAIL}</strong>) 계정으로 로그인한 상태에서만 허용됩니다.
          </p>
        </div>
        <div className="p-3 bg-gray-50 rounded-xl text-xs text-gray-600 font-medium">
          현재 접속 계정: <span className="font-bold text-gray-800">{currentOperatorEmail || '미인증 사용자'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-emerald-600" />
              <span>Google 로그인 승인 계정 관리 (화이트리스트)</span>
            </h2>
            <span className="text-xs px-2.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-bold border border-emerald-200">
              {whitelist.length}개 승인 계정
            </span>
            {liveConnected && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Firestore 실시간 양방향 동기화
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            등록된 Google 이메일 계정만 관리자 시스템에 로그인할 수 있으며, PC와 모바일(PWA) 전 기기 간 Firestore DB로 실시간 동기화됩니다.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {/* Manual DB Migration / Sync Button */}
          <button
            type="button"
            onClick={handleManualSync}
            disabled={migrating || loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition cursor-pointer active:scale-95 disabled:opacity-50"
            title="PC 로컬스토리지 데이터를 Firestore DB로 마이그레이션하고 최신 서버 상태로 새로고침합니다"
          >
            <Database className={`w-3.5 h-3.5 ${migrating ? 'animate-spin' : ''}`} />
            <span>{migrating ? 'DB 동기화 중...' : 'PC 데이터 DB 동기화'}</span>
          </button>

          <button
            type="button"
            onClick={() => fetchWhitelist(true).then(setWhitelist)}
            disabled={loading}
            className="p-2 hover:bg-gray-100 text-gray-500 rounded-xl transition cursor-pointer"
            title="서버 데이터 강제 새로고침"
          >
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {isSuperAdmin && (
            <button
              type="button"
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>승인 계정 추가</span>
            </button>
          )}
        </div>
      </div>

      {/* Whitelist Table */}
      <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead className="bg-gray-50 text-gray-700 border-b border-gray-200">
              <tr>
                <th className="py-2.5 px-3 font-bold">Google 계정 이메일</th>
                <th className="py-2.5 px-3 font-bold">성명</th>
                <th className="py-2.5 px-3 font-bold">소속 부서</th>
                <th className="py-2.5 px-3 font-bold">권한 등급</th>
                <th className="py-2.5 px-3 font-bold">최근 로그인</th>
                <th className="py-2.5 px-3 font-bold text-right w-20">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {whitelist.map((u) => {
                const isSuper = u.role === 'superadmin' || u.email.toLowerCase() === DEFAULT_SUPERADMIN_EMAIL.toLowerCase();
                return (
                  <tr key={u.email} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-3 font-mono font-bold text-gray-900 flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        isSuper ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {isSuper ? <Crown className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                      </div>
                      <span className="truncate">{u.email}</span>
                      {isSuper && (
                        <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-1.5 py-0.2 rounded border border-amber-300">
                          최고관리자
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-medium text-gray-800">
                      {u.name}
                    </td>
                    <td className="py-3 px-3 text-gray-600">
                      <span className="inline-flex items-center gap-1">
                        <Building className="w-3 h-3 text-gray-400" />
                        {u.department || '미지정'}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {isSuper ? (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                          슈퍼어드민
                        </span>
                      ) : u.role === 'admin' ? (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                          일반 관리자
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-gray-100 text-gray-700 border border-gray-200">
                          교직원
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-gray-500 text-xs font-mono">
                      {u.lastLoginAt ? (
                        new Date(u.lastLoginAt).toLocaleString('ko-KR', {
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      ) : (
                        <span className="text-gray-300">기록 없음</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {!isSuper && (
                        <button
                          type="button"
                          onClick={() => handleDelete(u.email)}
                          disabled={loading}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                          title="계정 권한 삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Whitelist Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-emerald-600" />
                  <span>새 Google 승인 계정 추가</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  로그인을 허용할 교직원의 Google 이메일 주소를 등록합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveUser} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Google 이메일 주소 <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="예: teacher@sangil.hs.kr 또는 name@gmail.com"
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  교원 성명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="예: 홍길동 교사"
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">권한 등급</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as AdminRole)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="admin">일반 관리자</option>
                    <option value="teacher">교직원</option>
                    <option value="superadmin">슈퍼어드민</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">소속 부서</label>
                  <input
                    type="text"
                    value={formDept}
                    onChange={(e) => setFormDept(e.target.value)}
                    placeholder="예: 교무기획부"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>승인 계정 등록</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
