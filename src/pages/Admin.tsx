import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Upload, Trash2, ArrowLeft, Eye, EyeOff, KeyRound, UserPlus, Edit3, X, Check, 
  User, Crown, Shield, LogOut, Search, Download, RotateCcw, ShieldCheck, History, 
  FileDown, FileSpreadsheet, GraduationCap, CalendarDays, Users, Save, CheckCircle
} from 'lucide-react';
import { SchoolLogo } from '../components/SchoolLogo';
import { AdminGateDutyManager } from '../components/AdminGateDutyManager';
import { AdminLunchDutyManager } from '../components/AdminLunchDutyManager';
import { Footer } from '../components/Footer';
import { Teacher, ClassTimetable, DayOfWeek, dayNames, periods, KOREAN_CONSONANTS, getChosung, matchKorean, formatClassTitle, matchClassCode, getClassMatchScore } from '../lib/timetableUtils';
import { 
  fetchTeachers, saveSingleTeacher, deleteSingleTeacher, resetAndUploadTeachers, 
  verifyAdmin, updateAdminPassword, AdminUser, fetchBackups, createManualBackup, 
  restoreBackup, BackupItem, fetchClassTimetables, saveClassTimetable, 
  resetAndUploadClassTimetables, getDefaultClassTimetables 
} from '../lib/store';
import { exportTimetableToExcel, exportClassTimetablesToExcel } from '../lib/excelExport';
import { parseClassTimetableExcel } from '../lib/excelClassParser';

const getTeacherTotalPeriods = (teacher: Teacher): number => {
  let count = 0;
  if (!teacher.timetable) return 0;
  Object.values(teacher.timetable).forEach(dayObj => {
    if (dayObj) {
      Object.values(dayObj).forEach(val => {
        if (val && String(val).trim() !== '') count++;
      });
    }
  });
  return count;
};

export const Admin: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Navigation tab
  const [adminTab, setAdminTab] = useState<'teachers' | 'classes' | 'duties' | 'settings'>('classes');

  const [targetAccount, setTargetAccount] = useState<'averver' | 'sangsang'>('averver');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  
  // Teacher data state
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [showAddTeacherModal, setShowAddTeacherModal] = useState(false);
  const [newTeacherName, setNewTeacherName] = useState('');
  const [newTeacherHomeroom, setNewTeacherHomeroom] = useState('');
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [teacherSearchTerm, setTeacherSearchTerm] = useState('');

  // Class timetable data state
  const [classes, setClasses] = useState<ClassTimetable[]>(() => getDefaultClassTimetables());
  const [classGradeFilter, setClassGradeFilter] = useState<'all' | 1 | 2 | 3>('all');
  const [selectedClassCode, setSelectedClassCode] = useState<string>('101');
  const [editingClass, setEditingClass] = useState<ClassTimetable | null>(null);
  const [classSearchTerm, setClassSearchTerm] = useState('');

  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      fetchTeachers().then(setTeachers);
      fetchClassTimetables().then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setClasses(data);
        }
      });
    }
  }, [isAuthenticated]);

  const filteredTeachers = useMemo(() => {
    const trimmed = teacherSearchTerm.trim().toLowerCase();
    const sorted = [...teachers].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    if (!trimmed) {
      return sorted;
    }

    const isChosungQuery = /^[ㄱ-ㅎ]+$/.test(trimmed);

    return sorted.filter(t => {
      const nameLower = t.name.toLowerCase();
      const homeroomLower = (t.homeroom || '').toLowerCase();

      if (isChosungQuery) {
        const nameChosung = getChosung(t.name);
        return nameChosung.includes(trimmed);
      }

      return (
        nameLower.includes(trimmed) ||
        homeroomLower.includes(trimmed) ||
        `${homeroomLower}반`.includes(trimmed)
      );
    }).sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      if (aName === trimmed) return -1;
      if (bName === trimmed) return 1;
      if (aName.startsWith(trimmed) && !bName.startsWith(trimmed)) return -1;
      if (bName.startsWith(trimmed) && !aName.startsWith(trimmed)) return 1;
      return a.name.localeCompare(b.name, 'ko');
    });
  }, [teachers, teacherSearchTerm]);

  // Sorted and filtered classes
  const filteredClasses = useMemo(() => {
    const sorted = [...classes].sort((a, b) => a.classCode.localeCompare(b.classCode, 'ko', { numeric: true }));
    let list = sorted;
    if (classGradeFilter !== 'all') {
      list = list.filter(c => c.grade === classGradeFilter);
    }
    const trimmed = classSearchTerm.trim().toLowerCase();
    if (trimmed) {
      list = list
        .filter(c => 
          matchClassCode(c, trimmed) ||
          c.classCode.includes(trimmed) || 
          `${c.grade}-${c.classNum}`.includes(trimmed) || 
          `${c.grade}학년`.includes(trimmed) ||
          `${c.classNum}반`.includes(trimmed)
        )
        .sort((a, b) => {
          const scoreA = getClassMatchScore(a, trimmed);
          const scoreB = getClassMatchScore(b, trimmed);
          if (scoreA !== scoreB) return scoreA - scoreB;
          return a.classCode.localeCompare(b.classCode, 'ko', { numeric: true });
        });
    }
    return list;
  }, [classes, classGradeFilter, classSearchTerm]);

  const currentSelectedClass = useMemo(() => {
    return classes.find(c => c.classCode === selectedClassCode) || classes[0] || null;
  }, [classes, selectedClassCode]);

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

    setLoading(true);
    try {
      // Surgical add: only adds newTeacher, never deletes any existing teachers
      await saveSingleTeacher(newTeacher);
      setTeachers(prev => [...prev, newTeacher].sort((a, b) => a.name.localeCompare(b.name, 'ko')));
      setNewTeacherName('');
      setNewTeacherHomeroom('');
      setShowAddTeacherModal(false);
      setMessage(`선생님 "${trimmed}"님이 안전하게 추가되었습니다.`);
    } catch (err) {
      setMessage('선생님 추가 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTeacherEdit = async () => {
    if (!editingTeacher) return;
    setLoading(true);
    try {
      // Surgical save: updates ONLY editingTeacher, strictly protecting all other teachers
      await saveSingleTeacher(editingTeacher);
      setTeachers(prev => prev.map(t => t.name === editingTeacher.name ? editingTeacher : t));
      setEditingTeacher(null);
      setMessage(`선생님 "${editingTeacher.name}"의 시간표가 안전하게 저장되었습니다.`);
      window.alert(`선생님 "${editingTeacher.name}"의 시간표가 안전하게 저장되었습니다.`);
    } catch (err) {
      setMessage('시간표 저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTeacher = async (name: string) => {
    if (!window.confirm(`정말 "${name}" 선생님을 삭제하시겠습니까?`)) return;
    setLoading(true);
    try {
      // Surgical delete: deletes ONLY this teacher
      await deleteSingleTeacher(name);
      setTeachers(prev => prev.filter(t => t.name !== name));
      setMessage(`선생님 "${name}"님이 삭제되었습니다.`);
    } catch (err) {
      setMessage('선생님 삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadExcel = () => {
    if (teachers.length === 0) {
      window.alert('다운로드할 선생님 시간표 데이터가 없습니다.');
      return;
    }
    try {
      exportTimetableToExcel(teachers, '상일미디어고등학교 수업시간표.xlsx');
      setMessage(`총 ${teachers.length}명의 시간표가 "상일미디어고등학교 수업시간표.xlsx" 파일로 다운로드되었습니다.`);
    } catch (err) {
      console.error('Excel download failed:', err);
      setMessage('엑셀 다운로드 중 오류가 발생했습니다.');
      window.alert('엑셀 파일 생성 중 오류가 발생했습니다.');
    }
  };

  const handleDownloadJsonBackup = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(teachers, null, 2));
    const downloadAnchor = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `상일미디어고등학교_시간표_${teachers.length}명_${dateStr}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleCreateManualBackup = async () => {
    setLoading(true);
    try {
      await createManualBackup();
      setMessage(`현재 ${teachers.length}명의 시간표가 안전하게 스냅샷 백업되었습니다.`);
      window.alert(`현재 ${teachers.length}명의 시간표가 안전하게 백업되었습니다!`);
    } catch (err) {
      setMessage('수동 백업 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenBackupModal = async () => {
    setShowBackupModal(true);
    setLoadingBackups(true);
    try {
      const list = await fetchBackups();
      setBackups(list);
    } catch (err) {
      console.warn('Failed to load backups:', err);
    } finally {
      setLoadingBackups(false);
    }
  };

  const handleRestoreBackupClick = async (filename: string, count: number) => {
    if (!window.confirm(`선택한 백업 파일(${count}명)로 시간표를 복원하시겠습니까?`)) return;
    setLoading(true);
    try {
      const restored = await restoreBackup(filename);
      setTeachers(restored);
      setShowBackupModal(false);
      setMessage(`성공적으로 ${restored.length}명의 시간표 데이터로 복원되었습니다.`);
      window.alert(`성공적으로 ${restored.length}명의 시간표 데이터가 복원되었습니다!`);
    } catch (err) {
      setMessage('백업 복원 중 오류가 발생했습니다.');
      window.alert('백업 복원에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // Class timetable Excel upload handler
  const handleClassExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setMessage('학년반별 엑셀 시간표 분석 및 등록 중...');

    try {
      const buffer = await file.arrayBuffer();
      const parsedClasses = parseClassTimetableExcel(buffer);
      if (parsedClasses.length === 0) {
        throw new Error('엑셀 파일에서 학년반 시간표 데이터를 찾을 수 없습니다.');
      }

      await resetAndUploadClassTimetables(parsedClasses);
      setClasses(parsedClasses);
      setMessage(`성공: 총 ${parsedClasses.length}개 학급(1~3학년)의 수업시간표가 엑셀에서 등록 및 안전하게 저장되었습니다!`);
      window.alert(`총 ${parsedClasses.length}개 학급의 수업시간표가 성공적으로 업로드되었습니다!`);
      if (parsedClasses.length > 0) {
        setSelectedClassCode(parsedClasses[0].classCode);
      }
    } catch (err: any) {
      console.error('Class timetable upload error:', err);
      setMessage(`엑셀 분석 실패: ${err?.message || '지원되지 않는 형식이거나 오류가 발생했습니다.'}`);
      window.alert(`업로드 실패: ${err?.message || '엑셀 분석 중 오류가 발생했습니다.'}`);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  // Class timetable Excel export handler
  const handleDownloadClassExcel = () => {
    if (classes.length === 0) {
      window.alert('다운로드할 학급별 시간표 데이터가 없습니다.');
      return;
    }
    try {
      exportClassTimetablesToExcel(classes, '상일미디어고등학교_학급별_수업시간표.xlsx');
      setMessage(`총 ${classes.length}개 학급의 수업시간표가 "상일미디어고등학교_학급별_수업시간표.xlsx" 파일로 다운로드되었습니다.`);
    } catch (err) {
      console.error('Class Excel download failed:', err);
      setMessage('학급 시간표 엑셀 다운로드 중 오류가 발생했습니다.');
      window.alert('엑셀 파일 생성 중 오류가 발생했습니다.');
    }
  };

  // Class timetable JSON backup
  const handleDownloadClassJsonBackup = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(classes, null, 2));
    const downloadAnchor = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `상일미디어고등학교_학급시간표_${classes.length}개반_${dateStr}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Save single class timetable edit
  const handleSaveClassTimetable = async (classItem: ClassTimetable) => {
    setLoading(true);
    try {
      await saveClassTimetable(classItem);
      setClasses(prev => prev.map(c => c.classCode === classItem.classCode ? classItem : c));
      setEditingClass(null);
      setMessage(`${formatClassTitle(classItem.classCode)}의 시간표가 안전하게 저장되었습니다.`);
      window.alert(`${formatClassTitle(classItem.classCode)}의 시간표가 저장되었습니다!`);
    } catch (err) {
      setMessage('학급 시간표 저장 중 오류가 발생했습니다.');
      window.alert('학급 시간표 저장에 실패했습니다.');
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
          <div className="flex justify-center mb-4">
            <SchoolLogo className="w-20 h-20 sm:w-24 sm:h-24 drop-shadow-sm" onClick={() => navigate('/')} />
          </div>
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800">관리자 로그인</h2>
            <p className="text-xs text-gray-500 mt-1">관리자 계정으로 로그인해 주세요.</p>
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
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-200 rounded-full transition cursor-pointer" title="메인으로">
              <ArrowLeft className="w-6 h-6 text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">시간표 관리자 페이지</h1>
              <p className="text-xs text-gray-500">선생님 및 학년반별 수업시간표 엑셀 업로드/다운로드 시스템</p>
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
                <span>관리자 ({currentUser?.id})</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1 text-xs text-gray-600 hover:text-red-600 bg-white hover:bg-red-50 border border-gray-200 hover:border-red-200 px-3 py-1.5 rounded-lg transition shadow-2xs cursor-pointer"
              title="로그아웃"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>로그아웃</span>
            </button>
          </div>
        </div>

        {/* Admin Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1.5 bg-gray-200/80 rounded-2xl mb-6 overflow-x-auto shadow-inner">
          <button
            type="button"
            onClick={() => setAdminTab('classes')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
              adminTab === 'classes'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
            }`}
          >
            <GraduationCap className="w-4 h-4 text-indigo-600" />
            <span>학년반별 수업시간표 (엑셀)</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-bold">
              {classes.length}개반
            </span>
          </button>

          <button
            type="button"
            onClick={() => setAdminTab('teachers')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
              adminTab === 'teachers'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
            }`}
          >
            <Users className="w-4 h-4 text-blue-600" />
            <span>선생님 시간표 관리</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded-full font-bold">
              {teachers.length}명
            </span>
          </button>

          <button
            type="button"
            onClick={() => setAdminTab('duties')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
              adminTab === 'duties'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
            }`}
          >
            <CalendarDays className="w-4 h-4 text-emerald-600" />
            <span>교문 및 급식 지도 관리</span>
          </button>

          <button
            type="button"
            onClick={() => setAdminTab('settings')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
              adminTab === 'settings'
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
            }`}
          >
            <KeyRound className="w-4 h-4 text-gray-600" />
            <span>계정 및 보안 설정</span>
          </button>
        </div>

        {message && (
          <div className={`p-4 rounded-xl mb-6 shadow-xs border ${
            message.includes('오류') || message.includes('잘못된') || message.includes('실패')
              ? 'bg-red-50 text-red-700 border-red-200' 
              : 'bg-green-50 text-green-800 border-green-200'
          }`}>
            {message}
          </div>
        )}

        {/* TAB 1: 학년반별 수업시간표 관리 (엑셀 업로드 & 다운로드) */}
        {adminTab === 'classes' && (
          <div className="space-y-6">
            {/* Class Excel Upload and Download Control Panel */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-1">
                  <GraduationCap className="w-5 h-5 text-indigo-600" />
                  학년반별 수업시간표 엑셀 업로드 및 다운로드
                </h2>
                <p className="text-xs text-gray-500">
                  컴시간 또는 나이스에서 내려받은 학년반별 수업시간표 엑셀 파일을 일괄 업로드하거나 현재 시간표를 엑셀로 내려받을 수 있습니다.
                </p>
              </div>

              {/* Upload Box */}
              <div className="bg-indigo-50/50 border-2 border-dashed border-indigo-200 hover:border-indigo-400 rounded-2xl p-6 transition flex flex-col items-center justify-center text-center">
                <Upload className={`w-10 h-10 ${loading ? 'animate-bounce text-indigo-500' : 'text-indigo-400'} mb-2`} />
                <span className="text-sm font-bold text-gray-800">
                  {loading ? '학년반 시간표 엑셀 정밀 분석 중...' : '학년반 수업시간표 엑셀 파일 (.xlsx, .xls) 업로드'}
                </span>
                <span className="text-xs text-gray-500 mt-1">
                  컴시간알리미 또는 학교 표준 엑셀 시간표를 지원합니다 (101~311 전체 학급 자동 파싱)
                </span>
                <label className="mt-4 inline-flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer active:scale-95">
                  <span>엑셀 파일 선택하기</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    onChange={handleClassExcelUpload}
                    className="hidden"
                    disabled={loading}
                  />
                </label>
              </div>

              {/* Download Buttons */}
              <div className="pt-2 border-t border-gray-100 flex flex-wrap gap-2.5 items-center justify-between">
                <div className="text-xs text-gray-600">
                  현재 등록된 학급: <strong className="text-indigo-700 font-bold">{classes.length}개 학급</strong>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadClassExcel}
                    disabled={loading || classes.length === 0}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer active:scale-95"
                    title="현재 등록된 1~3학년 전체 학급의 시간표를 엑셀 파일로 다운로드합니다"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
                    <span>학급별 시간표 엑셀 다운로드 (.xlsx)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadClassJsonBackup}
                    disabled={loading || classes.length === 0}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer"
                  >
                    <FileDown className="w-4 h-4 text-gray-500" />
                    <span>JSON 백업</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Class Timetable Explorer & Single Editor */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <span>학급별 수업시간표 확인 및 수정</span>
                    {currentSelectedClass && (
                      <span className="text-xs px-2.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-bold border border-indigo-100">
                        {formatClassTitle(currentSelectedClass.classCode)}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    학급을 선택하여 월~금 1~7교시 시간표를 확인하거나 교시별 과목 및 교사를 직접 수정할 수 있습니다.
                  </p>
                </div>

                {currentSelectedClass && (
                  <button
                    type="button"
                    onClick={() => setEditingClass(JSON.parse(JSON.stringify(currentSelectedClass)))}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer self-start sm:self-auto"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>이 학급 시간표 직접 수정</span>
                  </button>
                )}
              </div>

              {/* Grade Filter and Class Selector */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setClassGradeFilter('all')}
                      className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                        classGradeFilter === 'all'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      전체 ({classes.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setClassGradeFilter(1)}
                      className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                        classGradeFilter === 1
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      1학년 ({classes.filter(c => c.grade === 1).length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setClassGradeFilter(2)}
                      className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                        classGradeFilter === 2
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      2학년 ({classes.filter(c => c.grade === 2).length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setClassGradeFilter(3)}
                      className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                        classGradeFilter === 3
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      3학년 ({classes.filter(c => c.grade === 3).length})
                    </button>
                  </div>

                  <div className="w-48">
                    <input
                      type="text"
                      placeholder="학급 검색 (예: 101, 1-1)"
                      value={classSearchTerm}
                      onChange={(e) => setClassSearchTerm(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Class Chips List */}
                <div className="flex flex-wrap gap-1.5 p-2 bg-gray-50 rounded-xl border border-gray-100 max-h-32 overflow-y-auto">
                  {filteredClasses.map(c => {
                    const isSelected = selectedClassCode === c.classCode;
                    return (
                      <button
                        key={c.classCode}
                        type="button"
                        onClick={() => setSelectedClassCode(c.classCode)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-white hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 text-gray-700'
                        }`}
                      >
                        <span>{c.grade}학년 {c.classNum}반</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Current Class Weekly Timetable Table */}
              {currentSelectedClass ? (
                <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
                  <div className="bg-slate-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                    <div className="font-bold text-gray-900 text-sm">
                      {formatClassTitle(currentSelectedClass.classCode)} 주간 수업시간표
                    </div>
                    <div className="text-xs text-gray-500">
                      월요일 ~ 금요일 1~7교시
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-center border-collapse text-xs sm:text-sm">
                      <thead>
                        <tr className="bg-gray-100/80 text-gray-700 border-b border-gray-200">
                          <th className="py-2.5 px-3 border-r border-gray-200 w-16 font-bold">교시</th>
                          {weekdays.map(d => (
                            <th key={d.key} className="py-2.5 px-3 border-r border-gray-200 last:border-r-0 font-bold">
                              {d.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {periods.map(p => (
                          <tr key={p.period} className="hover:bg-slate-50/50 transition">
                            <td className="py-2.5 px-2 border-r border-gray-200 font-bold bg-gray-50 text-gray-700 text-xs">
                              {p.period}교시
                            </td>
                            {weekdays.map(d => {
                              const lessonText = currentSelectedClass.timetable[d.key]?.[p.period] || '';
                              const isFriday6 = d.key === 'Fri' && p.period === 6;
                              const hasLesson = Boolean(lessonText.trim());

                              return (
                                <td key={d.key} className="py-2 px-2 border-r border-gray-200 last:border-r-0">
                                  {hasLesson || isFriday6 ? (
                                    <div className={`p-1 rounded-md ${
                                      isFriday6
                                        ? 'bg-indigo-50/90 border-2 border-indigo-400 font-bold text-indigo-950 flex items-center justify-center gap-1'
                                        : 'bg-indigo-50/70 border border-indigo-100 font-bold text-indigo-950'
                                    }`}>
                                      <div className="text-xs truncate">
                                        {lessonText}
                                      </div>
                                      {isFriday6 && (
                                        <span className="text-[10px] bg-indigo-600 text-white px-1 py-0.2 rounded font-extrabold leading-none">
                                          HR
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-gray-300 text-xs">-</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-sm text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  선택된 학급이 없습니다. 위에서 학급을 선택해주세요.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: 선생님 시간표 관리 (엑셀/PDF 업로드, 다운로드, 편집) */}
        {adminTab === 'teachers' && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-8">
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

          {/* Data Protection & Backup Section */}
          <section className="bg-gradient-to-br from-emerald-50/70 via-teal-50/40 to-blue-50/50 border border-emerald-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center shrink-0 shadow-2xs">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    시간표 데이터 실시간 보호 및 백업
                    <span className="text-xs px-2 py-0.5 bg-emerald-100/80 text-emerald-800 rounded-full font-bold border border-emerald-300/50">
                      총 {teachers.length}명 안전 보존 중
                    </span>
                  </h3>
                  <p className="text-xs text-gray-600 mt-0.5">
                    개별 선생님 수정 시 다른 선생님의 데이터는 100% 안전하게 보호되며, 모든 변경 시 자동 백업 스냅샷이 생성됩니다.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleDownloadExcel}
                disabled={loading || teachers.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition active:scale-95"
                title="현재 등록된 모든 선생님 시간표를 엑셀(.xlsx) 파일로 다운로드합니다 (종합시간표 + 수업상세목록)"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
                시간표 엑셀 다운로드 (.xlsx)
              </button>

              <button
                type="button"
                onClick={handleDownloadJsonBackup}
                disabled={loading || teachers.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-bold shadow-2xs transition hover:border-emerald-400"
                title="현재 등록된 모든 선생님 시간표를 PC에 JSON 파일로 다운로드합니다"
              >
                <FileDown className="w-4 h-4 text-emerald-600" />
                시간표 백업 다운로드 (.json)
              </button>

              <button
                type="button"
                onClick={handleCreateManualBackup}
                disabled={loading || teachers.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-blue-50 border border-blue-300 text-blue-800 rounded-xl text-xs font-bold shadow-2xs transition hover:border-blue-400"
                title="현재 상태를 서버 스냅샷으로 즉시 백업합니다"
              >
                <Download className="w-4 h-4 text-blue-600" />
                현재 상태 즉시 백업
              </button>

              <button
                type="button"
                onClick={handleOpenBackupModal}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 rounded-xl text-xs font-bold shadow-2xs transition"
                title="과거에 저장된 백업 목록을 확인하고 원하는 시점으로 복원합니다"
              >
                <History className="w-4 h-4 text-gray-600" />
                백업 기록 보기 및 복원
              </button>
            </div>
          </section>

          {/* Monthly Gate Duty Management & Excel Upload Section */}
          <AdminGateDutyManager teachers={teachers} onMessage={setMessage} />

          {/* Monthly Lunch Duty Management & Excel Upload Section */}
          <AdminLunchDutyManager onMessage={setMessage} />

          <hr className="border-gray-100" />

          {/* Individual Teacher Management Section */}
          <section>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">선생님 개별 관리 및 시간표 입력 수정</h2>
                <p className="text-xs text-gray-500">선생님을 검색하여 시간표를 직접 입력/수정하거나 새 선생님을 등록할 수 있습니다.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddTeacherModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition shadow-xs"
              >
                <UserPlus className="w-4 h-4" /> 새 선생님 추가
              </button>
            </div>

            {/* Teacher Search Bar */}
            {teachers.length > 0 && (
              <div className="mb-4 space-y-1.5">
                <div className="relative flex items-center">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3.5 pointer-events-none" />
                  <input
                    type="text"
                    value={teacherSearchTerm}
                    onChange={(e) => setTeacherSearchTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && filteredTeachers.length > 0) {
                        e.preventDefault();
                        setEditingTeacher(JSON.parse(JSON.stringify(filteredTeachers[0])));
                      }
                    }}
                    placeholder="선생님 성함 또는 담임 학급 검색 (예: 김선생, ㄱㅅㅅ, 1-1, 102)"
                    className="w-full pl-10 pr-24 py-2.5 bg-gray-50 hover:bg-white focus:bg-white border border-gray-200 focus:border-blue-500 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition placeholder:text-gray-400"
                  />
                  <div className="absolute right-2.5 flex items-center gap-1.5">
                    {teacherSearchTerm && (
                      <button
                        type="button"
                        onClick={() => setTeacherSearchTerm('')}
                        className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition"
                        title="검색어 지우기"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <span className="text-[11px] font-semibold px-2 py-1 bg-white border border-gray-200 rounded-lg text-gray-600 shadow-2xs">
                      {teacherSearchTerm.trim() ? `${filteredTeachers.length}명` : `전체 ${teachers.length}명`}
                    </span>
                  </div>
                </div>

                {teacherSearchTerm.trim() && (
                  <div className="flex items-center justify-between px-1 text-xs text-gray-500">
                    <span>
                      '<strong className="text-gray-800">{teacherSearchTerm}</strong>' 검색 결과{' '}
                      <strong className="text-blue-600 font-bold">{filteredTeachers.length}명</strong>
                      {filteredTeachers.length > 0 && (
                        <span className="text-gray-400 ml-2 hidden sm:inline">
                          (Enter를 누르면 '{filteredTeachers[0].name}' 선생님 시간표 수정 창이 열립니다)
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setTeacherSearchTerm('')}
                      className="text-blue-600 hover:underline font-medium text-xs ml-2 shrink-0"
                    >
                      검색 초기화
                    </button>
                  </div>
                )}
              </div>
            )}

            {teachers.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-gray-500 text-sm">
                등록된 선생님이 없습니다. 위에서 파일을 업로드하거나 '새 선생님 추가' 버튼을 눌러주세요.
              </div>
            ) : filteredTeachers.length === 0 ? (
              <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-gray-500 text-sm space-y-2">
                <p className="font-medium text-gray-700">'{teacherSearchTerm}'에 해당하는 선생님을 찾을 수 없습니다.</p>
                <p className="text-xs text-gray-400">선생님 성함 또는 초성(예: ㄱㅅㅅ), 담임 학급(예: 1-1)으로 다시 검색해 보세요.</p>
                <button
                  type="button"
                  onClick={() => setTeacherSearchTerm('')}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold shadow-2xs transition"
                >
                  <X className="w-3.5 h-3.5" /> 검색어 초기화
                </button>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10 shadow-2xs">
                    <tr>
                      <th className="py-3 px-4 font-semibold text-gray-700">선생님 성함</th>
                      <th className="py-3 px-4 font-semibold text-gray-700">담임 학급</th>
                      <th className="py-3 px-4 font-semibold text-gray-700">수업 시수</th>
                      <th className="py-3 px-4 font-semibold text-gray-700 text-right">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {filteredTeachers.map((t) => {
                      const totalPeriods = getTeacherTotalPeriods(t);
                      return (
                        <tr key={t.name} className="hover:bg-blue-50/40 transition group">
                          <td className="py-3 px-4 font-medium text-gray-900 flex items-center gap-2.5">
                            <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-xs shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                              {t.name.charAt(0)}
                            </div>
                            <div>
                              <div className="font-bold text-gray-900">{t.name}</div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-gray-600">
                            {t.homeroom ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-800">
                                {t.homeroom}반
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">담임 없음</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {totalPeriods > 0 ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                                주 {totalPeriods}시간
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200/60">
                                미입력
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setEditingTeacher(JSON.parse(JSON.stringify(t)))}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white rounded-lg text-xs font-bold transition shadow-2xs"
                              title={`${t.name} 선생님 시간표 입력 및 수정`}
                            >
                              <Edit3 className="w-3.5 h-3.5" /> 시간표 입력/수정
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTeacher(t.name)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-gray-50 hover:bg-red-50 text-gray-500 hover:text-red-600 rounded-lg text-xs font-medium transition"
                              title={`${t.name} 선생님 삭제`}
                            >
                              <Trash2 className="w-3.5 h-3.5" /> 삭제
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: 교문 및 급식 지도 관리 */}
      {adminTab === 'duties' && (
        <div className="space-y-6">
          <AdminGateDutyManager teachers={teachers} onMessage={(msg) => setMessage(msg)} />
          <AdminLunchDutyManager onMessage={(msg) => setMessage(msg)} />
        </div>
      )}

      {/* TAB 4: 계정 및 보안 설정 */}
      {adminTab === 'settings' && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-8">
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
                    className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 border transition cursor-pointer ${
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
                    className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 border transition cursor-pointer ${
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer"
                  >
                    {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading || newPassword.length < 4}
                className="flex items-center justify-center gap-2 w-full bg-gray-800 text-white font-medium py-2 rounded-lg hover:bg-gray-900 transition disabled:opacity-50 cursor-pointer"
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
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 font-medium rounded-lg hover:bg-red-100 transition cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              데이터 초기화
            </button>
          </section>
        </div>
      )}
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
            <div className="flex items-center justify-between border-b pb-4 flex-wrap gap-3">
              <div>
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-600" />
                  <span className="text-blue-700">{editingTeacher.name}</span> 선생님 시간표 직접 입력 및 수정
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">요일별, 교시별 수업 학급 또는 강의실을 입력하세요 (예: 1-1, 203)</p>
              </div>
              <div className="flex items-center gap-3">
                {teachers.length > 1 && (
                  <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs">
                    <span className="text-gray-500 font-medium shrink-0">선생님 전환:</span>
                    <select
                      value={editingTeacher.name}
                      onChange={(e) => {
                        const target = teachers.find(t => t.name === e.target.value);
                        if (target) {
                          setEditingTeacher(JSON.parse(JSON.stringify(target)));
                        }
                      }}
                      className="bg-transparent font-bold text-gray-800 outline-none cursor-pointer hover:text-blue-600 transition"
                    >
                      {[...teachers].sort((a, b) => a.name.localeCompare(b.name, 'ko')).map(t => (
                        <option key={t.name} value={t.name}>
                          {t.name} {t.homeroom ? `(${t.homeroom}반)` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <button onClick={() => setEditingTeacher(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4 bg-blue-50/60 p-3 rounded-xl border border-blue-100/60">
              <label className="text-sm font-semibold text-gray-700">담임 학급:</label>
              <input
                type="text"
                value={editingTeacher.homeroom || ''}
                onChange={(e) => setEditingTeacher({ ...editingTeacher, homeroom: e.target.value })}
                placeholder="예: 1-1"
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500 w-32 font-medium"
              />
              <span className="text-xs text-gray-500">담임이 아닐 경우 비워두세요.</span>
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

      {/* Backup History and Restore Modal */}
      {showBackupModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-gray-100 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-gray-700" />
                <h3 className="text-lg font-bold text-gray-900">시간표 백업 기록 및 복원</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBackupModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg text-gray-500 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-500 leading-relaxed">
              수정이나 업로드 시 서버에 안전하게 자동 저장된 백업 스냅샷 목록입니다. 언제든지 과거 시점의 데이터로 완벽하게 되돌릴 수 있습니다.
            </p>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[200px]">
              {loadingBackups ? (
                <div className="text-center py-12 text-sm text-gray-500">백업 목록을 불러오는 중...</div>
              ) : backups.length === 0 ? (
                <div className="text-center py-12 text-sm text-gray-400 bg-gray-50 rounded-xl">
                  아직 저장된 백업 스냅샷이 없습니다.<br />
                  <span className="text-xs text-gray-400">('현재 상태 즉시 백업'을 클릭하시면 지금 바로 백업이 생성됩니다)</span>
                </div>
              ) : (
                backups.map((b) => (
                  <div key={b.filename} className="p-3.5 bg-gray-50 hover:bg-gray-100/80 rounded-xl border border-gray-200/70 flex items-center justify-between gap-3 transition">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-800">
                          {new Date(b.createdAt).toLocaleString('ko-KR', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        <span className="px-2 py-0.5 text-[11px] bg-emerald-100 text-emerald-800 font-bold rounded-md">
                          {b.teacherCount}명 보존
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 font-mono mt-0.5 truncate max-w-[240px]">
                        {b.filename}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRestoreBackupClick(b.filename, b.teacherCount)}
                      disabled={loading}
                      className="shrink-0 flex items-center gap-1 text-xs px-3 py-1.5 bg-white hover:bg-emerald-50 border border-emerald-300 text-emerald-700 font-semibold rounded-lg shadow-2xs transition"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> 복원
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t flex justify-between items-center">
              <button
                type="button"
                onClick={handleCreateManualBackup}
                disabled={loading}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                + 지금 즉시 새 백업 만들기
              </button>
              <button
                type="button"
                onClick={() => setShowBackupModal(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-xl transition"
              >
                닫기
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
      {/* Edit Class Timetable Modal */}
      {editingClass && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-xl border border-gray-100 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-indigo-600" />
                  <span>{formatClassTitle(editingClass.classCode)} 수업시간표 직접 수정</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  각 요일 및 교시의 과목명과 담당 교사를 직접 수정할 수 있습니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingClass(null)}
                className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-center border-collapse text-xs">
                  <thead className="bg-gray-100/90 text-gray-700 sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-2 border-r border-gray-200 w-14 font-bold">교시</th>
                      {weekdays.map(d => (
                        <th key={d.key} className="py-2.5 px-2 border-r border-gray-200 last:border-r-0 font-bold">
                          {d.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {periods.map(p => (
                      <tr key={p.period}>
                        <td className="py-2 px-1 border-r border-gray-200 font-bold bg-gray-50 text-gray-700">
                          {p.period}교시
                        </td>
                        {weekdays.map(d => {
                          const currentTeacher = editingClass.timetable[d.key]?.[p.period] || '';
                          return (
                            <td key={d.key} className="p-1.5 border-r border-gray-200 last:border-r-0">
                              <input
                                type="text"
                                placeholder="교사명"
                                value={currentTeacher}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setEditingClass(prev => {
                                    if (!prev) return null;
                                    const next = { ...prev, timetable: { ...prev.timetable } };
                                    if (!next.timetable[d.key]) next.timetable[d.key] = {};
                                    next.timetable[d.key][p.period] = val;
                                    return next;
                                  });
                                }}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-medium text-gray-800 placeholder:text-gray-300 bg-white"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t">
              <button
                type="button"
                onClick={() => setEditingClass(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => editingClass && handleSaveClassTimetable(editingClass)}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer active:scale-95"
              >
                <Check className="w-4 h-4" />
                <span>시간표 변경사항 저장</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subtle Copyright Notice */}
      <Footer />
    </div>
  );
};
