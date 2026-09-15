import React, { useState, useEffect, useMemo } from 'react';
import { 
  Utensils, 
  Upload, 
  FileSpreadsheet, 
  FileDown, 
  Calendar, 
  Plus, 
  Trash2, 
  Edit3, 
  Check, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  AlertCircle,
  Save
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { LunchDutyDay, LunchDutyMonthRecord } from '../types/lunchDuty';
import { 
  fetchLunchDutyMonth, 
  saveLunchDutyMonth, 
  parseLunchDutyExcel, 
  exportLunchDutyToExcel, 
  downloadLunchDutyTemplateExcel 
} from '../lib/lunchDutyStore';
import { getKSTDate } from '../lib/gateDutyStore';

interface AdminLunchDutyManagerProps {
  onMessage?: (msg: string) => void;
}

export const AdminLunchDutyManager: React.FC<AdminLunchDutyManagerProps> = ({ onMessage }) => {
  const kst = getKSTDate();
  const [selectedYear, setSelectedYear] = useState<number>(kst.year);
  const [selectedMonth, setSelectedMonth] = useState<number>(kst.month);
  const [record, setRecord] = useState<LunchDutyMonthRecord | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Editing state for single day inline
  const [editingDayId, setEditingDayId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState<string>('');
  const [editDayOfWeek, setEditDayOfWeek] = useState<string>('월요일');
  const [editGeneral, setEditGeneral] = useState<string>('');
  const [editGrade3, setEditGrade3] = useState<string>('');
  const [editGrade2, setEditGrade2] = useState<string>('');
  const [editGrade1, setEditGrade1] = useState<string>('');
  const [editNote, setEditNote] = useState<string>('');

  // Add new day state
  const [isAddingNew, setIsAddingNew] = useState<boolean>(false);

  const yearMonthString = useMemo(() => {
    return `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
  }, [selectedYear, selectedMonth]);

  // Load record whenever yearMonth changes
  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchLunchDutyMonth(yearMonthString);
        if (isMounted) {
          setRecord(data);
        }
      } catch (err) {
        console.error('Failed to load lunch duties:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [yearMonthString]);

  // Handle Month Navigation
  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedYear(selectedYear - 1);
      setSelectedMonth(12);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedYear(selectedYear + 1);
      setSelectedMonth(1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  // Upload and parse Excel / PDF / CSV
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      // First try server-side AI / smart parser if available
      const formData = new FormData();
      formData.append('file', file);
      formData.append('year', String(selectedYear));
      formData.append('month', String(selectedMonth));

      let parsedRecord: LunchDutyMonthRecord | null = null;

      try {
        const res = await fetch('/api/parse-lunch-duty', {
          method: 'POST',
          body: formData,
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.record && Array.isArray(json.record.duties)) {
            parsedRecord = json.record;
          }
        }
      } catch (err) {
        console.warn('Server parse fallback to client-side XLSX parser:', err);
      }

      // Fallback: client-side XLSX parsing
      if (!parsedRecord && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv'))) {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
        parsedRecord = parseLunchDutyExcel(wb, selectedYear, selectedMonth);
      }

      if (!parsedRecord || !parsedRecord.duties || parsedRecord.duties.length === 0) {
        throw new Error('파일에서 급식감독 일정을 추출하지 못했습니다. 파일 서식을 확인해 주세요.');
      }

      if (parsedRecord.year && parsedRecord.month) {
        setSelectedYear(parsedRecord.year);
        setSelectedMonth(parsedRecord.month);
      }

      // Save to server & Firestore
      await saveLunchDutyMonth(parsedRecord);
      setRecord(parsedRecord);

      const msg = `${parsedRecord.year}년 ${parsedRecord.month}월 급식감독 명단(총 ${parsedRecord.duties.length}일)이 성공적으로 업로드 및 저장되었습니다!`;
      if (onMessage) onMessage(msg);
      window.alert(msg);
    } catch (err) {
      console.error('File upload failed:', err);
      const errMsg = err instanceof Error ? err.message : '급식감독 파일 업로드 중 오류가 발생했습니다.';
      if (onMessage) onMessage(errMsg);
      window.alert(errMsg);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  // Start editing single day
  const handleStartEdit = (day: LunchDutyDay) => {
    setEditingDayId(day.id);
    setEditDate(day.date);
    setEditDayOfWeek(day.dayOfWeek || '월요일');
    setEditGeneral(day.generalTeacher || (day.teachers && day.teachers[0]) || '');
    setEditGrade3(day.grade3Teacher || (day.teachers && day.teachers[1]) || '');
    setEditGrade2(day.grade2Teacher || (day.teachers && day.teachers[2]) || '');
    setEditGrade1(day.grade1Teacher || (day.teachers && day.teachers[3]) || '');
    setEditNote(day.note || '');
  };

  // Save edited day
  const handleSaveEdit = async () => {
    if (!record || !editingDayId) return;

    const g = editGeneral.trim();
    const g3 = editGrade3.trim();
    const g2 = editGrade2.trim();
    const g1 = editGrade1.trim();
    const teachersList = [g, g3, g2, g1].filter(Boolean);

    if (teachersList.length === 0) {
      window.alert('최소 1명 이상의 급식감독 선생님 성함을 입력해주세요.');
      return;
    }

    const updatedDuties = record.duties.map(d => {
      if (d.id === editingDayId) {
        return {
          ...d,
          dayOfWeek: editDayOfWeek,
          generalTeacher: g,
          grade3Teacher: g3,
          grade2Teacher: g2,
          grade1Teacher: g1,
          teachers: teachersList,
          note: editNote.trim(),
        };
      }
      return d;
    });

    const updatedRecord: LunchDutyMonthRecord = {
      ...record,
      duties: updatedDuties,
    };

    setLoading(true);
    try {
      await saveLunchDutyMonth(updatedRecord);
      setRecord(updatedRecord);
      setEditingDayId(null);
      if (onMessage) onMessage('급식감독 배정이 수정되었습니다.');
    } catch (err) {
      window.alert('수정 사항 저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // Delete single day
  const handleDeleteDay = async (dayId: string) => {
    if (!record) return;
    if (!window.confirm('이 날짜의 급식감독 배정을 삭제하시겠습니까?')) return;

    const updatedDuties = record.duties.filter(d => d.id !== dayId);
    const updatedRecord: LunchDutyMonthRecord = {
      ...record,
      duties: updatedDuties,
    };

    setLoading(true);
    try {
      await saveLunchDutyMonth(updatedRecord);
      setRecord(updatedRecord);
      if (onMessage) onMessage('급식감독 배정 날짜가 삭제되었습니다.');
    } catch (err) {
      window.alert('삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // Add new day manually
  const handleAddNewDay = async () => {
    if (!record) return;
    if (!editDate || !/^\d{4}-\d{2}-\d{2}$/.test(editDate)) {
      window.alert('날짜 형식을 확인해주세요. (예: 2026-09-15)');
      return;
    }

    const g = editGeneral.trim();
    const g3 = editGrade3.trim();
    const g2 = editGrade2.trim();
    const g1 = editGrade1.trim();
    const teachersList = [g, g3, g2, g1].filter(Boolean);

    if (teachersList.length === 0) {
      window.alert('최소 1명 이상의 지도교사 성함을 입력해주세요.');
      return;
    }

    const parts = editDate.split('-').map(Number);
    const m = parts[1];
    const d = parts[2];

    // Check if duplicate date
    if (record.duties.some(item => item.date === editDate)) {
      window.alert('이미 등록된 날짜입니다. 기존 배정을 수정해 주세요.');
      return;
    }

    const newDay: LunchDutyDay = {
      id: editDate,
      date: editDate,
      month: m,
      day: d,
      dayOfWeek: editDayOfWeek,
      generalTeacher: g,
      grade3Teacher: g3,
      grade2Teacher: g2,
      grade1Teacher: g1,
      teachers: teachersList,
      note: editNote.trim(),
    };

    const newDuties = [...record.duties, newDay].sort((a, b) => a.date.localeCompare(b.date));
    const updatedRecord: LunchDutyMonthRecord = {
      ...record,
      duties: newDuties,
    };

    setLoading(true);
    try {
      await saveLunchDutyMonth(updatedRecord);
      setRecord(updatedRecord);
      setIsAddingNew(false);
      setEditGeneral('');
      setEditGrade3('');
      setEditGrade2('');
      setEditGrade1('');
      setEditNote('');
      if (onMessage) onMessage('새 급식감독 배정이 추가되었습니다.');
    } catch (err) {
      window.alert('배정 추가 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // Download blank template for current month
  const handleDownloadTemplate = () => {
    downloadLunchDutyTemplateExcel(selectedYear, selectedMonth);
    if (onMessage) onMessage(`${selectedMonth}월 급식감독 엑셀 양식이 다운로드되었습니다.`);
  };

  // Export current month duties to Excel
  const handleExportCurrentMonth = () => {
    if (!record || record.duties.length === 0) {
      window.alert('내보낼 급식감독 데이터가 없습니다.');
      return;
    }
    exportLunchDutyToExcel(record);
    if (onMessage) onMessage(`${record.year}년 ${record.month}월 급식감독 엑셀 파일이 다운로드되었습니다.`);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5 sm:p-6 space-y-6">
      {/* Header & Month Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
              <Utensils className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-gray-900 leading-tight">
                <span className="block">월별 급식감독 선생님 명단 관리</span>
                <span className="block text-amber-600">및 엑셀 업로드</span>
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                월별 급식감독(총괄/3학년/2학년/1학년) 명단을 엑셀 파일로 등록하고 수정합니다.
              </p>
            </div>
          </div>
        </div>

        {/* Month Selector Controls */}
        <div className="flex items-center gap-1.5 self-start md:self-auto bg-gray-50 p-1.5 rounded-xl border border-gray-200">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-1.5 hover:bg-white rounded-lg text-gray-600 hover:text-gray-900 transition shadow-2xs"
            title="이전 달"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1 px-2">
            <Calendar className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-bold text-gray-800 whitespace-nowrap">
              {selectedYear}년 {selectedMonth}월
            </span>
          </div>

          <button
            type="button"
            onClick={handleNextMonth}
            className="p-1.5 hover:bg-white rounded-lg text-gray-600 hover:text-gray-900 transition shadow-2xs"
            title="다음 달"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Upload Box & Template Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Upload File Drag/Click Box */}
        <label className="md:col-span-2 relative flex flex-col items-center justify-center p-5 border-2 border-dashed border-amber-200 hover:border-amber-400 bg-amber-50/40 hover:bg-amber-50/70 rounded-xl cursor-pointer transition group">
          <div className="flex items-center gap-3 text-center sm:text-left">
            <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center group-hover:scale-105 transition-transform shadow-xs">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800 group-hover:text-amber-700 transition">
                {selectedYear}년 {selectedMonth}월 급식감독 엑셀 파일 업로드
              </p>
              <p className="text-xs text-gray-500">
                .xlsx, .xls, .csv 지원 (일자, 총괄, 3학년, 2학년, 1학년, 비고 컬럼 자동 인식)
              </p>
            </div>
          </div>
          <input
            type="file"
            accept=".xlsx,.xls,.csv,.pdf,image/*"
            onChange={handleFileUpload}
            disabled={loading}
            className="hidden"
          />
        </label>

        {/* Template & Export Quick Buttons */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="flex items-center justify-center gap-2 px-3.5 py-2.5 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 text-xs font-bold rounded-xl transition shadow-2xs"
            title="날짜와 요일, 총괄/학년별 컬럼이 채워진 빈 엑셀 양식을 다운로드합니다"
          >
            <FileDown className="w-4 h-4 text-amber-600" />
            {selectedMonth}월 엑셀 양식 다운로드
          </button>

          <button
            type="button"
            onClick={handleExportCurrentMonth}
            disabled={!record || record.duties.length === 0}
            className="flex items-center justify-center gap-2 px-3.5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition shadow-xs disabled:opacity-50"
            title="현재 월의 등록된 급식감독 명단을 엑셀 파일로 저장합니다"
          >
            <FileSpreadsheet className="w-4 h-4 text-amber-100" />
            현재 월 엑셀 다운로드
          </button>
        </div>
      </div>

      {/* Schedule Table Header with Add Button */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-bold text-gray-800">
            {selectedYear}년 {selectedMonth}월 급식감독 배정 현황
          </h4>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-semibold">
            총 {record?.duties.length || 0}일 배정됨
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            setIsAddingNew(!isAddingNew);
            const mPad = String(selectedMonth).padStart(2, '0');
            setEditDate(`${selectedYear}-${mPad}-01`);
            setEditDayOfWeek('월요일');
            setEditGeneral('');
            setEditGrade3('');
            setEditGrade2('');
            setEditGrade1('');
            setEditNote('');
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-lg text-xs font-bold transition shadow-2xs"
        >
          <Plus className="w-3.5 h-3.5 text-amber-600" />
          날짜 직접 추가
        </button>
      </div>

      {/* Add New Day Form */}
      {isAddingNew && (
        <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl space-y-3">
          <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            새 날짜 급식 감독 배정 추가
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-7 gap-2.5">
            <div className="sm:col-span-1">
              <label className="block text-[11px] font-bold text-gray-700 mb-1">날짜 (YYYY-MM-DD)</label>
              <input
                type="text"
                value={editDate}
                onChange={e => setEditDate(e.target.value)}
                placeholder="예: 2026-09-01"
                className="w-full text-xs px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div className="sm:col-span-1">
              <label className="block text-[11px] font-bold text-gray-700 mb-1">요일</label>
              <select
                value={editDayOfWeek}
                onChange={e => setEditDayOfWeek(e.target.value)}
                className="w-full text-xs px-2 py-1.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="월요일">월요일</option>
                <option value="화요일">화요일</option>
                <option value="수요일">수요일</option>
                <option value="목요일">목요일</option>
                <option value="금요일">금요일</option>
              </select>
            </div>
            <div className="sm:col-span-1">
              <label className="block text-[11px] font-bold text-purple-800 mb-1">총괄지도</label>
              <input
                type="text"
                value={editGeneral}
                onChange={e => setEditGeneral(e.target.value)}
                placeholder="총괄 교사 성함"
                className="w-full text-xs px-2.5 py-1.5 bg-white border border-purple-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div className="sm:col-span-1">
              <label className="block text-[11px] font-bold text-blue-800 mb-1">3학년</label>
              <input
                type="text"
                value={editGrade3}
                onChange={e => setEditGrade3(e.target.value)}
                placeholder="3학년 교사 성함"
                className="w-full text-xs px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="sm:col-span-1">
              <label className="block text-[11px] font-bold text-emerald-800 mb-1">2학년</label>
              <input
                type="text"
                value={editGrade2}
                onChange={e => setEditGrade2(e.target.value)}
                placeholder="2학년 교사 성함"
                className="w-full text-xs px-2.5 py-1.5 bg-white border border-emerald-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="sm:col-span-1">
              <label className="block text-[11px] font-bold text-amber-800 mb-1">1학년</label>
              <input
                type="text"
                value={editGrade1}
                onChange={e => setEditGrade1(e.target.value)}
                placeholder="1학년 교사 성함"
                className="w-full text-xs px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div className="sm:col-span-1">
              <label className="block text-[11px] font-bold text-gray-700 mb-1">비고</label>
              <input
                type="text"
                value={editNote}
                onChange={e => setEditNote(e.target.value)}
                placeholder="메모 (선택)"
                className="w-full text-xs px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsAddingNew(false)}
              className="px-3 py-1.5 bg-white border border-gray-300 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleAddNewDay}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-xs transition"
            >
              배정 추가 완료
            </button>
          </div>
        </div>
      )}

      {/* Duty Table */}
      <div className="border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-gray-50 text-gray-600 border-b border-gray-200 font-bold uppercase tracking-wider">
            <tr>
              <th className="py-2.5 px-3 whitespace-nowrap">날짜 / 요일</th>
              <th className="py-2.5 px-3 whitespace-nowrap text-purple-900">총괄지도</th>
              <th className="py-2.5 px-3 whitespace-nowrap text-blue-900">3학년</th>
              <th className="py-2.5 px-3 whitespace-nowrap text-emerald-900">2학년</th>
              <th className="py-2.5 px-3 whitespace-nowrap text-amber-900">1학년</th>
              <th className="py-2.5 px-3 whitespace-nowrap">비고</th>
              <th className="py-2.5 px-3 whitespace-nowrap text-right">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-gray-400 text-xs">
                  데이터를 불러오는 중입니다...
                </td>
              </tr>
            ) : !record || record.duties.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-gray-400 text-xs space-y-1">
                  <AlertCircle className="w-5 h-5 mx-auto text-gray-300 mb-1" />
                  <p>등록된 급식감독 배정이 없습니다.</p>
                  <p className="text-[11px] text-gray-400">위 엑셀 업로드 또는 [날짜 직접 추가] 버튼을 이용해 등록해 주세요.</p>
                </td>
              </tr>
            ) : (
              record.duties.map(day => {
                const isEditing = editingDayId === day.id;

                if (isEditing) {
                  return (
                    <tr key={day.id} className="bg-amber-50/70">
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className="font-bold text-gray-800">{day.date}</span>
                        <select
                          value={editDayOfWeek}
                          onChange={e => setEditDayOfWeek(e.target.value)}
                          className="ml-1 text-[11px] px-1 py-0.5 border border-gray-300 rounded bg-white"
                        >
                          <option value="월요일">월요일</option>
                          <option value="화요일">화요일</option>
                          <option value="수요일">수요일</option>
                          <option value="목요일">목요일</option>
                          <option value="금요일">금요일</option>
                        </select>
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={editGeneral}
                          onChange={e => setEditGeneral(e.target.value)}
                          placeholder="총괄 교사"
                          className="w-24 text-xs px-2 py-1 bg-white border border-purple-300 rounded focus:ring-1 focus:ring-purple-500 font-semibold text-purple-900"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={editGrade3}
                          onChange={e => setEditGrade3(e.target.value)}
                          placeholder="3학년 교사"
                          className="w-24 text-xs px-2 py-1 bg-white border border-blue-300 rounded focus:ring-1 focus:ring-blue-500 font-semibold text-blue-900"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={editGrade2}
                          onChange={e => setEditGrade2(e.target.value)}
                          placeholder="2학년 교사"
                          className="w-24 text-xs px-2 py-1 bg-white border border-emerald-300 rounded focus:ring-1 focus:ring-emerald-500 font-semibold text-emerald-900"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={editGrade1}
                          onChange={e => setEditGrade1(e.target.value)}
                          placeholder="1학년 교사"
                          className="w-24 text-xs px-2 py-1 bg-white border border-amber-300 rounded focus:ring-1 focus:ring-amber-500 font-semibold text-amber-900"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={editNote}
                          onChange={e => setEditNote(e.target.value)}
                          placeholder="비고"
                          className="w-28 text-xs px-2 py-1 bg-white border border-gray-300 rounded focus:ring-1 focus:ring-amber-500"
                        />
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap space-x-1">
                        <button
                          type="button"
                          onClick={handleSaveEdit}
                          className="p-1 text-emerald-700 bg-emerald-100 hover:bg-emerald-200 rounded transition"
                          title="저장"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingDayId(null)}
                          className="p-1 text-gray-500 bg-gray-100 hover:bg-gray-200 rounded transition"
                          title="취소"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                }

                const gen = day.generalTeacher || (day.teachers && day.teachers[0]) || '-';
                const g3 = day.grade3Teacher || (day.teachers && day.teachers[1]) || '-';
                const g2 = day.grade2Teacher || (day.teachers && day.teachers[2]) || '-';
                const g1 = day.grade1Teacher || (day.teachers && day.teachers[3]) || '-';

                return (
                  <tr key={day.id} className="hover:bg-gray-50/80 transition">
                    <td className="py-2.5 px-3 whitespace-nowrap font-medium text-gray-900">
                      <span>{day.month}월 {String(day.day).padStart(2, '0')}일</span>
                      <span className="text-gray-400 text-[11px] ml-1">({day.dayOfWeek ? day.dayOfWeek[0] : ''})</span>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 font-bold text-purple-900 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-md text-[11px]">
                        {gen}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 font-bold text-blue-900 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md text-[11px]">
                        {g3}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 font-bold text-emerald-900 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md text-[11px]">
                        {g2}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 font-bold text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md text-[11px]">
                        {g1}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-gray-500 whitespace-nowrap">
                      {day.note ? (
                        <span className="text-rose-600 font-semibold bg-rose-50 px-1.5 py-0.5 rounded text-[11px]">
                          {day.note}
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-1">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(day)}
                        className="p-1.5 text-gray-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition"
                        title="수정"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDay(day.id)}
                        className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        title="삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
