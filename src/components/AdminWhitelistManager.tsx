import React, { useState, useEffect } from 'react';
import { 
  Shield, UserCheck, Plus, Trash2, Edit3, X, Check, Mail, 
  Crown, Lock, AlertCircle, Building, Clock, RotateCw 
} from 'lucide-react';
import { WhitelistUser, AdminRole } from '../types/auth';
import { 
  fetchWhitelist, saveWhitelistUser, deleteWhitelistUser, 
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
  const [showAddModal, setShowAddModal] = useState(false);

  // Form states
  const [formEmail, setFormEmail] = useState('');
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState<AdminRole>('admin');
  const [formDept, setFormDept] = useState('');
  const [formError, setFormError] = useState('');

  const loadWhitelist = async () => {
    setLoading(true);
    try {
      const data = await fetchWhitelist();
      setWhitelist(data);
    } catch (err) {
      console.warn('Failed to load whitelist:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWhitelist();
  }, []);

  const handleOpenAdd = () => {
    setFormEmail('');
    setFormName('');
    setFormRole('admin');
    setFormDept('교무기획부');
    setFormError('');
    setShowAddModal(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
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
      await loadWhitelist();
      setShowAddModal(false);
      if (onMessage) onMessage(`Google 계정 [${cleanEmail}]이(가) 화이트리스트에 안전하게 등록되었습니다.`);
    } catch (err: any) {
      setFormError(err?.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (email: string) => {
    if (email.toLowerCase() === DEFAULT_SUPERADMIN_EMAIL.toLowerCase()) {
      window.alert('최고관리자(averver100@gmail.com) 계정은 보안상 삭제할 수 없습니다.');
      return;
    }

    if (!window.confirm(`정말 [${email}] 계정의 관리자 접근 권한을 삭제하시겠습니까?`)) {
      return;
    }

    setLoading(true);
    try {
      await deleteWhitelistUser(email, currentOperatorEmail);
      const updatedList = await fetchWhitelist();
      setWhitelist(updatedList);
      if (onMessage) onMessage(`[${email}] 계정이 화이트리스트에서 안전하게 삭제되었습니다.`);
    } catch (err: any) {
      window.alert(err?.message || '삭제에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-emerald-600" />
            <span>Google 로그인 승인 계정 관리 (화이트리스트)</span>
            <span className="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-bold border border-emerald-200">
              {whitelist.length}개 승인 계정
            </span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            등록된 Google 이메일 계정만 관리자 시스템에 로그인할 수 있으며, 미등록된 계정은 원천적으로 접근이 차단됩니다.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={loadWhitelist}
            disabled={loading}
            className="p-2 hover:bg-gray-100 text-gray-500 rounded-xl transition cursor-pointer"
            title="새로고침"
          >
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>승인 계정 추가</span>
          </button>
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
