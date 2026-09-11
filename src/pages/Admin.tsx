import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Trash2, ArrowLeft, Eye, EyeOff, KeyRound, UserPlus, Edit3, X, Check, User, Crown, Shield, LogOut } from 'lucide-react';
import { SchoolLogo } from '../components/SchoolLogo';
import { Teacher, DayOfWeek, dayNames, periods } from '../lib/timetableUtils';
import { fetchTeachers, resetAndUploadTeachers, verifyAdmin, updateAdminPassword, AdminUser } from '../lib/store';

export const Admin: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [targetAccount, setTargetAccount] = useState<'averver' | 'sangsang'>('averver');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [showAddTeacherModal, setShowAddTeacherModal] = useState(false);
  const [newTeacherName, setNewTeacherName] = useState('');
  const [newTeacherHomeroom, setNewTeacherHomeroom] = useState('');

  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      fetchTeachers().then(setTeachers);
    }
  }, [isAuthenticated]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const user = await verifyAdmin(id, password);
    setLoading(false);
    
    if (user) {
      setCurrentUser(user);
      setIsAuthenticated(true);
      setMessage('');
      if (user.role === 'superadmin') {
        setTargetAccount('averver');
      } else {
        setTargetAccount('sangsang');
      }
    } else {
      setMessage('아이디 또는 비밀번호가 올바르지 않습니다.');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    setId('');
    setPassword('');
    setMessage('');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 4) {
      setMessage('새 비밀번호는 최소 4자리 이상이어야 합니다.');
      return;
    }
    setLoading(true);
    try {
      const accountToUpdate = currentUser?.role === 'superadmin' ? targetAccount : 'sangsang';
      await updateAdminPassword(newPassword, accountToUpdate);
      const label = accountToUpdate === 'averver' ? '슈퍼어드민(averver)' : '일반 관리자(sangsang)';
      setMessage(`${label} 계정의 비밀번호가 성공적으로 변경되었습니다.`);
      setNewPassword('');
    } catch (err) {
      setMessage('비밀번호 변경 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    const isExcel = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv');
    const isPdf = file.type.includes('pdf') || lowerName.endsWith('.pdf');

    if (!isExcel && !isPdf) {
      setMessage('엑셀(.xlsx, .xls, .csv) 또는 PDF 파일만 업로드할 수 있습니다.');
      return;
    }

    try {
      setLoading(true);
      setMessage(
        isExcel 
          ? '엑셀 시간표 데이터를 정밀 분석하고 있습니다...' 
          : 'AI가 PDF 시간표를 분석하고 있습니다. 약 10~20초 정도 걸릴 수 있습니다...'
      );
      
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/parse-timetable', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorMsg = '시간표 분석에 실패했습니다.';
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch {
          errorMsg = `서버 응답 오류 (${response.status})`;
        }
        throw new Error(errorMsg);
      }

      const { teachers: parsedTeachers, format } = await response.json();

      if (!Array.isArray(parsedTeachers) || parsedTeachers.length === 0) {
        throw new Error('분석된 시간표 데이터가 없습니다.');
      }

      const teachersWithIds: Teacher[] = parsedTeachers.map((t: any) => ({
        id: t.name,
        name: t.name,
        homeroom: t.homeroom || '',
        timetable: t.timetable || { Mon: {}, Tue: {}, Wed: {}, Thu: {}, Fri: {} }
      }));

      setMessage(`${teachersWithIds.length}명의 교원 데이터를 데이터베이스에 저장 중입니다...`);
      await resetAndUploadTeachers(teachersWithIds);
      setTeachers(teachersWithIds);
      setMessage(
        `성공적으로 ${teachersWithIds.length}명의 시간표를 업데이트했습니다! (${format === 'excel' ? '엑셀 정밀 파싱 완료' : 'PDF 파싱 완료'})`
      );
      window.alert(`성공적으로 ${teachersWithIds.length}명의 시간표를 업데이트했습니다!`);
      e.target.value = '';
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
      if (msg.includes('resource_exhausted') || msg.includes('quota') || msg.includes('429') || msg.includes('Exceeded')) {
        setMessage('AI 사용량 한도(Quota)를 초과했습니다. 아래의 [새 선생님 추가] 및 [시간표 입력/수정] 기능을 사용하여 직접 수동으로 선생님과 시간표를 등록해 주세요.');
      } else {
        setMessage(`업로드 오류: ${msg}`);
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTeacherName.trim();
    if (!trimmed) return;

    if (teachers.some(t => t.name === trimmed)) {
      setMessage(`이미 등록된 선생님 이름(${trimmed})입니다.`);
      return;
    }

    const newTeacher: Teacher = {
      id: trimmed,
      name: trimmed,
      homeroom: newTeacherHomeroom.trim(),
      timetable: { Mon: {}, Tue: {}, Wed: {}, Thu: {}, Fri: {} }
    };

    const updated = [...teachers, newTeacher].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    setLoading(true);
    try {
      await resetAndUploadTeachers(updated);
      setTeachers(updated);
      setNewTeacherName('');
      setNewTeacherHomeroom('');
      setShowAddTeacherModal(false);
      setMessage(`선생님 "${trimmed}"님이 추가되었습니다.`);
    } catch (err) {
      setMessage('선생님 추가 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTeacherEdit = async () => {
    if (!editingTeacher) return;
    const updated = teachers.map(t => t.name === editingTeacher.name ? editingTeacher : t);
    setLoading(true);
    try {
      await resetAndUploadTeachers(updated);
      setTeachers(updated);
      setEditingTeacher(null);
      setMessage(`선생님 "${editingTeacher.name}"의 시간표가 저장되었습니다.`);
      window.alert('시간표가 성공적으로 저장되었습니다.');
    } catch (err) {
      setMessage('시간표 저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTeacher = async (name: string) => {
    if (!window.confirm(`정말 "${name}" 선생님을 삭제하시겠습니까?`)) return;
    const updated = teachers.filter(t => t.name !== name);
    setLoading(true);
    try {
      await resetAndUploadTeachers(updated);
      setTeachers(updated);
      setMessage(`선생님 "${name}"님이 삭제되었습니다.`);
    } catch (err) {
      setMessage('선생님 삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetClick = () => {
    setShowResetModal(true);
  };

  const executeReset = async () => {
    setShowResetModal(false);
    setLoading(true);
    try {
      await resetAndUploadTeachers([]);
      await fetch('/api/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([])
      }).catch(() => {});

      setTeachers([]);
      setMessage('모든 시간표 데이터가 완전히 삭제 및 초기화되었습니다.');
      window.alert('데이터가 성공적으로 완전히 삭제 및 초기화되었습니다.');
    } catch (err) {
      setMessage('초기화 중 오류가 발생했습니다.');
      window.alert('초기화 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm max-w-sm w-full border border-gray-100">
          <div className="flex justify-center mb-3">
            <SchoolLogo className="w-16 h-16" onClick={() => navigate('/')} />
          </div>
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800">관리자 로그인</h2>
            <p className="text-xs text-gray-500 mt-1">슈퍼어드민 또는 관리자 계정으로 로그인해 주세요.</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">아이디</label>
              <input
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            {message && <p className="text-red-500 text-sm">{message}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white font-medium py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              로그인
            </button>
          </form>
          <button 
            onClick={() => navigate('/')} 
            className="mt-4 text-sm text-gray-500 hover:text-gray-700 w-full text-center flex items-center justify-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> 메인으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  const weekdays: { key: DayOfWeek; label: string }[] = [
    { key: 'Mon', label: '월요일' },
    { key: 'Tue', label: '화요일' },
    { key: 'Wed', label: '수요일' },
    { key: 'Thu', label: '목요일' },
    { key: 'Fri', label: '금요일' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-200 rounded-full transition" title="메인으로">
              <ArrowLeft className="w-6 h-6 text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">시간표 관리자 페이지</h1>
              <p className="text-xs text-gray-500">선생님 시간표 업로드 및 관리 시스템</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentUser?.role === 'superadmin' ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-300 text-amber-900 rounded-full text-xs font-bold shadow-2xs">
                <Crown className="w-4 h-4 text-amber-600" />
                <span>슈퍼어드민 ({currentUser.id})</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-800 rounded-full text-xs font-bold shadow-2xs">
                <Shield className="w-4 h-4 text-blue-600" />
                <span>일반 관리자 ({currentUser?.id})</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1 text-xs text-gray-600 hover:text-red-600 bg-white hover:bg-red-50 border border-gray-200 hover:border-red-200 px-3 py-1.5 rounded-lg transition shadow-2xs"
              title="로그아웃"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>로그아웃</span>
            </button>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-8">
          {message && (
            <div className={`p-4 rounded-lg ${message.includes('오류') || message.includes('잘못된') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              {message}
            </div>
          )}

          {/* Upload Section */}
          <section>
            <h2 className="text-lg font-semibold mb-2 text-gray-800">새 학기 시간표 일괄 업로드 (엑셀 / PDF)</h2>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 mb-4 text-xs text-blue-900 leading-relaxed">
              <strong>💡 엑셀(.xlsx, .xls, .csv) 업로드 강력 권장</strong><br />
              나이스(NEIS) 또는 컴시간에서 내려받은 <strong>엑셀 파일</strong>을 업로드하시면 100% 정확하게 시간표가 일괄 등록됩니다.
            </div>
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <label className={`flex-1 flex flex-col items-center justify-center px-4 py-7 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer transition ${loading ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'hover:border-blue-500 hover:bg-blue-50'}`}>
                <Upload className={`w-9 h-9 ${loading ? 'animate-bounce text-blue-500' : 'text-gray-400'} mb-2`} />
                <span className="text-sm font-semibold text-gray-700 text-center">
                  {loading ? '시간표 정밀 분석 중...' : '엑셀 또는 PDF 파일 선택 / 드래그'}
                </span>
                <span className="text-xs text-gray-500 mt-1">.xlsx, .xls, .csv, .pdf 파일 지원</span>
                <input 
                  type="file" 
                  accept=".xlsx,.xls,.csv,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/pdf" 
                  onChange={handleFileUpload} 
                  className="hidden" 
                  disabled={loading} 
                />
              </label>
            </div>
          </section>

          <hr className="border-gray-100" />

          {/* Individual Teacher Management Section */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">선생님 개별 관리 및 시간표 입력</h2>
                <p className="text-xs text-gray-500">선생님을 직접 추가하거나 등록된 선생님의 시간표를 직접 입력/수정할 수 있습니다.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddTeacherModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition shadow-xs"
              >
                <UserPlus className="w-4 h-4" /> 새 선생님 추가
              </button>
            </div>

            {teachers.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-gray-500 text-sm">
                등록된 선생님이 없습니다. 위에서 파일을 업로드하거나 '새 선생님 추가' 버튼을 눌러주세요.
              </div>
            ) : (
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                    <tr>
                      <th className="py-3 px-4 font-semibold text-gray-700">선생님 성함</th>
                      <th className="py-3 px-4 font-semibold text-gray-700">담임 학급</th>
                      <th className="py-3 px-4 font-semibold text-gray-700 text-right">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {teachers.map((t) => (
                      <tr key={t.name} className="hover:bg-gray-50/80 transition">
                        <td className="py-3 px-4 font-medium text-gray-900 flex items-center gap-2">
                          <div className="w-7 h-7 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center font-bold text-xs">
                            {t.name.charAt(0)}
                          </div>
                          {t.name}
                        </td>
                        <td className="py-3 px-4 text-gray-600">
                          {t.homeroom ? `${t.homeroom}반` : <span className="text-gray-400">담임 없음</span>}
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => setEditingTeacher(JSON.parse(JSON.stringify(t)))}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 hover:bg-blue-50 hover:text-blue-600 text-gray-700 rounded-lg text-xs font-medium transition"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> 시간표 입력/수정
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTeacher(t.name)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-medium transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> 삭제
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <hr className="border-gray-100" />

          {/* Admin Settings Section */}
          <section>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-gray-700" />
                  관리자 계정 및 비밀번호 설정
                </h2>
                <p className="text-xs text-gray-500">
                  {currentUser?.role === 'superadmin' 
                    ? '슈퍼어드민 및 일반 관리자 계정의 비밀번호를 설정할 수 있습니다.' 
                    : '관리자 계정 비밀번호를 변경할 수 있습니다.'}
                </p>
              </div>
            </div>

            {currentUser?.role === 'superadmin' && (
              <div className="mb-4 bg-gray-50 p-3.5 rounded-xl border border-gray-200 max-w-md">
                <label className="block text-xs font-bold text-gray-700 mb-2">비밀번호를 변경할 대상 계정 선택:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetAccount('averver')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 border transition ${
                      targetAccount === 'averver'
                        ? 'bg-amber-50 border-amber-400 text-amber-900 shadow-2xs ring-1 ring-amber-400'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Crown className="w-3.5 h-3.5 text-amber-600" />
                    슈퍼어드민 (averver)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetAccount('sangsang')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 border transition ${
                      targetAccount === 'sangsang'
                        ? 'bg-blue-50 border-blue-400 text-blue-900 shadow-2xs ring-1 ring-blue-400'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5 text-blue-600" />
                    일반 관리자 (sangsang)
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4 max-w-sm">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {currentUser?.role === 'superadmin'
                    ? `[${targetAccount === 'averver' ? '슈퍼어드민(averver)' : '일반 관리자(sangsang)'}] 새 비밀번호`
                    : '새 비밀번호'}
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition pr-10"
                    placeholder="최소 4자리 이상"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                  >
                    {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading || newPassword.length < 4}
                className="flex items-center justify-center gap-2 w-full bg-gray-800 text-white font-medium py-2 rounded-lg hover:bg-gray-900 transition disabled:opacity-50"
              >
                <KeyRound className="w-4 h-4" />
                비밀번호 변경 저장
              </button>
            </form>
          </section>

          <hr className="border-gray-100" />

          {/* Danger Zone */}
          <section>
            <h2 className="text-lg font-semibold mb-4 text-red-600">위험 구역</h2>
            <p className="text-sm text-gray-600 mb-4">
              모든 선생님의 시간표 데이터를 완전히 삭제합니다. 새 학기 시작 시에만 사용하세요.
            </p>
            <button
              onClick={handleResetClick}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 font-medium rounded-lg hover:bg-red-100 transition"
            >
              <Trash2 className="w-4 h-4" />
              데이터 초기화
            </button>
          </section>
        </div>
      </div>

      {/* Add Teacher Modal */}
      {showAddTeacherModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">새 선생님 추가</h3>
              <button onClick={() => setShowAddTeacherModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddTeacher} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">선생님 성함</label>
                <input
                  type="text"
                  value={newTeacherName}
                  onChange={(e) => setNewTeacherName(e.target.value)}
                  placeholder="예: 홍길동"
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">담당 담임 학급 (선택)</label>
                <input
                  type="text"
                  value={newTeacherHomeroom}
                  onChange={(e) => setNewTeacherHomeroom(e.target.value)}
                  placeholder="예: 1-1 또는 101"
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddTeacherModal(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-xl transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-xl transition shadow-xs"
                >
                  추가하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Teacher Timetable Modal */}
      {editingTeacher && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-gray-100 space-y-6 my-8 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-600" />
                  {editingTeacher.name} 선생님 시간표 직접 입력 및 수정
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">요일별, 교시별 수업 학급 또는 강의실을 입력하세요 (예: 1-1, 203)</p>
              </div>
              <button onClick={() => setEditingTeacher(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex items-center gap-4 bg-blue-50/60 p-3 rounded-xl">
              <label className="text-sm font-medium text-gray-700">담임 학급:</label>
              <input
                type="text"
                value={editingTeacher.homeroom || ''}
                onChange={(e) => setEditingTeacher({ ...editingTeacher, homeroom: e.target.value })}
                placeholder="예: 1-1"
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500 w-32"
              />
            </div>

            {/* Timetable Grid Editor */}
            <div className="flex-1 overflow-x-auto overflow-y-auto border border-gray-200 rounded-xl">
              <table className="w-full border-collapse text-center text-xs sm:text-sm">
                <thead>
                  <tr className="bg-gray-100 text-gray-700 border-b border-gray-200">
                    <th className="p-2 border-r border-gray-200 w-16 font-semibold">교시</th>
                    {weekdays.map(d => (
                      <th key={d.key} className="p-2 border-r border-gray-200 last:border-r-0 font-semibold">{d.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {periods.map(p => (
                    <tr key={p.period} className="hover:bg-gray-50/50">
                      <td className="p-2 border-r border-gray-200 font-medium bg-gray-50 text-gray-600">
                        {p.period}교시
                      </td>
                      {weekdays.map(d => {
                        const val = editingTeacher.timetable[d.key]?.[p.period] || '';
                        return (
                          <td key={d.key} className="p-1 border-r border-gray-200 last:border-r-0">
                            <input
                              type="text"
                              value={val}
                              onChange={(e) => {
                                const newval = e.target.value;
                                setEditingTeacher(prev => {
                                  if (!prev) return prev;
                                  const updatedTime = { ...prev.timetable };
                                  if (!updatedTime[d.key]) updatedTime[d.key] = {};
                                  if (newval.trim() === '') {
                                    delete updatedTime[d.key][p.period];
                                  } else {
                                    updatedTime[d.key][p.period] = newval;
                                  }
                                  return { ...prev, timetable: updatedTime };
                                });
                              }}
                              placeholder="-"
                              className="w-full text-center px-2 py-1.5 border border-transparent hover:border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg outline-none transition bg-gray-50/50 focus:bg-white"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t">
              <button
                type="button"
                onClick={() => setEditingTeacher(null)}
                className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveTeacherEdit}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition shadow-xs"
              >
                <Check className="w-4 h-4" /> 저장하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 space-y-4">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-2">
              ⚠️
            </div>
            <h3 className="text-xl font-bold text-center text-gray-900">모든 데이터 초기화</h3>
            <p className="text-sm text-center text-gray-600 leading-relaxed">
              정말 모든 선생님의 시간표 데이터를 초기화하시겠습니까?<br />
              기존 데이터가 완전히 삭제되며 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-xl transition"
              >
                취소
              </button>
              <button
                type="button"
                onClick={executeReset}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 rounded-xl transition shadow-xs"
              >
                확인 (초기화 실행)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
